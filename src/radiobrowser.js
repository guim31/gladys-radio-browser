// -----------------------------------------------------------------------------
// Client of the Radio Browser API (https://api.radio-browser.info/).
//
// The directory is run by volunteers on several mirror servers, without a
// key. Its guidelines, followed here:
//   - find the servers by DNS (SRV records of `_api._tcp.radio-browser.info`),
//     else ask `/json/servers`, else use `all.api.radio-browser.info`, and
//     pick one at random; when a server fails, try the next one;
//   - send an explicit User-Agent naming the application;
//   - play `url_resolved` (the playlist already resolved by the directory);
//   - count a click (`/json/url/{uuid}`) each time a station is started, so
//     the popularity of the stations stays meaningful.
// The approach follows frenck/python-radios (MIT), the library behind the
// Home Assistant integration.
// -----------------------------------------------------------------------------

import { resolveSrv as dnsResolveSrv } from 'node:dns/promises';
import { readFileSync } from 'node:fs';
import { createLogger } from '@gladysassistant/integration-sdk';
import { isHttpUrl } from './net.js';

const logger = createLogger({ name: 'radio-browser' });

export const SRV_RECORD = '_api._tcp.radio-browser.info';
export const FALLBACK_HOST = 'all.api.radio-browser.info';

const VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;
export const USER_AGENT = `gladys-radio-browser/${VERSION} (+https://github.com/guim31/gladys-radio-browser)`;

// The server list hardly changes: looked up again at most this often.
const SERVERS_TTL_MS = 6 * 60 * 60 * 1000;
// Servers tried for one request before giving up.
const MAX_ATTEMPTS = 3;
// A station identifier, as the directory writes it.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isStationUuid(value) {
  return typeof value === 'string' && UUID.test(value);
}

export class RadioBrowserError extends Error {
  /**
   * @param {string} message
   * @param {{ kind: 'network' | 'http' | 'invalid', status?: number, cause?: Error }} details
   */
  constructor(message, { kind, status, cause } = {}) {
    super(message, { cause });
    this.name = 'RadioBrowserError';
    this.kind = kind;
    this.status = status;
  }
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const integer = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
};

/**
 * One station of the API, reduced to what the integration uses. Returns null
 * for an entry without a valid uuid or stream: the uuid becomes part of the
 * external ids, which must stay plain.
 */
export function normalizeStation(raw) {
  if (!raw || typeof raw !== 'object' || !isStationUuid(raw.stationuuid)) {
    return null;
  }
  const url = isHttpUrl(text(raw.url)) ? text(raw.url) : '';
  const resolved = isHttpUrl(text(raw.url_resolved)) ? text(raw.url_resolved) : '';
  if (!url && !resolved) {
    return null;
  }
  return {
    uuid: raw.stationuuid.toLowerCase(),
    name: text(raw.name) || raw.stationuuid.toLowerCase(),
    url,
    url_resolved: resolved,
    homepage: isHttpUrl(text(raw.homepage)) ? text(raw.homepage) : '',
    favicon: isHttpUrl(text(raw.favicon)) ? text(raw.favicon) : '',
    tags: text(raw.tags)
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    country: text(raw.country),
    countrycode: text(raw.countrycode).toUpperCase(),
    language: text(raw.language),
    codec: text(raw.codec).toUpperCase() === 'UNKNOWN' ? '' : text(raw.codec).toUpperCase(),
    bitrate: integer(raw.bitrate),
    hls: Number(raw.hls) === 1,
    online: Number(raw.lastcheckok) === 1,
    votes: integer(raw.votes),
    clickcount: integer(raw.clickcount),
  };
}

/** The address to play: the one the directory resolved, else the declared one. */
export function streamUrlOf(station) {
  return station.url_resolved || station.url;
}

/** A key for a stream URL, the same for every way to write it (python-radios). */
function streamKey(url) {
  const address = url.trim().split('://', 2).pop();
  const slash = address.indexOf('/');
  const host = slash === -1 ? address : address.slice(0, slash);
  const path = slash === -1 ? '' : address.slice(slash + 1);
  return `${host.toLowerCase()}/${path.replace(/;$/, '').replace(/\/+$/, '')}`;
}

/**
 * Keep one station per stream, the one with the most votes then clicks, at
 * the place of the first one: the directory lists the same stream several
 * times, added by different people.
 */
export function withoutDuplicates(stations) {
  const best = new Map();
  for (const station of stations) {
    const key = streamKey(streamUrlOf(station));
    const current = best.get(key);
    if (
      !current ||
      station.votes > current.votes ||
      (station.votes === current.votes && station.clickcount > current.clickcount)
    ) {
      best.set(key, station);
    }
  }
  return [...new Set(stations.map((station) => streamKey(streamUrlOf(station))))].map((key) =>
    best.get(key),
  );
}

