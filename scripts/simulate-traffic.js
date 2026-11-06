#!/usr/bin/env node

/**
 * =========================================================================
 * KinetiQR - Simulador de Tráfico y Telemetría en Tiempo Real
 * =========================================================================
 * 
 * Este script simula visitas y escaneos reales a cualquier enlace corto
 * o código QR dinámico de la plataforma, emitiendo cabeceras HTTP que
 * el motor de analíticas del backend (NestJS + Redis + PostgreSQL)
 * reconoce para desglosar:
 *   - Países y Regiones (Geolocalización por IP y cabeceras CDN)
 *   - Dispositivos y Sistemas Operativos (iOS, Android, Windows, macOS, Linux)
 *   - Navegadores (Mobile Safari, Chrome Mobile, Chrome, Firefox, Edge)
 *   - Canales y Fuentes (Stands NFC, Placas, Escaneos Directos, Instagram, WhatsApp)
 *   - Visitantes Únicos vs Recurrencia (hashes de IP independientes)
 * 
 * Uso:
 *   node scripts/simulate-traffic.js [URL_O_SHORTCODE] [CANTIDAD_VISITAS]
 * 
 * Ejemplos:
 *   node scripts/simulate-traffic.js http://localhost:3000/62dwdaa 30
 *   node scripts/simulate-traffic.js 62dwdaa 20
 * =========================================================================
 */

const TARGET_ARG = process.argv[2] || 'http://localhost:3000/62dwdaa';
const TOTAL_VISITS = parseInt(process.argv[3], 10) || 25;

