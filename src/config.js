// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user from the manifest `config_schema`; fetched with
// `gladys.getConfig()` and pushed again through `gladys.onConfigUpdated()`.
// This module only provides the defaults and normalizes what arrives.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './i18n.js';

// Bounds of the refresh interval, in minutes. The slowest pace keeps the
// heartbeat promise: an unchanged value is sent again at least every
// STATE_HEARTBEAT_MS + one period (12 h), so Gladys never shows "no recent
// value" on a station that simply did not change.
export const REFRESH_MINUTES_MIN = 15;
export const REFRESH_MINUTES_MAX = 360;

// MUST stay consistent with the `default` values of the manifest config_schema.
export const DEFAULT_CONFIG = {
  // Language of the feature names published at discovery and of the errors
  // thrown to scene actions: a "device" integration never learns the user's.
  language: 'fr',
  // Minutes between two reads of the favorites in the Radio Browser directory.
  refresh_minutes: 60,
};

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const config = raw ?? {};
  const minutes = Math.round(Number(config.refresh_minutes));
  return {
    ...DEFAULT_CONFIG,
    language: LANGUAGES.includes(config.language) ? config.language : DEFAULT_CONFIG.language,
    refresh_minutes: Number.isFinite(minutes)
      ? Math.min(REFRESH_MINUTES_MAX, Math.max(REFRESH_MINUTES_MIN, minutes))
      : DEFAULT_CONFIG.refresh_minutes,
  };
}

/** The refresh period of a normalized config, in milliseconds. */
export function refreshPeriodMs(config) {
  return config.refresh_minutes * 60 * 1000;
}
