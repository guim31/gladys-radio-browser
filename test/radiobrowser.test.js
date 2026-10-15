// -----------------------------------------------------------------------------
// The Radio Browser client, on real answers of the API (python-radios
// fixtures) and on the FIP / France Inter searches.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLBACK_HOST,
  RadioBrowser,
  USER_AGENT,
  isStationUuid,
  normalizeStation,
  streamUrlOf,
  withoutDuplicates,
} from '../src/radiobrowser.js';
import {
  CLASSIC_VINYL,
  FIP,
  STATION_538,
  createFakeDirectory,
  rawStations,
} from './helpers/directory.js';

test('a real station of the API is reduced to what the integration uses', async () => {
  const raw = (await rawStations()).find((station) => station.stationuuid === CLASSIC_VINYL);
  const station = normalizeStation(raw);
  assert.equal(station.uuid, CLASSIC_VINYL);
  assert.equal(station.name, 'Classic Vinyl HD');
  assert.equal(station.countrycode, 'US');
  assert.equal(station.codec, 'MP3');
  assert.equal(station.bitrate, 320);
  assert.equal(station.online, true);
  assert.equal(station.hls, false);
  assert.ok(station.tags.includes('jazz'));
  assert.equal(streamUrlOf(station), 'https://icecast.walmradio.com:8443/classic');
});

test('an entry without a valid uuid or stream is dropped', () => {
  assert.equal(normalizeStation({ stationuuid: '../../etc', url: 'http://a.example/x' }), null);
  assert.equal(normalizeStation({ stationuuid: FIP, url: 'javascript:alert(1)' }), null);
  assert.equal(normalizeStation(null), null);
  assert.ok(isStationUuid(FIP));
  assert.ok(!isStationUuid(`${FIP}x`));
});

test('an unknown codec, a zero bitrate and unsafe links are left empty', () => {
  const station = normalizeStation({
    stationuuid: FIP,
    name: ' FIP ',
    url: 'http://user:pass@stream.example/live',
    url_resolved: 'https://stream.example/live',
    homepage: 'ftp://example.org',
    favicon: 'data:image/png;base64,AAAA',
    codec: 'UNKNOWN',
    bitrate: 0,
    lastcheckok: 0,
  });
  assert.equal(station.name, 'FIP');
  assert.equal(station.url, '', 'credentials in a stream address are refused');
  assert.equal(streamUrlOf(station), 'https://stream.example/live');
  assert.equal(station.homepage, '');
  assert.equal(station.favicon, '');
  assert.equal(station.codec, '');
  assert.equal(station.bitrate, 0);
  assert.equal(station.online, false);
});

test('the same stream listed twice is kept once, the most voted', async () => {
  const stations = (await rawStations()).map(normalizeStation).filter(Boolean);
  const fips = stations.filter((station) => station.name.toLowerCase().includes('fip'));
  const kept = withoutDuplicates(fips);
  assert.equal(kept.length, fips.length - 1);
  assert.ok(kept.some((station) => station.uuid === FIP));
  assert.ok(!kept.some((station) => station.name === 'Fip Radio'));
});

test('the servers come from the DNS SRV records, in a random order', async () => {
  const directory = await createFakeDirectory({
    srv: ['de1.api.radio-browser.info', 'fi1.api.radio-browser.info.'],
  });
  const client = new RadioBrowser({
    fetch: directory.fetch,
    resolveSrv: directory.resolveSrv,
    random: () => 0,
  });
  assert.deepEqual([...(await client.servers())].sort(), [
    'de1.api.radio-browser.info',
    'fi1.api.radio-browser.info',
  ]);
  assert.equal(directory.calls.length, 0, 'no request needed');
});

test('without SRV records, the server list is asked to all.api.radio-browser.info', async () => {
  const directory = await createFakeDirectory({ srv: [] });
  const client = new RadioBrowser({ fetch: directory.fetch, resolveSrv: directory.resolveSrv });
  assert.deepEqual(await client.servers(), ['de1.api.radio-browser.info']);
  assert.equal(directory.calls[0].host, FALLBACK_HOST);
  assert.equal(directory.calls[0].path, '/json/servers');
});

test('with neither, all.api.radio-browser.info itself is used', async () => {
  const directory = await createFakeDirectory({ srv: [] });
  directory.state = 'down';
  const client = new RadioBrowser({ fetch: directory.fetch, resolveSrv: directory.resolveSrv });
  assert.deepEqual(await client.servers(), [FALLBACK_HOST]);
});

