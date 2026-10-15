// -----------------------------------------------------------------------------
// Conformity with the Gladys core, for EVERY device built from realistic
// fixtures (real answers of the Radio Browser API from python-radios, and the
// FIP / France Inter searches), in every feature language. The table comes
// from the core code (test/fixtures/gladys-feature-table.json). Do not loosen
// this test: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeStation } from '../src/radiobrowser.js';
import { buildDevice, stationStates } from '../src/devices/station.js';
import { LANGUAGES } from '../src/i18n.js';
import { rawStations } from './helpers/directory.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);
const gladys = createFakeGladys();
const favorites = (await rawStations())
  .map(normalizeStation)
  .filter(Boolean)
  .map((station) => ({ station, custom_name: '', missing: false }));

test('the fixtures give stations of several countries, codecs and kinds', () => {
  assert.ok(favorites.length >= 8, `${favorites.length} stations`);
  const codecs = new Set(favorites.map((f) => f.station.codec));
  assert.ok(codecs.has('MP3') && codecs.has('AAC'));
  assert.ok(favorites.some((f) => f.station.hls));
  assert.ok(
    favorites.some((f) => !f.station.countrycode),
    'a station without a country',
  );
});

for (const language of LANGUAGES) {
  const devices = favorites.map((favorite) => buildDevice(gladys, favorite, language));

  for (const device of devices) {
    test(`${device.name} follows the core rules (${language})`, () => {
      assert.equal(typeof device.name, 'string');
      assert.ok(device.name.length > 0);

      // should_poll true if and only if a poll_frequency is given, in ms.
      assert.equal(typeof device.should_poll, 'boolean');
      assert.equal(device.should_poll, device.poll_frequency !== undefined);
      if (device.poll_frequency !== undefined) {
        assert.ok(table.poll_frequencies_ms.includes(device.poll_frequency));
      }

      for (const param of device.params ?? []) {
        assert.equal(typeof param.value, 'string', `param ${param.name}`);
        assert.ok(param.value.length > 0, `param ${param.name} is empty`);
        assert.ok(!param.name.toUpperCase().startsWith('GLADYS_'), 'GLADYS_* params are reserved');
      }

      const ids = new Set();
      const names = new Set();
      for (const feature of device.features) {
        const pair = `${feature.category}/${feature.type}`;
        const entry = table.pairs[pair];
        assert.ok(entry, `${pair} is not a couple the core knows`);
        assert.ok(entry.label_en && entry.label_fr && entry.icon, `${pair} has labels and an icon`);

        assert.equal(typeof feature.min, 'number', `${feature.external_id}: min`);
        assert.equal(typeof feature.max, 'number', `${feature.external_id}: max`);
        assert.ok(feature.min <= feature.max, `${feature.external_id}: min <= max`);
        assert.equal(typeof feature.read_only, 'boolean', `${feature.external_id}: read_only`);
        assert.equal(
          typeof feature.has_feedback,
          'boolean',
          `${feature.external_id}: has_feedback`,
        );
        assert.equal(
          typeof feature.keep_history,
          'boolean',
          `${feature.external_id}: keep_history`,
        );
        if (feature.unit !== undefined && feature.unit !== null) {
          assert.ok(table.units.includes(feature.unit), `${feature.external_id}: unit`);
          const allowed = table.units_by_category[feature.category];
          if (allowed)
            assert.ok(
              allowed.includes(feature.unit),
              `${feature.external_id}: unit of its category`,
            );
        }

        assert.ok(feature.external_id.startsWith(`${device.external_id}:`));
        assert.ok(!ids.has(feature.external_id), `duplicate ${feature.external_id}`);
        ids.add(feature.external_id);
        assert.ok(!names.has(feature.name), `duplicate name "${feature.name}"`);
        names.add(feature.name);
      }
    });
  }

  test(`device external ids are unique (${language})`, () => {
    const ids = devices.map((device) => device.external_id);
    assert.equal(new Set(ids).size, ids.length);
  });
}

test('every state fits its feature: in bounds, text never empty', () => {
  for (const favorite of favorites) {
    const device = buildDevice(gladys, favorite, 'fr');
    const features = new Map(device.features.map((feature) => [feature.external_id, feature]));
    for (const state of stationStates(gladys, favorite)) {
      const feature = features.get(state.device_feature_external_id);
      assert.ok(feature, `${state.device_feature_external_id} is a published feature`);
      if (feature.category === 'text') {
        assert.equal(typeof state.text, 'string');
        assert.ok(state.text.length > 0, 'Gladys ignores an empty text');
        assert.equal(state.state, undefined);
      } else {
        assert.equal(typeof state.state, 'number');
        assert.ok(
          state.state >= feature.min && state.state <= feature.max,
          `${feature.name} in bounds`,
        );
      }
    }
  }
});
