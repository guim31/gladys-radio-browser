// -----------------------------------------------------------------------------
// Station logos, served to the dashboard widget.
//
// The browser never loads a third-party image in a Gladys widget: the
// content names an image key, and the core asks the integration for its
// bytes (onWidgetGetImage), which it accepts as PNG, JPEG or WebP of at most
// 300 KB and 4096 px. Many station logos are ICO or SVG files, or too big:
// those are not shown (resizing would take an image library, too heavy for
// the sandbox). A logo is checked before its key is put in a content, so
// the card shows no broken image.
//
// The key derives from the logo address: when a station changes its logo,
// the key changes too, as the core caches an image one hour by key.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { createLogger, validateWidgetImage } from '@gladysassistant/integration-sdk';
import { fetchPublicFile, loggableUrl } from './net.js';
import { USER_AGENT } from './radiobrowser.js';

const logger = createLogger({ name: 'logos' });

// A logo that could not be used is tried again after this long.
const FAILURE_TTL_MS = 6 * 60 * 60 * 1000;
// The bytes kept in memory (50 favorites at most, logos of a few KB usually).
const MAX_ENTRIES = 60;

/** The widget image key of a logo address: `logo-<hash>`. */
export function logoKey(favicon) {
  return `logo-${createHash('sha1').update(favicon).digest('hex').slice(0, 24)}`;
}

/**
 * @param {object} options
 * @param {() => object[]} options.favorites the current favorites
 * @param {typeof fetchPublicFile} [options.fetchFile]
 * @param {() => number} [options.now]
 */
export function createLogos({ favorites, fetchFile = fetchPublicFile, now = () => Date.now() }) {
  /** key → { base64 } or { failedAt, reason } */
  const cache = new Map();
  /** key → Promise, one download at a time per logo */
  const pending = new Map();

  function remember(key, entry) {
    cache.delete(key);
    cache.set(key, entry);
    while (cache.size > MAX_ENTRIES) {
      cache.delete(cache.keys().next().value);
    }
  }

  function faviconOf(key) {
    const favorite = favorites().find(
      (entry) => entry.station.favicon && logoKey(entry.station.favicon) === key,
    );
    return favorite?.station.favicon ?? null;
  }

  async function download(key, favicon) {
    try {
      const bytes = await fetchFile(favicon, { userAgent: USER_AGENT });
      const base64 = bytes.toString('base64');
      const errors = validateWidgetImage(base64);
      if (errors.length > 0) {
        throw new Error(errors[0]);
      }
      remember(key, { base64 });
      return base64;
    } catch (err) {
      // A station logo that cannot be shown is common, not an incident.
      logger.debug(`Logo ${loggableUrl(favicon)} not usable (${err.message})`);
      remember(key, { failedAt: now(), reason: err.message });
      throw err;
    }
  }

  return {
    /**
     * The usability of a logo: 'ok', 'bad' (failed recently) or 'unknown'
     * (never tried, or a failure old enough to try again).
     */
    status(favicon) {
      if (!favicon) return 'bad';
      const entry = cache.get(logoKey(favicon));
      if (!entry) return 'unknown';
      if (entry.base64) return 'ok';
      return now() - entry.failedAt < FAILURE_TTL_MS ? 'bad' : 'unknown';
    },

    /** The raw base64 of a logo key, for onWidgetGetImage. */
    async get(key) {
      const entry = cache.get(key);
      if (entry?.base64) return entry.base64;
      const favicon = faviconOf(key);
      if (!favicon) {
        // Only the logos of the current favorites are ever fetched.
        throw new Error(`unknown image key ${key}`);
      }
      if (entry && now() - entry.failedAt < FAILURE_TTL_MS) {
        throw new Error(`logo not usable (${entry.reason})`);
      }
      if (!pending.has(key)) {
        pending.set(
          key,
          download(key, favicon).finally(() => pending.delete(key)),
        );
      }
      return pending.get(key);
    },

    /**
     * Check the logos never tried yet. Resolves true when at least one became
     * usable (the widget then deserves a refresh).
     */
    async check(list) {
      const unknown = list
        .map((favorite) => favorite.station.favicon)
        .filter((favicon) => favicon && this.status(favicon) === 'unknown');
      const results = await Promise.allSettled(
        [...new Set(unknown)].map((favicon) => this.get(logoKey(favicon))),
      );
      return results.some((result) => result.status === 'fulfilled');
    },
  };
}
