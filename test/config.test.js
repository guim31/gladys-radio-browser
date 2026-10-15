import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, refreshPeriodMs } from '../src/config.js';

test('defaults: French, one refresh an hour', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.deepEqual(normalizeConfig(null), DEFAULT_CONFIG);
  assert.equal(DEFAULT_CONFIG.language, 'fr');
  assert.equal(refreshPeriodMs(normalizeConfig()), 60 * 60 * 1000);
});

test('the refresh interval is kept within 15 and 360 minutes', () => {
  assert.equal(normalizeConfig({ refresh_minutes: 1 }).refresh_minutes, 15);
  assert.equal(normalizeConfig({ refresh_minutes: '90' }).refresh_minutes, 90);
  assert.equal(normalizeConfig({ refresh_minutes: 10000 }).refresh_minutes, 360);
  assert.equal(normalizeConfig({ refresh_minutes: 'abc' }).refresh_minutes, 60);
});

test('an unknown language falls back to French', () => {
  assert.equal(normalizeConfig({ language: 'de' }).language, 'de');
  assert.equal(normalizeConfig({ language: 'it' }).language, 'fr');
});

test('keys outside the configuration are not kept', () => {
  assert.deepEqual(Object.keys(normalizeConfig({ other: 1 })).sort(), [
    'language',
    'refresh_minutes',
  ]);
});
