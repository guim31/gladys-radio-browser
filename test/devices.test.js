// -----------------------------------------------------------------------------
// The station device: ids, names, params and states.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeStation } from '../src/radiobrowser.js';
import { NAMES, buildDevice, stationStates, stationUuidOf } from '../src/devices/station.js';
import { FIP, FRANCE_INTER, rawStations } from './helpers/directory.js';

const gladys = createFakeGladys();
const favoriteOf = async (uuid, extra = {}) => ({
  station: normalizeStation((await rawStations()).find((s) => s.stationuuid === uuid)),
  custom_name: '',
  missing: false,
  ...extra,
});

test('the external ids are built from the station uuid, forever', async () => {
  const device = buildDevice(gladys, await favoriteOf(FIP), 'fr');
  assert.equal(device.external_id, `ext:test-integration:station:${FIP}`);
  assert.deepEqual(
    device.features.map((feature) => feature.external_id.split(':').pop()),
    ['online', 'bitrate', 'codec', 'stream_url'],
  );
  assert.equal(stationUuidOf(gladys, device.external_id), FIP);
  assert.equal(stationUuidOf(gladys, 'ext:test-integration:station:nope'), null);
  assert.equal(stationUuidOf(gladys, `ext:other:station:${FIP}`), null);
});

test('the device takes the name the user gave, and the station details as params', async () => {
  const device = buildDevice(gladys, await favoriteOf(FIP, { custom_name: 'Ma FIP' }), 'fr');
  assert.equal(device.name, 'Ma FIP');
  const params = Object.fromEntries(device.params.map(({ name, value }) => [name, value]));
  assert.equal(params.STATION_UUID, FIP);
  assert.equal(params.COUNTRY, 'France');
  assert.equal(params.COUNTRY_CODE, 'FR');
  assert.equal(params.HOMEPAGE, 'https://www.radiofrance.fr/fip');
  assert.match(params.TAGS, /jazz/);
});

test('feature names follow the language of the configuration', async () => {
  const favorite = await favoriteOf(FIP);
  assert.equal(buildDevice(gladys, favorite, 'fr').features[0].name, NAMES.fr.online);
  assert.equal(buildDevice(gladys, favorite, 'es').features[3].name, 'Dirección del flujo');
  assert.equal(buildDevice(gladys, favorite, 'xx').features[0].name, NAMES.en.online);
});

test('states: stream online, bitrate, codec and stream address', async () => {
  const states = stationStates(gladys, await favoriteOf(FIP));
  const byKey = Object.fromEntries(
    states.map((s) => [s.device_feature_external_id.split(':').pop(), s.state ?? s.text]),
  );
  assert.deepEqual(byKey, {
    online: 1,
    bitrate: 192,
    codec: 'AAC',
    stream_url: 'https://icecast.radiofrance.fr/fip-hifi.aac',
  });
});

test('an unknown bitrate is not sent as 0, and a station gone is offline', async () => {
  const hls = await favoriteOf('c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f');
  assert.ok(
    !stationStates(gladys, hls).some((s) => s.device_feature_external_id.endsWith(':bitrate')),
  );
  const gone = await favoriteOf(FRANCE_INTER, { missing: true });
  assert.equal(stationStates(gladys, gone)[0].state, 0);
});
