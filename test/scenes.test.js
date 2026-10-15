// -----------------------------------------------------------------------------
// Scene actions: the stream of a favorite, a random station.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIP, setupApp } from './helpers/directory.js';

const DEVICE = `ext:test-integration:station:${FIP}`;

test('get_stream gives the stream of a favorite and counts a click', async (t) => {
  const { gladys, directory } = await setupApp(t, { favorites: [FIP] });
  const ack = await gladys.fake.sceneAction('get_stream', { station: DEVICE });
  assert.deepEqual(ack, {
    success: true,
    data: {
      outputs: {
        stream_url: 'https://icecast.radiofrance.fr/fip-hifi.aac',
        name: 'FIP',
        codec: 'AAC',
        bitrate: 192,
        online: true,
        hls: false,
      },
    },
  });
  assert.equal(directory.count(`/json/url/${FIP}`), 1);
});

test('the directory down: the known stream is played anyway', async (t) => {
  const { gladys, directory } = await setupApp(t, { favorites: [FIP] });
  directory.state = 'down';
  const ack = await gladys.fake.sceneAction('get_stream', { station: DEVICE });
  assert.equal(ack.success, true);
  assert.equal(ack.data.outputs.stream_url, 'https://icecast.radiofrance.fr/fip-hifi.aac');
});

test('a device that is no longer a favorite fails this action only', async (t) => {
  const { gladys } = await setupApp(t, { config: { language: 'fr' } });
  const ack = await gladys.fake.sceneAction('get_stream', { station: DEVICE });
  assert.equal(ack.success, false);
  assert.match(ack.error, /n'est plus une station favorite/);
});

test('random_station picks a working station of the genre', async (t) => {
  const { gladys, directory } = await setupApp(t);
  const ack = await gladys.fake.sceneAction('random_station', { tag: 'Jazz' });
  assert.equal(ack.success, true, ack.error);
  assert.ok(['FIP', 'FIP Jazz', 'Classic Vinyl HD'].includes(ack.data.outputs.name));
  const search = directory.calls.find((call) => call.path === '/json/stations/search');
  assert.equal(search.params.get('order'), 'random');
  assert.equal(search.params.get('hidebroken'), 'true');
  assert.equal(search.params.get('tag'), 'jazz');
  assert.ok(
    directory.calls.some((call) => call.path.startsWith('/json/url/')),
    'a click',
  );
});

test('random_station without a match, or without the directory, fails clearly', async (t) => {
  const { gladys, directory } = await setupApp(t, { config: { language: 'en' } });
  const none = await gladys.fake.sceneAction('random_station', { tag: 'zzzz' });
  assert.match(none.error, /No working station matches/);
  directory.state = 'down';
  const down = await gladys.fake.sceneAction('random_station', {});
  assert.match(down.error, /cannot be reached/);
});