// Normalizar la URL a apuntar a localhost:3000
function normalizeTargetUrl(input) {
  let trimmed = input.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const url = new URL(trimmed);
    const shortCode = url.pathname.replace(/^\/r\//, '').replace(/^\//, '');
    return `http://localhost:3000/${shortCode}`;
  }
  const cleanCode = trimmed.replace(/^kineti\.qr\/r\//, '').replace(/^\//, '');
  return `http://localhost:3000/${cleanCode}`;
}

const targetUrl = normalizeTargetUrl(TARGET_ARG);

// Catálogo de ubicaciones geográficas realistas (IPs públicas válidas y ciudades)
const LOCATIONS = [
  { city: 'Tegucigalpa', country: 'HN', countryName: 'Honduras', flag: '🇭🇳', ip: '190.92.40.12' },
  { city: 'San Pedro Sula', country: 'HN', countryName: 'Honduras', flag: '🇭🇳', ip: '181.115.10.88' },
  { city: 'Roatán', country: 'HN', countryName: 'Honduras', flag: '🇭🇳', ip: '190.53.18.4' },
  { city: 'Miami, FL', country: 'US', countryName: 'Estados Unidos', flag: '🇺🇸', ip: '104.16.132.229' },
  { city: 'New York, NY', country: 'US', countryName: 'Estados Unidos', flag: '🇺🇸', ip: '64.233.160.1' },
  { city: 'Los Angeles, CA', country: 'US', countryName: 'Estados Unidos', flag: '🇺🇸', ip: '172.217.1.14' },
  { city: 'Ciudad de México', country: 'MX', countryName: 'México', flag: '🇲🇽', ip: '189.206.12.50' },
  { city: 'Guadalajara', country: 'MX', countryName: 'México', flag: '🇲🇽', ip: '201.161.45.10' },
  { city: 'Madrid', country: 'ES', countryName: 'España', flag: '🇪🇸', ip: '83.45.12.34' },
  { city: 'Barcelona', country: 'ES', countryName: 'España', flag: '🇪🇸', ip: '213.97.23.101' },
  { city: 'Bogotá', country: 'CO', countryName: 'Colombia', flag: '🇨🇴', ip: '186.84.90.15' },
  { city: 'Medellín', country: 'CO', countryName: 'Colombia', flag: '🇨🇴', ip: '190.157.10.22' },
  { city: 'Ciudad de Guatemala', country: 'GT', countryName: 'Guatemala', flag: '🇬🇹', ip: '190.56.240.11' },
  { city: 'San José', country: 'CR', countryName: 'Costa Rica', flag: '🇨🇷', ip: '196.40.22.8' },
];

// Perfiles de Dispositivos y Navegadores
const CLIENT_PROFILES = [
  {
    name: 'iPhone 15 Pro (Safari Móvil)',
    os: 'iOS',
    browser: 'Mobile Safari',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  },
  {
    name: 'iPhone 14 (Safari Móvil)',
    os: 'iOS',
    browser: 'Mobile Safari',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  },
  {
    name: 'Samsung Galaxy S24 (Chrome Móvil)',
    os: 'Android',
    browser: 'Chrome Mobile',
    ua: 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.113 Mobile Safari/537.36',
  },
  {
    name: 'Google Pixel 8 (Chrome Móvil)',
    os: 'Android',
    browser: 'Chrome Mobile',
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.80 Mobile Safari/537.36',
  },
  {
    name: 'MacBook Pro (Safari Desktop)',
    os: 'macOS',
    browser: 'Safari',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  },
  {
    name: 'Windows 11 (Chrome Desktop)',
    os: 'Windows',
    browser: 'Chrome',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
  {
    name: 'Windows 11 (Edge)',
    os: 'Windows',
    browser: 'Edge',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  },
  {
    name: 'Ubuntu Linux (Firefox)',
    os: 'Linux',
    browser: 'Firefox',
    ua: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
  },
];

// Fuentes y Canales de Adquisición
const CHANNELS = [
  { label: 'Stand Acrílico NFC Mesa', referer: 'https://kineti.qr/nfc-stand-acrylic' },
  { label: 'Placa NFC Mostrador', referer: 'https://kineti.qr/nfc-counter-stand' },
  { label: 'Tarjeta PVC Inteligente', referer: 'https://kineti.qr/nfc-table-card' },
  { label: 'Cámara Móvil (Escaneo Directo QR)', referer: '' },
  { label: 'Instagram Stories', referer: 'https://l.instagram.com/' },
  { label: 'WhatsApp Chat', referer: 'https://api.whatsapp.com/' },
  { label: 'Google Search', referer: 'https://www.google.com/' },
];

function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// Genera una IP ligeramente variada dentro del rango para simular visitantes únicos reales
function randomizeIp(baseIp) {
  const parts = baseIp.split('.');
  if (parts.length === 4) {
    const last = Math.floor(Math.random() * 250) + 2;
    return `${parts[0]}.${parts[1]}.${parts[2]}.${last}`;
  }
  return baseIp;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendVisit(index, total) {
  const loc = getRandomItem(LOCATIONS);
  const client = getRandomItem(CLIENT_PROFILES);
  const channel = getRandomItem(CHANNELS);
  const simulatedIp = randomizeIp(loc.ip);

  const headers = {
    'User-Agent': client.ua,
    'CF-IPCountry': loc.country,
    'X-Country-Code': loc.country,
    'X-Geo-Country': loc.country,
    'CF-Connecting-IP': simulatedIp,
    'X-Real-IP': simulatedIp,
    'X-Forwarded-For': `${simulatedIp}, 172.18.0.1`,
  };

  if (channel.referer) {
    headers['Referer'] = channel.referer;
  }

  try {
    const startTime = Date.now();
    // redirect: 'manual' para capturar el 302 Found sin seguir la redirección externa
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers,
      redirect: 'manual',
    });
    const latency = Date.now() - startTime;
    const dest = response.headers.get('location') || 'OK';

    console.log(
      `[\x1b[36m${String(index).padStart(2, '0')}/${total}\x1b[0m] ` +
      `${loc.flag} \x1b[32m${loc.city}, ${loc.country}\x1b[0m ` +
      `| \x1b[33m${client.name}\x1b[0m ` +
      `| \x1b[35m${channel.label}\x1b[0m ` +
      `| IP: ${simulatedIp} ` +
      `| HTTP \x1b[1m${response.status}\x1b[0m (${latency}ms) ` +
      `-> \x1b[90m${dest.slice(0, 35)}...\x1b[0m`
    );

    return { success: response.status === 302 || response.status === 200, country: loc.country };
  } catch (err) {
    console.error(`[\x1b[31mERROR ${index}/${total}\x1b[0m] No se pudo conectar a ${targetUrl}:`, err.message);
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log('\n\x1b[1m\x1b[34m===============================================================\x1b[0m');
  console.log(`\x1b[1m🚀 KinetiQR - Simulador de Tráfico y Telemetría Real\x1b[0m`);
  console.log(`🎯 URL Destino: \x1b[32m${targetUrl}\x1b[0m`);
  console.log(`📊 Peticiones a ejecutar: \x1b[33m${TOTAL_VISITS}\x1b[0m`);
  console.log('\x1b[1m\x1b[34m===============================================================\x1b[0m\n');

  let successful = 0;
  const countriesCount = {};

  for (let i = 1; i <= TOTAL_VISITS; i++) {
    const res = await sendVisit(i, TOTAL_VISITS);
    if (res.success) {
      successful++;
      countriesCount[res.country] = (countriesCount[res.country] || 0) + 1;
    }
    // Pequeño intervalo entre 80ms y 250ms para simular comportamiento humano natural
    const delay = Math.floor(Math.random() * 170) + 80;
    await sleep(delay);
  }

  console.log('\n\x1b[1m\x1b[32m===============================================================\x1b[0m');
  console.log(`\x1b[1m✅ Simulación completada con éxito:\x1b[0m`);
  console.log(`   - Peticiones exitosas: \x1b[1m${successful}/${TOTAL_VISITS}\x1b[0m`);
  console.log(`   - Países simulados:`, countriesCount);
  console.log(`\n\x1b[33mℹ️  Nota técnica sobre el Analytics Worker:\x1b[0m`);
  console.log(`   El worker en segundo plano del backend procesa la cola Redis`);
  console.log(`   cada 15 segundos y consolida las métricas en PostgreSQL.`);
  console.log(`   En breves segundos podrás ver las gráficas y desgloses actualizados`);
  console.log(`   en la pestaña de "Analíticas" del frontend: \x1b[36mhttp://localhost:5173\x1b[0m`);
  console.log('\x1b[1m\x1b[32m===============================================================\x1b[0m\n');
}

main();
