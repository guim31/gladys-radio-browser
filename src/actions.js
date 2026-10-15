// -----------------------------------------------------------------------------
// Manifest actions: the buttons of the Configuration screen.
//
// The configuration grammar of Gladys has no list nor search box, so the
// favorites are managed with four actions: search the directory, add a
// result (by its number) to the favorites, list them, remove one. The last
// search is kept in memory: "Add to favorites" refers to its numbers.
//
// A result is a `{ en, fr, de, es }` object (the front shows the user's
// language); an error is thrown in the language of the configuration.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { MAX_FAVORITES, displayName } from './favorites.js';
import { normalizeText, stationSummary } from './format.js';
import { UserError, localize, perLanguage } from './i18n.js';
import { MESSAGES } from './messages.js';
import { isStationUuid } from './radiobrowser.js';
import { stationIds } from './devices/station.js';

const logger = createLogger({ name: 'actions' });

export const SEARCH_LIMIT = 10;

const UUID_IN_TEXT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const field = (fields, key) => String(fields?.[key] ?? '').trim();

/** A message made of a header and lines, in every language. */
function listMessage(header, lines) {
  return perLanguage((language) =>
    [localize(header, language), ...lines.map((line) => line(language))].join('\n'),
  );
}

/**
 * @param {object} context
 * @param {object} context.gladys
 * @param {object} context.client RadioBrowser
 * @param {object} context.store FavoriteStore
 * @param {() => object} context.config the current normalized config
 * @param {() => Promise<void>} context.favoritesChanged discovery and widget
 */
export function createActions({ gladys, client, store, config, favoritesChanged }) {
  let lastSearch = null;
  const fail = (text) => new UserError(text, config().language);

  async function directory(call) {
    try {
      return await call();
    } catch (err) {
      logger.warn(`Radio Browser unreachable (${err.message})`);
      throw new UserError(MESSAGES.API_UNREACHABLE, config().language, err);
    }
  }

  /** The station a user names in "Add to favorites": a result number or a uuid. */
  async function stationToAdd(text) {
    if (/^\d+$/.test(text)) {
      if (!lastSearch) throw fail(MESSAGES.SEARCH_FIRST);
      const station = lastSearch[Number(text) - 1];
      if (!station) throw fail(MESSAGES.NO_SUCH_RESULT(Number(text)));
      return station;
    }
    // A bare uuid, or a radio-browser.info address that contains one.
    const uuid = text.match(UUID_IN_TEXT)?.[0]?.toLowerCase();
    if (!isStationUuid(uuid)) throw fail(MESSAGES.STATION_EXPECTED);
    const [station] = await directory(() => client.stationsByUuid([uuid]));
    if (!station) throw fail(MESSAGES.STATION_NOT_FOUND);
    return station;
  }

  /** The favorite a user names in "Remove": its number, uuid or name. */
  function favoriteToRemove(text) {
    const favorites = store.list();
    if (/^\d+$/.test(text)) {
      const favorite = favorites[Number(text) - 1];
      if (favorite) return favorite;
      throw fail(MESSAGES.FAVORITE_UNKNOWN);
    }
    const uuid = text.match(UUID_IN_TEXT)?.[0]?.toLowerCase();
    if (uuid) {
      const favorite = store.get(uuid);
      if (favorite) return favorite;
      throw fail(MESSAGES.FAVORITE_UNKNOWN);
    }
    const wanted = normalizeText(text);
    const matches = favorites.filter(
      (favorite) =>
        normalizeText(displayName(favorite)) === wanted ||
        normalizeText(favorite.station.name) === wanted,
    );
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw fail(MESSAGES.FAVORITE_AMBIGUOUS(text));
    throw fail(MESSAGES.FAVORITE_UNKNOWN);
  }

  return {
    async search(fields) {
      const criteria = {
        name: field(fields, 'name'),
        country: field(fields, 'country'),
        language: field(fields, 'language'),
        tag: field(fields, 'tag'),
      };
      if (!Object.values(criteria).some(Boolean)) {
        throw fail(MESSAGES.SEARCH_NEEDS_A_FIELD);
      }
      logger.info(
        `Action search <- ${JSON.stringify(
          Object.fromEntries(Object.entries(criteria).filter(([, value]) => value)),
        )}`,
      );
      const stations = await directory(() => client.search({ ...criteria, limit: SEARCH_LIMIT }));
      lastSearch = stations;
      if (stations.length === 0) return MESSAGES.NO_RESULT;
      return listMessage(
        MESSAGES.RESULTS_HEADER(stations.length),
        stations.map((station, index) => (language) => {
          const known = store.get(station.uuid)
            ? ` ★ ${localize(MESSAGES.ALREADY_FAVORITE, language)}`
            : '';
          const summary = stationSummary(station);
          return `${index + 1}. ${station.name}${summary ? ` — ${summary}` : ''}${known}`;
        }),
      );
    },

    async add_favorite(fields) {
      const text = field(fields, 'station');
      if (!text) throw fail(MESSAGES.STATION_EXPECTED);
      const station = await stationToAdd(text);
      let result;
      try {
        result = await store.add(station, field(fields, 'name'));
      } catch (err) {
        if (err instanceof RangeError) throw fail(MESSAGES.FAVORITES_FULL(MAX_FAVORITES));
        throw err;
      }
      const name = displayName(result.favorite);
      logger.info(`Favorite ${result.added ? 'added' : 'updated'}: "${name}"`);
      await favoritesChanged();
      return result.added ? MESSAGES.ADDED(name) : MESSAGES.ALREADY_ADDED(name);
    },

    async list_favorites() {
      const favorites = store.list();
      if (favorites.length === 0) return MESSAGES.NO_FAVORITES;
      const added = new Set((gladys.devices ?? []).map((device) => device.external_id));
      return listMessage(
        MESSAGES.FAVORITES_HEADER(favorites.length),
        favorites.map((favorite, index) => (language) => {
          const inGladys = added.has(stationIds(gladys, favorite.station.uuid).device);
          const summary = stationSummary(favorite.station);
          const where = localize(inGladys ? MESSAGES.IN_GLADYS : MESSAGES.NOT_IN_GLADYS, language);
          return `${index + 1}. ${displayName(favorite)}${summary ? ` — ${summary}` : ''} (${where})`;
        }),
      );
    },

    async remove_favorite(fields) {
      const text = field(fields, 'station');
      if (!text) throw fail(MESSAGES.FAVORITE_UNKNOWN);
      const favorite = favoriteToRemove(text);
      await store.remove(favorite.station.uuid);
      const name = displayName(favorite);
      logger.info(`Favorite removed: "${name}"`);
      await favoritesChanged();
      return MESSAGES.REMOVED(name);
    },
  };
}
