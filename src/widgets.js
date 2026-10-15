// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): the favorite stations.
//
// A grid (or a list) of the favorites with their logo, country, codec and
// bitrate, and a badge telling whether the directory's last check of the
// stream succeeded. A tap opens the detail panel of the core: language,
// genres, and links to the station's website and, when the stream is
// https, to the stream itself (the browser plays it in a new tab).
//
// No "play" button: Gladys 5.2 gives an integration no way to start a
// player of another integration (see the docs, "Playing a radio").
// -----------------------------------------------------------------------------

import { WIDGET_CARD_LIST_DISPLAYS, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { displayName } from './favorites.js';
import { stationSummary, truncate } from './format.js';
import { logoKey } from './logos.js';
import { MESSAGES } from './messages.js';
import { perLanguage, localize } from './i18n.js';
import { streamUrlOf } from './radiobrowser.js';
import { stationUuidOf } from './devices/station.js';

export const FAVORITES_WIDGET = 'favorites';

// The card-list caps of the core: 12 posters in a grid, 8 rows in a list.
const MAX_ITEMS = { grid: 12, list: 8 };
// The content changes with a refresh, which nudges the widget itself.
const TTL_SECONDS = 900;

const isHttps = (url) => typeof url === 'string' && url.startsWith('https://');

/** The favorites a widget shows: the chosen devices, in their order, else all. */
export function selectFavorites(gladys, favorites, selected) {
  const chosen = (Array.isArray(selected) ? selected : [])
    .map((externalId) => stationUuidOf(gladys, externalId))
    .filter(Boolean);
  if (chosen.length === 0) return favorites;
  const byUuid = new Map(favorites.map((favorite) => [favorite.station.uuid, favorite]));
  return [...new Set(chosen)].map((uuid) => byUuid.get(uuid)).filter(Boolean);
}

function item(favorite, logoStatus) {
  const { station } = favorite;
  const online = station.online && !favorite.missing;
  const details = [];
  if (station.language) details.push(MESSAGES.LANGUAGE_LINE(station.language));
  if (station.tags.length > 0) {
    details.push(MESSAGES.GENRES_LINE(truncate(station.tags.slice(0, 8).join(', '), 200)));
  }
  if (favorite.missing) details.push(MESSAGES.LEFT_DIRECTORY);
  const links = [];
  if (isHttps(station.homepage)) {
    links.push({ url: station.homepage, label: MESSAGES.LINK_HOMEPAGE });
  }
  if (isHttps(streamUrlOf(station))) {
    links.push({ url: streamUrlOf(station), label: MESSAGES.LINK_LISTEN });
  }
  const entry = {
    title: truncate(displayName(favorite), 60),
    badge: {
      text: online ? MESSAGES.ONLINE : MESSAGES.OFFLINE,
      color: online ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
    },
  };
  const summary = stationSummary(station);
  if (summary) entry.subtitle = truncate(summary, 80);
  if (logoStatus(station.favicon) === 'ok') entry.image = logoKey(station.favicon);
  if (details.length > 0) {
    entry.description = perLanguage((language) =>
      details.map((line) => localize(line, language)).join('\n'),
    );
  }
  if (links.length > 0) entry.links = links;
  return entry;
}

/**
 * The content of the favorites widget.
 * @param {object[]} favorites the favorites to show
 * @param {object} options
 * @param {string} [options.display] 'grid' | 'list'
 * @param {(favicon: string) => string} [options.logoStatus] see src/logos.js
 */
export function favoritesContent(favorites, { display, logoStatus = () => 'bad' } = {}) {
  if (favorites.length === 0) {
    return {
      ttl_seconds: TTL_SECONDS,
      components: [{ type: 'text', variant: 'body', text: MESSAGES.WIDGET_EMPTY }],
    };
  }
  const mode =
    display === WIDGET_CARD_LIST_DISPLAYS.LIST
      ? WIDGET_CARD_LIST_DISPLAYS.LIST
      : WIDGET_CARD_LIST_DISPLAYS.GRID;
  return {
    ttl_seconds: TTL_SECONDS,
    components: [
      {
        type: 'card-list',
        display: mode,
        items: favorites.slice(0, MAX_ITEMS[mode]).map((favorite) => item(favorite, logoStatus)),
      },
    ],
  };
}

/** Nudge the widget: its content changed (rate-limited by the core). */
export function refreshWidget(gladys) {
  try {
    gladys.requestWidgetRefresh(FAVORITES_WIDGET);
  } catch {
    // Dropped while disconnected: the next mount pulls a fresh content anyway.
  }
}

/**
 * The widget handlers.
 * @param {{ gladys: object, store: object, logos: object }} context
 */
export function createWidgets({ gladys, store, logos }) {
  return {
    [FAVORITES_WIDGET]: {
      async get({ settings = {} } = {}) {
        const favorites = selectFavorites(gladys, store.list(), settings.stations);
        const content = favoritesContent(favorites, {
          display: settings.display,
          logoStatus: (favicon) => logos.status(favicon),
        });
        // Logos never tried yet: check them in the background, and show
        // them with the next content.
        const shown = favorites.slice(0, MAX_ITEMS.grid);
        if (shown.some((favorite) => logos.status(favorite.station.favicon) === 'unknown')) {
          logos
            .check(shown)
            .then((usable) => usable && refreshWidget(gladys))
            .catch(() => {});
        }
        return content;
      },
    },
  };
}
