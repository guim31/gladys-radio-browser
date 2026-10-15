// -----------------------------------------------------------------------------
// Network helpers.
//
// Two jobs: never write a full URL in the logs (a stream or a logo address
// can carry a listener token in its query string, or credentials), and fetch
// the station logos safely. A logo address comes from a public directory
// anyone can edit, and the container sits on the user's network: before
// downloading one, its host must resolve to public addresses only, so a
// station cannot make the container query the user's router or NAS. The
// check is repeated on every redirect.
// -----------------------------------------------------------------------------

import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** `https://host/…`: enough to know which server, nothing private. */
export function loggableUrl(url) {
  try {
    const parsed = new URL(url);
    const rest = parsed.pathname.length > 1 || parsed.search ? '/…' : '';
    return `${parsed.protocol}//${parsed.host}${rest}`;
  } catch {
    return '(invalid URL)';
  }
}

/** True for an http(s) URL without embedded credentials. */
export function isHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

function ipv4Parts(address) {
  const parts = address.split('.').map(Number);
  return parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    ? parts
    : null;
}

function isPublicIpv4(address) {
  const p = ipv4Parts(address);
  if (!p) return false;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return false; // this network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 192 && b === 0 && (p[2] === 0 || p[2] === 2)) return false; // IETF, TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && p[2] === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && p[2] === 113) return false; // TEST-NET-3
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

/** True when `address` (IPv4 or IPv6) is a public unicast address. */
export function isPublicAddress(address) {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version !== 6) return false;
  const lower = address.toLowerCase();
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible forms: judge the IPv4.
  const mapped = lower.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIpv4(mapped[1]);
  if (lower === '::' || lower === '::1') return false;
  const first = parseInt(lower.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((first & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((first & 0xff00) === 0xff00) return false; // multicast
  if (lower.startsWith('2001:db8:') || lower.startsWith('2001:0db8:')) return false; // doc
  if (lower.startsWith('64:ff9b:')) return false; // NAT64 can reach private IPv4
  return true;
}

export class UnsafeUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

/** Throws unless `url` is http(s) and its host resolves to public addresses only. */
export async function assertPublicUrl(url, { lookup = dnsLookup } = {}) {
  if (!isHttpUrl(url)) {
    throw new UnsafeUrlError('not an http(s) URL without credentials');
  }
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0 || !addresses.every(({ address }) => isPublicAddress(address))) {
    throw new UnsafeUrlError(`${loggableUrl(url)} does not resolve to public addresses only`);
  }
}

/** Read a response body, refusing more than `maxBytes`. */
async function readCapped(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`${declared} bytes, ${maxBytes} allowed`);
  }
  if (!response.body) return Buffer.alloc(0);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new Error(`more than ${maxBytes} bytes`);
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Download a small public file (a station logo): http(s) only, public hosts
 * only (checked again on every redirect), at most `maxBytes`, within
 * `timeoutMs` overall.
 * @returns {Promise<Buffer>}
 */
export async function fetchPublicFile(
  url,
  {
    fetch = globalThis.fetch,
    lookup = dnsLookup,
    maxBytes = 300 * 1024,
    timeoutMs = 8000,
    maxRedirects = 3,
    userAgent,
  } = {},
) {
  const signal = AbortSignal.timeout(timeoutMs);
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertPublicUrl(current, { lookup });
    const response = await fetch(current, {
      redirect: 'manual',
      signal,
      headers: userAgent ? { 'User-Agent': userAgent } : {},
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      await response.body?.cancel().catch(() => {});
      current = new URL(response.headers.get('location'), current).href;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`HTTP ${response.status} from ${loggableUrl(current)}`);
    }
    return readCapped(response, maxBytes);
  }
  throw new Error(`too many redirects from ${loggableUrl(url)}`);
}
