// Utility for validating URLs before fetching, to mitigate SSRF risks
// when downloading OGP images derived from user-supplied / external sources.

const PRIVATE_IPV4_RANGES = [
  // 10.0.0.0/8
  /^10\./,
  // 172.16.0.0/12
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  // 192.168.0.0/16
  /^192\.168\./,
  // 127.0.0.0/8 (loopback)
  /^127\./,
  // 169.254.0.0/16 (link-local)
  /^169\.254\./,
  // 0.0.0.0/8
  /^0\./,
];

const isPrivateIPv4 = hostname => PRIVATE_IPV4_RANGES.some(re => re.test(hostname));

const isPrivateIPv6 = hostname => {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === '::1' || h === '::') return true;
  // fc00::/7 (unique local) and fe80::/10 (link-local)
  if (/^fc[0-9a-f]{2}:/.test(h) || /^fd[0-9a-f]{2}:/.test(h)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(h)) return true;
  // IPv4-mapped IPv6 (::ffff:10.0.0.1 etc.)
  const mapped = h.match(/^::ffff:([\d.]+)$/);
  if (mapped && isPrivateIPv4(mapped[1])) return true;
  return false;
};

/**
 * Returns true if the URL is safe to fetch from the device:
 *  - scheme is http or https
 *  - hostname is not loopback / private / link-local
 *
 * Note: this is a best-effort hostname check; full DNS-rebinding
 * protection would require resolving and comparing the IP at request
 * time. For an offline note app this trade-off is acceptable.
 */
export const isSafePublicUrl = url => {
  if (typeof url !== 'string' || url.length === 0) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) return false;
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return false;
  if (hostname.endsWith('.local')) return false;

  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) && isPrivateIPv4(hostname)) {
    return false;
  }
  if (hostname.includes(':') && isPrivateIPv6(hostname)) return false;

  return true;
};
