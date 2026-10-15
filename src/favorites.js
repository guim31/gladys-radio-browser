// -----------------------------------------------------------------------------
// The favorite stations, kept in /data/favorites.json.
//
// Each favorite keeps the last known copy of its station: the devices, the
// widget and the scene actions work from it, so a directory that is down
// never empties the dashboard, and a device just added to Gladys gets its
// states at once. The file is written atomically (temporary file + rename):
// a container stopped in the middle never leaves half a list.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';
import { isStationUuid, normalizeStation } from './radiobrowser.js';

const logger = createLogger({ name: 'favorites' });

// The Discovery tab, the widget and the scene selects stay readable; the
// directory request that refreshes them all stays short.
export const MAX_FAVORITES = 50;
const FILE_VERSION = 1;
// A name typed by the user, shown on cards and as the device name.
export const MAX_NAME_LENGTH = 60;

const STATION_FIELDS = [
  'uuid',
  'name',
  'url',
  'url_resolved',
  'homepage',
  'favicon',
  'tags',
  'country',
  'countrycode',
  'language',
  'codec',
  'bitrate',
  'hls',
  'online',
  'votes',
  'clickcount',
];

// The station fields published as device params at discovery: when one
// changes, the discovered list is published again.
const DEVICE_PARAM_FIELDS = ['country', 'countrycode', 'language', 'homepage', 'favicon', 'tags'];

/** A station as stored: the normalized fields only, nothing else from the API. */
function storedStation(station) {
  return Object.fromEntries(STATION_FIELDS.map((key) => [key, station[key]]));
}

/** The name shown for a favorite: the one the user gave, else the station's. */
export function displayName(favorite) {
  return favorite.custom_name || favorite.station.name;
}

/** Turn back a stored entry into a favorite, or null when it is unusable. */
function readEntry(entry) {
  if (!entry || typeof entry !== 'object' || !isStationUuid(entry.station?.uuid)) {
    return null;
  }
  // The stored copy went through normalizeStation once: re-check it the same
  // way, through the API field names.
  const station = normalizeStation({
    ...entry.station,
    stationuuid: entry.station.uuid,
    tags: Array.isArray(entry.station.tags) ? entry.station.tags.join(',') : '',
    lastcheckok: entry.station.online ? 1 : 0,
    hls: entry.station.hls ? 1 : 0,
  });
  if (!station) return null;
  return {
    station,
    custom_name:
      typeof entry.custom_name === 'string' ? entry.custom_name.slice(0, MAX_NAME_LENGTH) : '',
    added_at: typeof entry.added_at === 'string' ? entry.added_at : new Date(0).toISOString(),
    missing: entry.missing === true,
  };
}

export class FavoriteStore {
  /**
   * @param {object} [options]
   * @param {string} [options.dir] the writable volume, /data in the container
   * @param {() => Date} [options.now]
   */
  constructor({ dir = process.env.DATA_DIR || '/data', now = () => new Date() } = {}) {
    this.dir = dir;
    this.path = join(dir, 'favorites.json');
    this.now = now;
    this.favorites = [];
    // Writes run one after the other.
    this.queue = Promise.resolve();
  }

  /** Read the file; a missing file is an empty list, a broken one is logged. */
  async load() {
    let raw;
    try {
      raw = await readFile(this.path, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.error(`Cannot read the favorites (${err.code ?? err.message})`);
      }
      this.favorites = [];
      return this.favorites;
    }
    try {
      const data = JSON.parse(raw);
      const seen = new Set();
      this.favorites = (Array.isArray(data?.favorites) ? data.favorites : [])
        .map(readEntry)
        .filter((favorite) => {
          if (!favorite || seen.has(favorite.station.uuid)) return false;
          seen.add(favorite.station.uuid);
          return true;
        })
        .slice(0, MAX_FAVORITES);
    } catch (err) {
      // Keep the broken file aside rather than overwrite it at the next save.
      logger.error(
        `The favorites file is unreadable (${err.message}), kept as favorites.json.broken`,
      );
      await rename(this.path, `${this.path}.broken`).catch(() => {});
      this.favorites = [];
    }
    return this.favorites;
  }

  async save() {
    const run = this.queue.then(async () => {
      await mkdir(this.dir, { recursive: true });
      const tmp = `${this.path}.tmp`;
      const data = {
        version: FILE_VERSION,
        favorites: this.favorites.map((favorite) => ({
          ...favorite,
          station: storedStation(favorite.station),
        })),
      };
      await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
      await rename(tmp, this.path);
    });
    this.queue = run.catch(() => {});
    return run;
  }

  list() {
    return this.favorites;
  }

  get(uuid) {
    return this.favorites.find((favorite) => favorite.station.uuid === uuid) ?? null;
  }

  /**
   * Add a station. Resolves `{ favorite, added }`, `added: false` when it was
   * already there (its name is updated when a new one is given).
   * @throws {RangeError} when the list is full
   */
  async add(station, customName = '') {
    const name = String(customName ?? '')
      .trim()
      .slice(0, MAX_NAME_LENGTH);
    const existing = this.get(station.uuid);
    if (existing) {
      existing.station = storedStation(station);
      existing.missing = false;
      if (name) existing.custom_name = name;
      await this.save();
      return { favorite: existing, added: false };
    }
    if (this.favorites.length >= MAX_FAVORITES) {
      throw new RangeError(`at most ${MAX_FAVORITES} favorites`);
    }
    const favorite = {
      station: storedStation(station),
      custom_name: name,
      added_at: this.now().toISOString(),
      missing: false,
    };
    this.favorites.push(favorite);
    await this.save();
    return { favorite, added: true };
  }

  /** Remove a favorite; resolves it, or null when it was not there. */
  async remove(uuid) {
    const favorite = this.get(uuid);
    if (!favorite) return null;
    this.favorites = this.favorites.filter((entry) => entry !== favorite);
    await this.save();
    return favorite;
  }

  /**
   * Take the fresh copies read from the directory. A favorite the directory
   * no longer returns is marked `missing` (deleted from the directory, or
   * merged into another entry): its stream is then reported offline.
   * @returns {{ changed: boolean, metadataChanged: boolean }} `metadataChanged`
   * when something published at discovery (the device params) moved
   */
  async update(stations) {
    const fresh = new Map(stations.map((station) => [station.uuid, storedStation(station)]));
    let changed = false;
    let metadataChanged = false;
    for (const favorite of this.favorites) {
      const next = fresh.get(favorite.station.uuid);
      if (!next) {
        if (!favorite.missing) {
          favorite.missing = true;
          changed = true;
        }
        continue;
      }
      if (favorite.missing) {
        favorite.missing = false;
        changed = true;
      }
      if (JSON.stringify(next) !== JSON.stringify(favorite.station)) {
        const before = favorite.station;
        metadataChanged ||= DEVICE_PARAM_FIELDS.some(
          (key) => JSON.stringify(before[key]) !== JSON.stringify(next[key]),
        );
        favorite.station = next;
        changed = true;
      }
    }
    if (changed) await this.save();
    return { changed, metadataChanged };
  }
}
