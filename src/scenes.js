// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+).
//
// Gladys 5.2 gives an integration no way to command a device of another
// integration: the host API has no "set the value of that device", and a
// `source: "devices"` field only lists the integration's own devices. So
// these actions do not play anything: they give the stream of a station to
// the NEXT action of the scene, the player's own "play a URL" action — for
// example "Play a URL on a DLNA renderer" of the DLNA integration, with
// `{{<column>.<row>.stream_url}}` as URL.
//
// Each one counts a click in the directory, as Radio Browser asks each time
// a station is started. `fields` arrive resolved by the core (scene variables
// substituted, defaults applied, validated); throwing fails this action only,
// the scene goes on.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { displayName } from './favorites.js';
import { UserError } from './i18n.js';
import { MESSAGES } from './messages.js';
import { streamUrlOf } from './radiobrowser.js';
import { stationUuidOf } from './devices/station.js';
import { createIssueLog } from './issues.js';

const logger = createLogger({ name: 'scenes' });

/** The declared outputs, from a station and the stream to play. */
function outputsOf(station, name, streamUrl) {
  return {
    stream_url: streamUrl,
    name,
    codec: station.codec,
    bitrate: station.bitrate,
    online: station.online,
    hls: station.hls,
  };
}

/**
 * @param {object} context
 * @param {object} context.gladys
 * @param {object} context.client RadioBrowser
 * @param {object} context.store FavoriteStore
 * @param {() => object} context.config the current normalized config
 */
export function createSceneActions({ gladys, client, store, config }) {
  const issues = createIssueLog(logger);

  /**
   * Count the click; its answer is the stream to play. The click is the
   * directory's statistics, never a reason to fail the scene: the stored
   * stream is played when it does not answer.
   */
  async function click(station) {
    try {
      const url = await client.click(station.uuid);
      issues.ok('click', 'Clicks are counted again');
      return url;
    } catch (err) {
      issues.fail('click', `Click not counted (${err.message}), the known stream is used`);
      return streamUrlOf(station);
    }
  }

  return {
    /** The stream of a favorite station, for the next action of the scene. */
    async get_stream(fields) {
      const uuid = stationUuidOf(gladys, fields.station);
      const favorite = uuid ? store.get(uuid) : null;
      if (!favorite) {
        throw new UserError(MESSAGES.NOT_A_FAVORITE, config().language);
      }
      const name = displayName(favorite);
      logger.info(`Scene action get_stream <- "${name}"`);
      return outputsOf(favorite.station, name, await click(favorite.station));
    },

    /** A random working station of a genre, a country or a language. */
    async random_station(fields) {
      const criteria = {
        tag: String(fields.tag ?? '').trim(),
        country: String(fields.country ?? '').trim(),
        language: String(fields.language ?? '').trim(),
      };
      logger.info(
        `Scene action random_station <- ${JSON.stringify(
          Object.fromEntries(Object.entries(criteria).filter(([, value]) => value)),
        )}`,
      );
      let stations;
      try {
        stations = await client.search({ ...criteria, order: 'random', limit: 1 });
      } catch (err) {
        logger.warn(`Random station: Radio Browser unreachable (${err.message})`);
        throw new UserError(MESSAGES.API_UNREACHABLE, config().language, err);
      }
      const [station] = stations;
      if (!station) {
        throw new UserError(MESSAGES.NO_RANDOM_STATION, config().language);
      }
      return outputsOf(station, station.name, await click(station));
    },
  };
}
