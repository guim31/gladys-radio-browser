// -----------------------------------------------------------------------------
// The container's own refresh timer.
//
// The devices are published with `should_poll: true` and a valid
// `poll_frequency`, but the core cannot be trusted to call onPoll: Gladys
// 5.2.x skips devices created without `should_poll`, and a device keeps the
// polling fields it was created with (GladysAssistant/Gladys#3198). So the
// container refreshes by itself, at the configured pace, and the core's
// onPoll is only a fallback: it refreshes when the timer has not done so
// for 90 % of a period, and does nothing otherwise.
//
// One cycle = ONE request to the directory for every favorite
// (`/json/stations/byuuid`), however many there are. The states are then
// published for the devices the user added to Gladys only (`gladys.devices`):
// the core drops the states of a device it does not know.
//
// Only what changed is sent (the SDK's publishChangedStates); an unchanged
// value is sent again every STATE_HEARTBEAT_MS, so Gladys never shows "no
// recent value" on a station that simply did not change.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { refreshPeriodMs } from './config.js';
import { createIssueLog } from './issues.js';
import { MESSAGES } from './messages.js';
import { stationIds, stationStates, stationUuidOf } from './devices/station.js';

const logger = createLogger({ name: 'refresh' });

// With a refresh every 6 h at most (REFRESH_MINUTES_MAX), an unchanged value
// is sent again within 12 h.
export const STATE_HEARTBEAT_MS = 6 * 60 * 60 * 1000;

/**
 * @param {object} options
 * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
 * @param {object} options.client RadioBrowser
 * @param {object} options.store FavoriteStore
 * @param {() => object} options.getConfig the current normalized config
 * @param {(change: { metadataChanged: boolean }) => Promise<void>} [options.onChanged]
 *   the stored copies changed (widget, discovered devices to refresh)
 * @param {boolean} [options.timers] run the periodic timer (tests may turn it off)
 * @param {() => number} [options.now]
 */
export function createRefresher({
  gladys,
  client,
  store,
  getConfig,
  onChanged = async () => {},
  timers = true,
  now = () => Date.now(),
}) {
  const issues = createIssueLog(logger);
  let lastRefreshAt;
  let inFlight = null;
  let timer = null;
  let stopped = false;
  // What the Configuration screen shows, sent only when it changes.
  let reachable = null;

  const periodMs = () => refreshPeriodMs(getConfig());

  async function setReachable(value) {
    if (reachable === value) return;
    reachable = value;
    await gladys
      .setConnectionStatus(value, value ? undefined : MESSAGES.API_DOWN)
      .catch((err) => logger.debug(`Connection status not sent (${err.message})`));
  }

  /** The favorites whose device the user added to Gladys. */
  function addedFavorites() {
    const added = new Set((gladys.devices ?? []).map((device) => device.external_id));
    return store
      .list()
      .filter((favorite) => added.has(stationIds(gladys, favorite.station.uuid).device));
  }

  async function publish(favorites) {
    if (favorites.length === 0) return;
    try {
      const { count } = await gladys.publishChangedStates(
        favorites.flatMap((favorite) => stationStates(gladys, favorite)),
        { heartbeat: STATE_HEARTBEAT_MS },
      );
      logger.debug(`${count} state(s) published`);
      issues.ok('states', 'States are published again');
    } catch (err) {
      issues.fail('states', `States not published (${err.message})`);
    }
  }

  async function run() {
    const favorites = store.list();
    if (favorites.length === 0) {
      logger.debug('No favorite: nothing to refresh');
      return;
    }
    let stations;
    try {
      stations = await client.stationsByUuid(favorites.map((favorite) => favorite.station.uuid));
    } catch (err) {
      issues.fail('api', `Radio Browser unreachable (${err.message})`);
      await setReachable(false);
      return;
    }
    issues.ok('api', 'Radio Browser is reachable again');
    await setReachable(true);
    const change = await store.update(stations);
    logger.debug(`${stations.length}/${favorites.length} favorite(s) read from Radio Browser`);
    if (change.changed) {
      await onChanged(change).catch((err) =>
        logger.warn(`Update after the refresh failed (${err.message})`),
      );
    }
    await publish(addedFavorites());
  }

  /**
   * Refresh now, unless it was done less than `minGap` periods ago. A
   * refresh in progress is shared.
   */
  async function refresh({ force = false, minGap = 0.5 } = {}) {
    if (inFlight) return inFlight;
    if (gladys.connected === false) {
      logger.debug('Gladys unreachable: refresh skipped');
      return undefined;
    }
    if (!force && lastRefreshAt !== undefined && now() - lastRefreshAt < periodMs() * minGap) {
      logger.debug(`Refreshed ${now() - lastRefreshAt} ms ago: skipped`);
      return undefined;
    }
    lastRefreshAt = now();
    inFlight = run().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!timers || stopped) return;
    timer = setTimeout(async () => {
      timer = null;
      try {
        await refresh();
      } catch (err) {
        logger.error(`Refresh cycle failed (${err.message})`);
      } finally {
        schedule();
      }
    }, periodMs());
  }

  const api = {
    refresh,

    /** Resolves once no refresh is running (tests). */
    async idle() {
      await inFlight?.catch(() => {});
    },

    /** The core's onPoll (fallback): refreshes unless the timer just did. */
    async pollFromCore(device) {
      if (!stationUuidOf(gladys, device.external_id)) {
        logger.debug(`onPoll ignored for ${device.external_id}`);
        return;
      }
      await refresh({ minGap: 0.9 });
    },

    /**
     * A device was just added (or updated) in Gladys: its states are sent
     * now, from the stored copy — no request, and it works while the
     * directory is down.
     */
    async publishDevice(device) {
      const uuid = stationUuidOf(gladys, device.external_id);
      const favorite = uuid ? store.get(uuid) : null;
      if (favorite) {
        await publish([favorite]);
      }
    },

    /** (Re)start: refresh now, then every period. */
    async restart() {
      stopped = false;
      schedule();
      await refresh({ force: true });
    },

    /** The period changed: the next refresh is one new period away. */
    reschedule() {
      schedule();
    },

    stop() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
    },
  };
  return api;
}
