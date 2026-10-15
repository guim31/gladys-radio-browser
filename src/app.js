// -----------------------------------------------------------------------------
// The integration, wired to a Gladys client: handlers, discovery, refresh.
//
// index.js passes the real SDK client; the tests pass the SDK's fake Gladys,
// a fake directory and a temporary data folder, and drive the very same code.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { createActions } from './actions.js';
import { createSceneActions } from './scenes.js';
import { createWidgets, refreshWidget } from './widgets.js';
import { createRefresher } from './refresher.js';
import { createLogos } from './logos.js';
import { buildDevice } from './devices/station.js';

const logger = createLogger({ name: 'app' });

/**
 * @param {object} options
 * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
 * @param {object} options.client RadioBrowser
 * @param {object} options.store FavoriteStore, loaded
 * @param {object} [options.logos] see src/logos.js
 * @param {boolean} [options.timers] run the refresh timer
 * @param {() => number} [options.now]
 */
export function createApp({ gladys, client, store, logos, timers = true, now }) {
  let config = normalizeConfig(gladys.config);
  const getConfig = () => config;
  const logoService = logos ?? createLogos({ favorites: () => store.list() });

  async function publishDiscovered() {
    await gladys.publishDiscoveredDevices(
      store.list().map((favorite) => buildDevice(gladys, favorite, config.language)),
    );
  }

  const refresher = createRefresher({
    gladys,
    client,
    store,
    getConfig,
    timers,
    now,
    onChanged: async ({ metadataChanged }) => {
      // Name, country, logo... are device params: published again so the
      // core upserts them; the states follow in the same refresh.
      if (metadataChanged) await publishDiscovered();
      refreshWidget(gladys);
    },
  });

  /** After an action added or removed a favorite. */
  async function favoritesChanged() {
    await publishDiscovered();
    refreshWidget(gladys);
    logoService
      .check(store.list())
      .then((usable) => usable && refreshWidget(gladys))
      .catch(() => {});
  }

  const context = { gladys, client, store, config: getConfig, favoritesChanged };
  const actions = createActions(context);
  const sceneActions = createSceneActions(context);
  const widgets = createWidgets({ gladys, store, logos: logoService });

  // --- Discovery and polling ---------------------------------------------------
  gladys.onScanRequest(async () => {
    await publishDiscovered();
  });
  gladys.onPoll((device) => refresher.pollFromCore(device));

  // --- Device lifecycle --------------------------------------------------------
  // The core drops the states received before a feature exists: they are sent
  // again once the user added the device (the SDK forgot them by then).
  gladys.onDeviceCreated(async (device) => {
    await refresher.publishDevice(device);
    refreshWidget(gladys);
  });
  gladys.onDeviceUpdated(async (device) => {
    await refresher.publishDevice(device);
  });

  // --- Actions, scene actions, widget ------------------------------------------
  for (const [key, handler] of Object.entries(actions)) {
    gladys.onAction(key, (fields) => handler(fields ?? {}));
  }
  for (const [key, handler] of Object.entries(sceneActions)) {
    gladys.onSceneAction(key, (fields) => handler(fields ?? {}));
  }
  for (const [key, widget] of Object.entries(widgets)) {
    gladys.onWidgetGet(key, (request) => widget.get(request));
  }
  gladys.onWidgetGetImage((imageKey) => logoService.get(imageKey));

  // --- Configuration -----------------------------------------------------------
  gladys.onConfigUpdated(async (newConfig) => {
    const previous = config;
    config = normalizeConfig(newConfig);
    logger.info('New configuration received');
    if (config.refresh_minutes !== previous.refresh_minutes) refresher.reschedule();
    // Feature names follow the language for the devices added from now on.
    if (config.language !== previous.language) await publishDiscovered();
  });

  // --- Connection lifecycle ----------------------------------------------------
  gladys.on('connected', async () => {
    try {
      config = normalizeConfig(gladys.config);
      // Fill the Discover tab without waiting for the user to ask.
      await publishDiscovered();
      // Nudges sent while the socket was down were dropped.
      refreshWidget(gladys);
      await refresher.restart();
    } catch (err) {
      logger.error(`Post-connection initialization failed (${err.message})`);
    }
  });

  return {
    actions,
    sceneActions,
    widgets,
    refresher,
    publishDiscovered,
    stop: () => refresher.stop(),
  };
}