function shuffle(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export class RadioBrowser {
  /**
   * @param {object} [options]
   * @param {typeof fetch} [options.fetch]
   * @param {(name: string) => Promise<Array<{ name: string }>>} [options.resolveSrv]
   * @param {number} [options.timeoutMs] per request
   * @param {() => number} [options.random]
   * @param {() => number} [options.now]
   */
  constructor({
    fetch = globalThis.fetch,
    resolveSrv = dnsResolveSrv,
    timeoutMs = 8000,
    random = Math.random,
    now = () => Date.now(),
  } = {}) {
    this.fetch = fetch;
    this.resolveSrv = resolveSrv;
    this.timeoutMs = timeoutMs;
    this.random = random;
    this.now = now;
    this.hosts = [];
    this.hostsAt = 0;
  }

  /** The API servers, in a random order (looked up again every few hours). */
  async servers() {
    if (this.hosts.length > 0 && this.now() - this.hostsAt < SERVERS_TTL_MS) {
      return this.hosts;
    }
    let hosts = [];
    try {
      const records = await this.resolveSrv(SRV_RECORD);
      hosts = records.map((record) => record.name).filter(Boolean);
    } catch (err) {
      logger.debug(`SRV lookup of ${SRV_RECORD} failed (${err.code ?? err.message})`);
    }
    if (hosts.length === 0) {
      try {
        const list = await this.getJson(FALLBACK_HOST, '/json/servers');
        hosts = Array.isArray(list)
          ? list.map((server) => text(server?.name)).filter((name) => /^[a-z0-9.-]+$/i.test(name))
          : [];
      } catch (err) {
        logger.debug(`Server list unavailable (${err.message})`);
      }
    }
    hosts = [...new Set(hosts.map((host) => host.toLowerCase().replace(/\.$/, '')))];
    this.hosts = hosts.length > 0 ? shuffle(hosts, this.random) : [FALLBACK_HOST];
    this.hostsAt = this.now();
    logger.debug(`Radio Browser servers: ${this.hosts.join(', ')}`);
    return this.hosts;
  }

  /** One GET on one server, the parsed JSON. */
  async getJson(host, path, params) {
    const url = new URL(`https://${host}${path}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
    let response;
    try {
      response = await this.fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new RadioBrowserError(
        `${host}: ${err.name === 'TimeoutError' ? 'timeout' : err.message}`,
        {
          kind: 'network',
          cause: err,
        },
      );
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new RadioBrowserError(`${host}: HTTP ${response.status}`, {
        kind: 'http',
        status: response.status,
      });
    }
    try {
      return await response.json();
    } catch (err) {
      throw new RadioBrowserError(`${host}: unreadable answer`, { kind: 'invalid', cause: err });
    }
  }

  /**
   * GET on the API, moving to the next server when one fails (network error,
   * timeout, 5xx). A 4xx is our request's fault: asking another server would
   * not change the answer.
   */
  async request(path, params) {
    const hosts = await this.servers();
    let lastError;
    for (let attempt = 0; attempt < Math.min(MAX_ATTEMPTS, hosts.length); attempt += 1) {
      const host = hosts[attempt];
      try {
        const data = await this.getJson(host, path, params);
        if (attempt > 0) {
          // Start with the server that answered next time.
          this.hosts = [host, ...hosts.filter((h) => h !== host)];
        }
        return data;
      } catch (err) {
        lastError = err;
        if (err.kind === 'http' && err.status < 500) throw err;
        logger.debug(`Radio Browser request ${path} failed (${err.message}), next server`);
      }
    }
    // Every server failed: look them up again next time.
    this.hostsAt = 0;
    throw lastError;
  }

  async stationList(path, params) {
    const data = await this.request(path, params);
    if (!Array.isArray(data)) {
      throw new RadioBrowserError('Radio Browser: a list was expected', { kind: 'invalid' });
    }
    return data.map(normalizeStation).filter(Boolean);
  }

  /**
   * Search the directory. `country` is a country name (part of it) or a
   * two-letter code; tags and languages are stored lowercase by the API,
   * which matches them case sensitive.
   * @returns {Promise<object[]>} at most `limit` stations, most played first
   */
  async search({ name, country, language, tag, limit = 10, order = 'clickcount' } = {}) {
    const code = text(country);
    const stations = await this.stationList('/json/stations/search', {
      name: text(name),
      countrycode: /^[a-z]{2}$/i.test(code) ? code.toUpperCase() : undefined,
      country: /^[a-z]{2}$/i.test(code) ? undefined : code,
      language: text(language).toLowerCase(),
      tag: text(tag).toLowerCase(),
      hidebroken: 'true',
      order,
      reverse: order === 'random' ? undefined : 'true',
      // More than asked: the duplicates are removed afterwards.
      limit: order === 'random' ? limit : limit * 3,
    });
    return withoutDuplicates(stations).slice(0, limit);
  }

  /** The stations of these uuids, in one request (unknown uuids are absent). */
  async stationsByUuid(uuids) {
    const list = uuids.filter(isStationUuid);
    if (list.length === 0) return [];
    return this.stationList('/json/stations/byuuid', { uuids: list.join(',') });
  }

  /**
   * Count a click on a station, as the directory asks each time one is
   * started. Resolves the stream URL it answers, ready to play.
   */
  async click(uuid) {
    if (!isStationUuid(uuid)) {
      throw new RadioBrowserError('not a station uuid', { kind: 'invalid' });
    }
    const data = await this.request(`/json/url/${uuid}`);
    // The API documents "ok" both as a boolean and as a string.
    const ok = data?.ok === true || data?.ok === 'true';
    if (!ok || !isHttpUrl(text(data?.url))) {
      throw new RadioBrowserError(`click refused (${text(data?.message) || 'no reason'})`, {
        kind: 'invalid',
      });
    }
    return text(data.url);
  }
}
