// -----------------------------------------------------------------------------
// A fake Radio Browser directory, and the whole integration wired to the
// SDK's fake Gladys: the tests never touch the network.
// -----------------------------------------------------------------------------

import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { RadioBrowser } from '../../src/radiobrowser.js';
import { FavoriteStore } from '../../src/favorites.js';
import { createLogos } from '../../src/logos.js';
import { createApp } from '../../src/app.js';

const fixture = async (name) =>
  JSON.parse(await readFile(new URL(`../fixtures/radio-browser/${name}`, import.meta.url), 'utf8'));

/** Every station of the fixtures, raw (API format). */
export async function rawStations() {
  return [
    ...(await fixture('stations.json')),
    ...(await fixture('search-fip.json')),
    ...(await fixture('search-france-inter.json')),
  ];
}

export const FIP = '7ff8f5e1-3b2c-4d4e-9a1b-0f1e2d3c4b5a';
export const FRANCE_INTER = 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e';
// From python-radios: a real station with a PNG logo, and one in the US.
export const STATION_538 = '6c95ccdb-ca0a-4c59-a660-96e56ef2dca9';
export const CLASSIC_VINYL = 'd1a54d2e-623e-4970-ab11-35f7b56c5ec3';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * @param {object} [options]
 * @param {object[]} [options.stations] raw stations the directory knows
 * @param {string[]} [options.srv] SRV targets (empty: the lookup fails)
 */
export async function createFakeDirectory({ stations, srv = ['de1.api.radio-browser.info'] } = {}) {
  const directory = {
    stations: stations ?? (await rawStations()),
    calls: [],
    // 'up', or 'down' (every server refuses the connection)
    state: 'up',
    /** Hosts answering 503, to test the failover. */
    failingHosts: new Set(),
  };
  directory.resolveSrv = async () => {
    if (srv.length === 0) throw Object.assign(new Error('queryNotFound'), { code: 'ENOTFOUND' });
    return srv.map((name) => ({ name, port: 443, priority: 1, weight: 1 }));
  };
  directory.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    directory.calls.push({ host: url.host, path: url.pathname, params: url.searchParams, init });
    if (directory.state === 'down') throw new TypeError('fetch failed');
    if (directory.failingHosts.has(url.host)) return json({ error: 'busy' }, 503);
    const all = directory.stations;
    if (url.pathname === '/json/servers') {
      return json([{ ip: '192.0.2.10', name: 'de1.api.radio-browser.info' }]);
    }
    if (url.pathname === '/json/stations/byuuid') {
      const wanted = url.searchParams.get('uuids').split(',');
      return json(all.filter((station) => wanted.includes(station.stationuuid)));
    }
    if (url.pathname === '/json/stations/search') {
      const p = url.searchParams;
      let found = all.filter((station) => {
        if (p.get('name') && !station.name.toLowerCase().includes(p.get('name').toLowerCase()))
          return false;
        if (p.get('countrycode') && station.countrycode !== p.get('countrycode')) return false;
        if (p.get('country') && !station.country.includes(p.get('country'))) return false;
        if (p.get('tag') && !station.tags.split(',').some((tag) => tag.includes(p.get('tag'))))
          return false;
        if (p.get('language') && !station.language.includes(p.get('language'))) return false;
        if (p.get('hidebroken') === 'true' && station.lastcheckok !== 1) return false;
        return true;
      });
      if (p.get('order') === 'clickcount') found.sort((a, b) => b.clickcount - a.clickcount);
      found = found.slice(0, Number(p.get('limit') ?? 100000));
      return json(found);
    }
    const click = url.pathname.match(/^\/json\/url\/([0-9a-f-]+)$/);
    if (click) {
      const station = all.find((entry) => entry.stationuuid === click[1]);
      return json(
        station
          ? {
              ok: true,
              message: 'retrieved station url',
              stationuuid: station.stationuuid,
              name: station.name,
              url: station.url_resolved,
            }
          : { ok: false, message: 'station not found' },
      );
    }
    return json({ error: 'not found' }, 404);
  };
  directory.client = new RadioBrowser({
    fetch: directory.fetch,
    resolveSrv: directory.resolveSrv,
    random: () => 0,
  });
  directory.count = (path) => directory.calls.filter((call) => call.path === path).length;
  return directory;
}

/** A 1×1 PNG, what a usable logo looks like. */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** Capture the log lines (the SDK logger writes through console). */
export function captureLogs(t) {
  const lines = [];
  for (const stream of ['log', 'error', 'warn', 'info', 'debug']) {
    t.mock.method(console, stream, (...args) => lines.push(args.join(' ')));
  }
  return lines;
}

/**
 * The integration wired to a fake Gladys, a fake directory and a temporary
 * data folder.
 * @param {import('node:test').TestContext} t
 * @param {object} [options]
 * @param {string[]} [options.favorites] uuids stored before the start
 * @param {boolean} [options.added] the user added every favorite to Gladys
 * @param {object} [options.config]
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers]
 */
export async function setupApp(
  t,
  { favorites = [], added = true, config = {}, connect = true, timers = false, now } = {},
) {
  const dir = await mkdtemp(join(tmpdir(), 'radio-browser-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const directory = await createFakeDirectory();
  const store = new FavoriteStore({ dir });
  await store.load();
  for (const uuid of favorites) {
    const [station] = await directory.client.stationsByUuid([uuid]);
    await store.add(station);
  }
  directory.calls.length = 0;

  const probe = createFakeGladys();
  const { buildDevice } = await import('../../src/devices/station.js');
  const devices = added ? store.list().map((favorite) => buildDevice(probe, favorite, 'fr')) : [];
  const gladys = createFakeGladys({ config, devices });

  const logoFetches = [];
  const logos = createLogos({
    favorites: () => store.list(),
    fetchFile: async (url) => {
      logoFetches.push(url);
      if (url.endsWith('.png')) return PNG_1X1;
      // An .ico: not a format Gladys shows.
      return Buffer.from([0, 0, 1, 0, 1, 0, 16, 16]);
    },
  });
  const app = createApp({ gladys, client: directory.client, store, logos, timers, now });
  t.after(() => app.stop());
  if (connect) await gladys.connect();
  return { gladys, app, store, directory, logos, logoFetches, dir };
}
