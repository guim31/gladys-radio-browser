// -----------------------------------------------------------------------------
// Entry point of the Radio Browser integration: SDK wiring only. Handlers are
// registered before connect(); the work lives in src/ (see src/app.js).
//
// Environment variables provided by the Gladys supervisor (read by the SDK):
// GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';
import { FavoriteStore } from './src/favorites.js';
import { RadioBrowser } from './src/radiobrowser.js';

logger.info('Starting the Radio Browser integration...');

const gladys = new GladysIntegration();
const store = new FavoriteStore();
const favorites = await store.load();
logger.info(`${favorites.length} favorite station(s) loaded`);

const app = createApp({ gladys, client: new RadioBrowser(), store });

gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  app.stop();
});

gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