test('every request names the application in its User-Agent', async () => {
  const directory = await createFakeDirectory();
  await directory.client.search({ name: 'FIP' });
  const headers = directory.calls[0].init.headers;
  assert.equal(headers['User-Agent'], USER_AGENT);
  assert.match(
    USER_AGENT,
    /^gladys-radio-browser\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/guim31\/gladys-radio-browser\)$/,
  );
});

test('a failing server is skipped for the next one', async () => {
  const directory = await createFakeDirectory({
    srv: ['de1.api.radio-browser.info', 'fi1.api.radio-browser.info'],
  });
  const [first, second] = await directory.client.servers();
  directory.failingHosts.add(first);
  const stations = await directory.client.stationsByUuid([FIP]);
  assert.equal(stations[0].uuid, FIP);
  assert.deepEqual(
    directory.calls.map((call) => call.host),
    [first, second],
  );
  // The server that answered is tried first next time.
  directory.calls.length = 0;
  await directory.client.stationsByUuid([FIP]);
  assert.equal(directory.calls[0].host, second);
});

test('a 4xx answer is not retried on another server', async () => {
  const directory = await createFakeDirectory({
    srv: ['de1.api.radio-browser.info', 'fi1.api.radio-browser.info'],
  });
  await assert.rejects(directory.client.request('/json/unknown'), { kind: 'http', status: 404 });
  assert.equal(directory.calls.length, 1);
});

test('when every server is down, the error says so', async () => {
  const directory = await createFakeDirectory();
  directory.state = 'down';
  await assert.rejects(directory.client.stationsByUuid([FIP]), { kind: 'network' });
});

test('the search sends what the API understands', async () => {
  const directory = await createFakeDirectory();
  await directory.client.search({ name: 'FIP', country: 'fr', language: 'French', tag: 'Jazz' });
  const p = directory.calls[0].params;
  assert.equal(directory.calls[0].path, '/json/stations/search');
  assert.equal(p.get('name'), 'FIP');
  assert.equal(p.get('countrycode'), 'FR', 'a two-letter country is a code');
  assert.equal(p.get('country'), null);
  assert.equal(p.get('language'), 'french', 'languages are stored lowercase');
  assert.equal(p.get('tag'), 'jazz', 'tags are stored lowercase');
  assert.equal(p.get('hidebroken'), 'true');
  assert.equal(p.get('order'), 'clickcount');
  assert.equal(p.get('reverse'), 'true');

  await directory.client.search({ country: 'France' });
  assert.equal(directory.calls[1].params.get('country'), 'France');
  assert.equal(directory.calls[1].params.get('countrycode'), null);
});

test('searching "FIP" and "France Inter" finds the stations, most played first', async () => {
  const directory = await createFakeDirectory();
  const fip = await directory.client.search({ name: 'FIP' });
  assert.deepEqual(
    fip.map((station) => station.name),
    ['FIP', 'FIP Jazz', 'FIP (MP3)'],
  );
  const inter = await directory.client.search({ name: 'France Inter' });
  assert.equal(inter[0].name, 'France Inter');
  assert.equal(inter[1].hls, true);
});

test('the byuuid request carries every favorite at once', async () => {
  const directory = await createFakeDirectory();
  const stations = await directory.client.stationsByUuid([FIP, STATION_538, 'not-a-uuid']);
  assert.equal(directory.calls.length, 1);
  assert.equal(directory.calls[0].params.get('uuids'), `${FIP},${STATION_538}`);
  assert.equal(stations.length, 2);
  assert.deepEqual(await directory.client.stationsByUuid(['bad']), []);
});

test('a click answers the stream to play (real answer of the API)', async () => {
  const answer = JSON.parse(
    await (
      await import('node:fs/promises')
    ).readFile(new URL('./fixtures/radio-browser/station_click.json', import.meta.url), 'utf8'),
  );
  const client = new RadioBrowser({
    resolveSrv: async () => [{ name: 'de1.api.radio-browser.info' }],
    fetch: async (url) => {
      assert.equal(new URL(url).pathname, `/json/url/${STATION_538}`);
      return Response.json(answer);
    },
  });
  assert.equal(await client.click(STATION_538), answer.url);
});

test('a click refused, or "ok" written as a string, are understood', async () => {
  let answer;
  const client = new RadioBrowser({
    resolveSrv: async () => [{ name: 'de1.api.radio-browser.info' }],
    fetch: async () => Response.json(answer),
  });
  answer = { ok: 'true', url: 'https://stream.example/live' };
  assert.equal(await client.click(FIP), 'https://stream.example/live');
  answer = { ok: false, message: 'station not found' };
  await assert.rejects(client.click(FIP), /station not found/);
  await assert.rejects(client.click('nope'), { kind: 'invalid' });
});
