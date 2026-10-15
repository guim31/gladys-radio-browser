// -----------------------------------------------------------------------------
// Device type: RADIO STATION, one per favorite.
//
// Features (all read-only, fed from the Radio Browser directory):
//   - online      input/binary   the directory's last check of the stream
//                                succeeded (1) or failed (0); 0 too when the
//                                station left the directory
//   - bitrate     datarate/rate  kbit/s announced by the station
//   - codec       text/text      MP3, AAC, OGG...
//   - stream_url  text/text      the address to play (`url_resolved`)
// The name, country, language, homepage and logo travel as device params.
//
// Nothing is controllable: a radio is played by a player of another
// integration (see src/scenes.js and the docs).
//
// External ids: `ext:<selector>:station:<station uuid>` — the uuid the
// directory gives the station, stable for its whole life.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { isStationUuid, streamUrlOf } from '../radiobrowser.js';
import { displayName } from '../favorites.js';

export const DEVICE_TYPE = 'station';

// Feature names, frozen by Gladys when the device is added: written in the
// language of the configuration at that moment.
export const NAMES = {
  en: {
    online: 'Stream online',
    bitrate: 'Bitrate',
    codec: 'Codec',
    stream_url: 'Stream address',
  },
  fr: {
    online: 'Flux en ligne',
    bitrate: 'Débit',
    codec: 'Codec',
    stream_url: 'Adresse du flux',
  },
  de: {
    online: 'Stream online',
    bitrate: 'Bitrate',
    codec: 'Codec',
    stream_url: 'Stream-Adresse',
  },
  es: {
    online: 'Flujo en línea',
    bitrate: 'Tasa de bits',
    codec: 'Códec',
    stream_url: 'Dirección del flujo',
  },
};

export const FEATURE_KEYS = ['online', 'bitrate', 'codec', 'stream_url'];

// The highest bitrate a radio announces (lossless streams: ~1411 kbit/s).
const MAX_BITRATE = 10000;
// Gladys stores a text state as it comes: a stream address longer than this
// is not one a player would take anyway.
const MAX_TEXT = 1000;

export function stationIds(gladys, uuid) {
  return gladys.externalIds(DEVICE_TYPE, uuid);
}

/** The station uuid of one of our device external ids, or null. */
export function stationUuidOf(gladys, deviceExternalId) {
  const prefix = gladys.externalId(`${DEVICE_TYPE}:`);
  if (typeof deviceExternalId !== 'string' || !deviceExternalId.startsWith(prefix)) {
    return null;
  }
  const uuid = deviceExternalId.slice(prefix.length);
  return isStationUuid(uuid) ? uuid : null;
}

function params(station) {
  const entries = [
    ['STATION_UUID', station.uuid],
    ['COUNTRY', station.country],
    ['COUNTRY_CODE', station.countrycode],
    ['LANGUAGE', station.language],
    ['TAGS', station.tags.slice(0, 10).join(', ')],
    ['HOMEPAGE', station.homepage],
    ['FAVICON', station.favicon],
  ];
  return entries
    .filter(([, value]) => typeof value === 'string' && value !== '')
    .map(([name, value]) => ({ name, value }));
}

/**
 * The device of one favorite, as published to the Discovery tab.
 * @param {object} gladys GladysIntegration
 * @param {object} favorite see src/favorites.js
 * @param {string} language feature names
 */
export function buildDevice(gladys, favorite, language) {
  const { station } = favorite;
  const ids = stationIds(gladys, station.uuid);
  const names = NAMES[language] ?? NAMES.en;
  const readOnly = (key, extra) => ({
    name: names[key],
    external_id: ids.feature(key),
    read_only: true,
    has_feedback: false,
    ...extra,
  });
  return {
    name: displayName(favorite),
    external_id: ids.device,
    // The container refreshes by itself (Gladys#3198); the core's poll, once
    // a minute, is only a fallback and is skipped while the timer runs.
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    features: [
      readOnly('online', {
        category: DEVICE_FEATURE_CATEGORIES.INPUT,
        type: DEVICE_FEATURE_TYPES.INPUT.BINARY,
        min: 0,
        max: 1,
        keep_history: true,
      }),
      readOnly('bitrate', {
        category: DEVICE_FEATURE_CATEGORIES.DATARATE,
        type: DEVICE_FEATURE_TYPES.DATARATE.RATE,
        unit: DEVICE_FEATURE_UNITS.KILOBITS_PER_SECOND,
        min: 0,
        max: MAX_BITRATE,
        keep_history: false,
      }),
      readOnly('codec', {
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
        // NOT NULL in the core, even for a text (else HTTP 422 on "Add").
        min: 0,
        max: 0,
        keep_history: false,
      }),
      readOnly('stream_url', {
        category: DEVICE_FEATURE_CATEGORIES.TEXT,
        type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
        min: 0,
        max: 0,
        keep_history: false,
      }),
    ],
    params: params(station),
  };
}

/**
 * The states of one favorite, in the `publishStates` format. An unknown
 * value (no bitrate, no codec) is left out rather than sent as 0 or empty:
 * Gladys ignores an empty text, and 0 kbit/s would draw a false history.
 */
export function stationStates(gladys, favorite) {
  const { station } = favorite;
  const ids = stationIds(gladys, station.uuid);
  const states = [
    {
      device_feature_external_id: ids.feature('online'),
      state: station.online && !favorite.missing ? 1 : 0,
    },
  ];
  if (station.bitrate > 0) {
    states.push({
      device_feature_external_id: ids.feature('bitrate'),
      state: Math.min(station.bitrate, MAX_BITRATE),
    });
  }
  if (station.codec) {
    states.push({ device_feature_external_id: ids.feature('codec'), text: station.codec });
  }
  const stream = streamUrlOf(station);
  if (stream && stream.length <= MAX_TEXT) {
    states.push({ device_feature_external_id: ids.feature('stream_url'), text: stream });
  }
  return states;
}
