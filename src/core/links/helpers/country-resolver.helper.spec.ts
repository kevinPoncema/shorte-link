import {
  extractClientIp,
  isPrivateOrLocalIp,
  isValidCountryCode,
  resolveVisitorCountry,
} from './country-resolver.helper';

describe('CountryResolverHelper (Cloudflare, Nginx, GeoIP & Dev Fallbacks)', () => {
  describe('isValidCountryCode', () => {
    it('accepts valid 2-letter uppercase ISO codes', () => {
      expect(isValidCountryCode('HN')).toBe(true);
      expect(isValidCountryCode('es')).toBe(true);
      expect(isValidCountryCode('US ')).toBe(true);
    });

    it('rejects invalid or special CDN codes (XX, T1, numbers, long strings)', () => {
      expect(isValidCountryCode(null)).toBe(false);
      expect(isValidCountryCode('')).toBe(false);
      expect(isValidCountryCode('XX')).toBe(false); // Cloudflare Unknown
      expect(isValidCountryCode('T1')).toBe(false); // Cloudflare Tor
      expect(isValidCountryCode('USA')).toBe(false);
      expect(isValidCountryCode('12')).toBe(false);
    });
  });

  describe('isPrivateOrLocalIp', () => {
    it('detects localhost and loopback IPv4/IPv6', () => {
      expect(isPrivateOrLocalIp('127.0.0.1')).toBe(true);
      expect(isPrivateOrLocalIp('::1')).toBe(true);
      expect(isPrivateOrLocalIp('localhost')).toBe(true);
      expect(isPrivateOrLocalIp('::ffff:127.0.0.1')).toBe(true);
    });

    it('detects private RFC 1918 subnets including Docker default bridges', () => {
      expect(isPrivateOrLocalIp('10.0.0.1')).toBe(true);
      expect(isPrivateOrLocalIp('172.17.0.2')).toBe(true); // Docker bridge
      expect(isPrivateOrLocalIp('172.18.0.5')).toBe(true); // Docker compose
      expect(isPrivateOrLocalIp('192.168.1.100')).toBe(true);
      expect(isPrivateOrLocalIp('169.254.1.1')).toBe(true);
    });

    it('identifies public internet IPs as non-private', () => {
      expect(isPrivateOrLocalIp('8.8.8.8')).toBe(false);
      expect(isPrivateOrLocalIp('181.115.0.1')).toBe(false);
      expect(isPrivateOrLocalIp('190.12.50.1')).toBe(false);
    });
  });

  describe('extractClientIp', () => {
    it('prioritizes cf-connecting-ip from Cloudflare', () => {
      const headers = {
        'cf-connecting-ip': '181.115.20.10',
        'x-real-ip': '10.0.0.1',
        'x-forwarded-for': '10.0.0.1, 10.0.0.2',
      };
      expect(extractClientIp(headers, '127.0.0.1')).toBe('181.115.20.10');
    });

    it('falls back to x-real-ip from Nginx when Cloudflare is not present', () => {
      const headers = {
        'x-real-ip': '190.12.50.1',
        'x-forwarded-for': '190.12.50.1, 172.18.0.1',
      };
      expect(extractClientIp(headers, '127.0.0.1')).toBe('190.12.50.1');
    });

    it('extracts leftmost client IP from x-forwarded-for', () => {
      const headers = {
        'x-forwarded-for': '200.50.10.1, 172.18.0.1',
      };
      expect(extractClientIp(headers, '127.0.0.1')).toBe('200.50.10.1');
    });

    it('falls back to Fastify req.ip when no proxy headers exist', () => {
      expect(extractClientIp({}, '192.168.1.15')).toBe('192.168.1.15');
    });
  });

  describe('resolveVisitorCountry (Full Hierarchy)', () => {
    it('Priority 1: extracts country from Cloudflare cf-ipcountry header', () => {
      const headers = {
        'cf-ipcountry': 'HN',
        'cf-connecting-ip': '8.8.8.8', // Even if IP points elsewhere
      };
      const result = resolveVisitorCountry(headers, '127.0.0.1', 'US');
      expect(result).toBe('HN');
    });

    it('Priority 1: extracts country from Nginx x-country-code header', () => {
      const headers = {
        'x-country-code': 'ES',
      };
      const result = resolveVisitorCountry(headers, '127.0.0.1', 'HN');
      expect(result).toBe('ES');
    });

    it('Priority 1: extracts country from AWS CloudFront cloudfront-viewer-country', () => {
      const headers = {
        'cloudfront-viewer-country': 'MX',
      };
      const result = resolveVisitorCountry(headers, '127.0.0.1', 'HN');
      expect(result).toBe('MX');
    });

    it('ignores invalid Cloudflare header XX and resolves public IP via geoip-lite', () => {
      const headers = {
        'cf-ipcountry': 'XX',
        'cf-connecting-ip': '8.8.8.8', // Google DNS in US
      };
      const result = resolveVisitorCountry(headers, '127.0.0.1', 'HN');
      expect(result).toBe('US');
    });

    it('Priority 2: resolves public IP via geoip-lite when no CDN headers exist', () => {
      const headers = {
        'x-real-ip': '181.115.0.1', // Honduras ISP IP
      };
      const result = resolveVisitorCountry(headers, '127.0.0.1');
      expect(result).toBe('HN');
    });

    it('Priority 3: uses development fallback country for localhost and Docker IPs', () => {
      const headers = {};
      const result = resolveVisitorCountry(headers, '127.0.0.1', 'HN');
      expect(result).toBe('HN');

      const dockerResult = resolveVisitorCountry(headers, '172.18.0.4', 'HN');
      expect(dockerResult).toBe('HN');
    });

    it('returns null when private IP is scanned and no fallback country is configured', () => {
      const headers = {};
      const result = resolveVisitorCountry(headers, '127.0.0.1', null);
      expect(result).toBeNull();
    });
  });
});
