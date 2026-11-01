import * as geoipModule from 'geoip-lite';

/**
 * Resolver de lookup compatible con CJS y TypeScript sin esModuleInterop.
 */
function lookupGeoIp(ip: string): geoipModule.Lookup | null {
  try {
    const geo =
      (geoipModule as unknown as { default?: typeof geoipModule }).default ||
      geoipModule;
    if (typeof geo.lookup === 'function') {
      return geo.lookup(ip);
    }
    // Fallback dinámico
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const requiredGeo = require('geoip-lite');
    return requiredGeo.lookup ? requiredGeo.lookup(ip) : null;
  } catch {
    return null;
  }
}

/**
 * Cabeceras comunes enviadas por CDNs y proxies inversos para el código de país ISO-3166-1 alpha-2.
 */
const COUNTRY_HEADERS = [
  'cf-ipcountry', // Cloudflare
  'x-country-code', // Nginx con módulo GeoIP / proxies estándar
  'x-geo-country', // Convención alternativa de Nginx
  'cloudfront-viewer-country', // AWS CloudFront
  'fastly-client-country', // Fastly CDN
] as const;

/**
 * Cabeceras para extraer la dirección IP real del visitante detrás de proxies en cadena.
 */
const IP_HEADERS = [
  'cf-connecting-ip', // Cloudflare
  'x-real-ip', // Nginx proxy_set_header X-Real-IP $remote_addr;
  'x-forwarded-for', // Lista separada por comas (cliente, proxy1, proxy2...)
] as const;

/**
 * Validador de código de país ISO 3166-1 alpha-2 válido (2 letras mayúsculas, excluyendo 'XX' de Cloudflare).
 */
export function isValidCountryCode(code?: string | null): boolean {
  if (!code) return false;
  const upper = code.trim().toUpperCase();
  if (upper === 'XX' || upper === 'T1') return false; // XX = Cloudflare Unknown, T1 = Tor
  return /^[A-Z]{2}$/.test(upper);
}

/**
 * Comprueba si una dirección IP pertenece a rangos privados, loopback o redes locales (ej. Docker).
 */
export function isPrivateOrLocalIp(ip?: string | null): boolean {
  if (!ip) return true;
  const cleanIp = ip.trim().replace(/^::ffff:/, ''); // IPv4-mapped IPv6

  if (
    cleanIp === '127.0.0.1' ||
    cleanIp === '::1' ||
    cleanIp === 'localhost' ||
    cleanIp === '0.0.0.0'
  ) {
    return true;
  }

  // Rangos IPv4 privados según RFC 1918 y RFC 3927 (link-local):
  // 10.0.0.0/8
  // 172.16.0.0/12 (redes Docker por defecto: 172.17.x a 172.31.x)
  // 192.168.0.0/16
  // 169.254.0.0/16
  const isIpv4Private =
    /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3})$/.test(
      cleanIp,
    );

  if (isIpv4Private) {
    return true;
  }

  // Rangos IPv6 privados y link-local: fe80::/10, fc00::/7
  if (/^(fe80:|fc00:|fd)/i.test(cleanIp)) {
    return true;
  }

  return false;
}

/**
 * Obtiene el valor en formato string de una cabecera HTTP sin importar mayúsculas/minúsculas o arrays.
 */
function getHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  headerName: string,
): string | null {
  const targetName = headerName.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === targetName && value) {
      if (Array.isArray(value)) {
        return value[0]?.trim() || null;
      }
      return value.trim() || null;
    }
  }
  return null;
}

/**
 * Extrae la IP pública real del cliente examinando cabeceras de Cloudflare, Nginx y Fastify.
 */
export function extractClientIp(
  headers: Record<string, string | string[] | undefined>,
  fallbackIp?: string,
): string {
  // 1. Cloudflare CF-Connecting-IP
  const cfConnectingIp = getHeaderValue(headers, 'cf-connecting-ip');
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // 2. Nginx X-Real-IP
  const xRealIp = getHeaderValue(headers, 'x-real-ip');
  if (xRealIp) {
    return xRealIp;
  }

  // 3. X-Forwarded-For (cliente original es la primera IP a la izquierda)
  const xForwardedFor = getHeaderValue(headers, 'x-forwarded-for');
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(',')[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  return fallbackIp ? fallbackIp.trim() : '127.0.0.1';
}

/**
 * **Helper de Resolución de Geolocalización (País):**
 *
 * Resuelve el país del visitante con la siguiente jerarquía de optimización:
 * 1. **Cabeceras CDN / Proxy Inverso** (`CF-IPCountry`, `X-Country-Code`, `CloudFront-Viewer-Country`):
 *    Latencia 0 ms, máxima precisión provista por la infraestructura perimetral.
 * 2. **Base de datos GeoIP en memoria (`geoip-lite`)**:
 *    Búsqueda offline en 0.01 ms sobre la IP pública real sin dependencias externas ni cuotas.
 * 3. **Fallback configurable para desarrollo / redes privadas**:
 *    Si la IP es `127.0.0.1`, Docker `172.x` o intranet, retorna `fallbackCountry` (ej. `'HN'`)
 *    para que en pruebas locales no se agrupe todo en "Others".
 *
 * @param headers Cabeceras HTTP de la petición Fastify.
 * @param rawIp Dirección IP reportada por Fastify (`request.ip`).
 * @param fallbackCountry Código de país por defecto si es IP privada (opcional).
 * @returns Código ISO 3166-1 alpha-2 (ej: `'HN'`, `'US'`, `'ES'`) o `null`.
 */
export function resolveVisitorCountry(
  headers: Record<string, string | string[] | undefined>,
  rawIp?: string,
  fallbackCountry?: string | null,
): string | null {
  // 1. Prioridad 1: Cabeceras directas de CDN (Cloudflare / Nginx / CloudFront)
  for (const headerName of COUNTRY_HEADERS) {
    const rawCountry = getHeaderValue(headers, headerName);
    if (isValidCountryCode(rawCountry)) {
      return rawCountry!.toUpperCase();
    }
  }

  // 2. Extraer la IP cliente real
  const clientIp = extractClientIp(headers, rawIp);

  // 3. Si la IP es privada o localhost, aplicar fallback de desarrollo
  if (isPrivateOrLocalIp(clientIp)) {
    if (isValidCountryCode(fallbackCountry)) {
      return fallbackCountry!.toUpperCase();
    }
    return null;
  }

  // 4. Prioridad 2: Consulta offline a base de datos GeoIP (geoip-lite)
  try {
    const lookupResult = lookupGeoIp(clientIp);
    if (lookupResult && isValidCountryCode(lookupResult.country)) {
      return lookupResult.country.toUpperCase();
    }
  } catch {
    // Si geoip falla por formato atípico de IP, continua con fallback seguro
  }

  // 5. Fallback final si la IP pública no está en la base MaxMind
  if (isValidCountryCode(fallbackCountry)) {
    return fallbackCountry!.toUpperCase();
  }

  return null;
}
