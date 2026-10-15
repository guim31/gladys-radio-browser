// -----------------------------------------------------------------------------
// The container refreshes the favorites by itself (Gladys#3198): one request
// for all of them, states of the added devices only, quiet logs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATE_HEARTBEAT_MS } from '../src/refresher.js';
import { REFRESH_MINUTES_MAX } from '../src/config.js';
import { FIP, FRANCE_INTER, STATION_538, captureLogs, setupApp } from './helpers/directory.js';

const BYUUID = '/json/stations/byuuid';
const id = (uuid, key) => `ext:test-integration:station:${uuid}:${key}`;

/** Let the refresh started by a fired timer run (it writes /data: real I/O). */
async function settle(app) {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  await app.refresher.idle();
}

function withLogLevel(t, level) {
  const previous = process.env.LOG_LEVEL;
  if (level === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = level;
  t.after(() => {
    if (previous === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = previous;
  });
}

test('the container refreshes by itself every period, without any onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  const { gladys, app, directory } = await setupApp(t, {
    favorites: [FIP, FRANCE_INTER],
    timers: true,
    config: { refresh_minutes: 30 },
  });
  assert.equal(directory.count(BYUUID), 1, 'refreshed at the connection');
  assert.equal(gladys.fake.lastState(id(FIP, 'online')), 1);
  assert.equal(gladys.fake.lastState(id(FIP, 'bitrate')), 192);

  // The directory sees the stream fail: the next cycle publishes it.
  directory.stations.find((s) => s.stationuuid === FIP).lastcheckok = 0;
  t.mock.timers.tick(30 * 60 * 1000);
  await settle(app);
  assert.equal(directory.count(BYUUID), 2, 'one request per period, for every favorite');
  assert.equal(gladys.fake.lastState(id(FIP, 'online')), 0);

  t.mock.timers.tick(30 * 60 * 1000);
  await settle(app);
  assert.equal(directory.count(BYUUID), 3);
  assert.ok(
    !gladys.fake.requests.some((r) => r.path === '/poll'),
    'nothing came from the core scheduler',
  );
});

test('only what changed is published', async (t) => {
  const { gladys, app } = await setupApp(t, { favorites: [FIP] });
  const before = gladys.fake.states.length;
  assert.equal(before, 4);
  await app.refresher.refresh({ force: true });
  assert.equal(gladys.fake.states.length, before, 'nothing changed, nothing sent');
});

test('an unchanged value is sent again within 12 hours (heartbeat)', () => {
  assert.ok(STATE_HEARTBEAT_MS + REFRESH_MINUTES_MAX * 60 * 1000 <= 12 * 60 * 60 * 1000);
});

test('states go to the devices added to Gladys only', async (t) => {
  const { gladys, directory } = await setupApp(t, { favorites: [FIP, FRANCE_INTER], added: false });
  assert.equal(directory.count(BYUUID), 1, 'still read, for the widget');
  assert.equal(gladys.fake.states.length, 0);
});

test("the core's onPoll is a fallback: skipped while the timer runs", async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const { gladys, directory } = await setupApp(t, { favorites: [FIP] });
  const [device] = gladys.fake.devices;
  assert.deepEqual(await gladys.fake.poll(device), { success: true });
  assert.equal(directory.count(BYUUID), 1, 'just refreshed: no request');

  t.mock.timers.tick(55 * 60 * 1000); // 92 % of the default 60 minutes
  await gladys.fake.poll(device);
  assert.equal(directory.count(BYUUID), 2, 'the timer stalled: the core poll refreshes');
});

test('a device just added gets its states at once, from the stored copy', async (t) => {
  const { gladys, directory, store } = await setupApp(t, { favorites: [FIP], added: false });
  directory.state = 'down';
  const { buildDevice } = await import('../src/devices/station.js');
  await gladys.fake.deviceCreated(buildDevice(gladys, store.get(FIP), 'fr'));
  assert.equal(gladys.fake.lastState(id(FIP, 'codec')), 'AAC');
  assert.equal(
    gladys.fake.lastState(id(FIP, 'stream_url')),
    'https://icecast.radiofrance.fr/fip-hifi.aac',
  );
  assert.ok(gladys.fake.widgetRefreshes.includes('favorites'));
});

test('a station changing its logo is published again to the Discover tab', async (t) => {
  const { gladys, app, directory } = await setupApp(t, { favorites: [FIP] });
  directory.stations.find((s) => s.stationuuid === FIP).favicon = 'https://logo.example/fip.png';
  await app.refresher.refresh({ force: true });
  const params = gladys.fake.discoveredDevices[0].params;
  assert.ok(params.some((p) => p.name === 'FAVICON' && p.value === 'https://logo.example/fip.png'));
});

test('a normal refresh cycle writes nothing at info level', async (t) => {
  withLogLevel(t, undefined); // the default: info
  const { app } = await setupApp(t, { favorites: [FIP, STATION_538] });
  const lines = captureLogs(t);
  await app.refresher.refresh({ force: true });
  await app.refresher.refresh({ force: true });
  assert.deepEqual(lines, [], 'no line at info level or above');
});

test('the directory down: one warning, one line when it is back, the status follows', async (t) => {
  withLogLevel(t, 'info');
  const { gladys, app, directory } = await setupApp(t, { favorites: [FIP] });
  assert.equal(gladys.fake.connectionStatus.connected, true);
  const lines = captureLogs(t);

  directory.state = 'down';
  await app.refresher.refresh({ force: true });
  await app.refresher.refresh({ force: true });
  await app.refresher.refresh({ force: true });
  assert.equal(lines.filter((l) => l.includes('[WARN]')).length, 1, lines.join('\n'));
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.ok(gladys.fake.connectionStatus.message.fr);
  assert.equal(gladys.fake.connectionStatuses.length, 2, 'sent on change only');

  directory.state = 'up';
  await app.refresher.refresh({ force: true });
  const infos = lines.filter((l) => l.includes('[INFO]'));
  assert.equal(infos.length, 1, infos.join('\n'));
  assert.match(infos[0], /reachable again/);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('no stream address and no logo address ever reaches the logs', async (t) => {
  withLogLevel(t, 'debug');
  const lines = captureLogs(t);
  const { gladys, directory } = await setupApp(t, { favorites: [FIP, STATION_538] });
  const station = directory.stations.find((s) => s.stationuuid === FIP);
  station.url_resolved = 'https://listener:hunter2@stream.example/live?token=s3cr3t';
  station.favicon = 'https://logo.example/fip.png?key=s3cr3t';
  await gladys.fake.sceneAction('get_stream', { station: `ext:test-integration:station:${FIP}` });
  await gladys.fake.widgetGet('favorites');
  await gladys.fake.action('search', { name: 'FIP' });
  await gladys.fake.action('list_favorites');
  directory.state = 'down';
  await gladys.fake.sceneAction('get_stream', { station: `ext:test-integration:station:${FIP}` });
  const all = lines.join('\n');
  assert.ok(lines.length > 0);
  assert.doesNotMatch(all, /s3cr3t|hunter2|fip-hifi\.aac|icecast\.radiofrance\.fr/);
});
