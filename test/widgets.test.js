// -----------------------------------------------------------------------------
// The favorites widget: content within the core budget, logos served safely.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent, validateWidgetImage } from '@gladysassistant/integration-sdk';
import { logoKey } from '../src/logos.js';
import { CLASSIC_VINYL, FIP, FRANCE_INTER, STATION_538, setupApp } from './helpers/directory.js';

const content = (ack) => {
  assert.equal(ack.success, true, ack.error);
  return ack.data.content;
};

async function settle(t, logos, favorites) {
  // The logo check runs in the background after a content.
  await logos.check(favorites);
}

test('the widget lists the favorites with their details and links', async (t) => {
  const { gladys } = await setupApp(t, { favorites: [FIP, FRANCE_INTER] });
  const body = content(await gladys.fake.widgetGet('favorites', { language: 'fr' }));
  assert.deepEqual(validateWidgetContent(body), []);
  const [list] = body.components;
  assert.equal(list.type, 'card-list');
  assert.equal(list.display, 'grid');
  const [fip] = list.items;
  assert.equal(fip.title, 'FIP');
  assert.equal(fip.subtitle, 'France · AAC 192 kbit/s');
  assert.equal(fip.badge.color, 'success');
  assert.equal(fip.badge.text.fr, 'En ligne');
  assert.match(fip.description.fr, /Langue : french/);
  assert.deepEqual(
    fip.links.map((link) => link.url),
    ['https://www.radiofrance.fr/fip', 'https://icecast.radiofrance.fr/fip-hifi.aac'],
  );
});

test('a usable logo is shown once checked, an .ico never', async (t) => {
  const { gladys, logos, store } = await setupApp(t, { favorites: [STATION_538, FIP] });
  let body = content(await gladys.fake.widgetGet('favorites'));
  assert.ok(body.components[0].items.every((item) => item.image === undefined));
  await settle(t, logos, store.list());
  assert.ok(gladys.fake.widgetRefreshes.includes('favorites'), 'the widget is nudged');

  body = content(await gladys.fake.widgetGet('favorites'));
  const [radio538, fip] = body.components[0].items;
  const key = logoKey('https://www.538.nl/icons/apple-icon-120x120.png');
  assert.equal(radio538.image, key);
  assert.equal(fip.image, undefined, 'favicon.ico is not a format Gladys shows');

  const image = await gladys.fake.widgetGetImage(key);
  assert.equal(image.success, true);
  assert.deepEqual(validateWidgetImage(image.data.image), []);
});

test('only the logos of the favorites can be asked', async (t) => {
  const { gladys, logoFetches } = await setupApp(t, { favorites: [FIP] });
  const ack = await gladys.fake.widgetGetImage(logoKey('https://evil.example/x.png'));
  assert.equal(ack.success, false);
  assert.deepEqual(logoFetches, []);
});

test('the widget shows the chosen stations, as a list if asked', async (t) => {
  const { gladys } = await setupApp(t, { favorites: [FIP, FRANCE_INTER, CLASSIC_VINYL] });
  const body = content(
    await gladys.fake.widgetGet('favorites', {
      settings: {
        stations: [
          `ext:test-integration:station:${CLASSIC_VINYL}`,
          `ext:test-integration:station:${FIP}`,
        ],
        display: 'list',
      },
    }),
  );
  assert.deepEqual(validateWidgetContent(body), []);
  assert.equal(body.components[0].display, 'list');
  assert.deepEqual(
    body.components[0].items.map((item) => item.title),
    ['Classic Vinyl HD', 'FIP'],
  );
});

test('an offline station has a red badge; no favorite gives a hint', async (t) => {
  const { gladys, directory, app } = await setupApp(t, { favorites: [FIP] });
  directory.stations.find((s) => s.stationuuid === FIP).lastcheckok = 0;
  await app.refresher.refresh({ force: true });
  const [item] = content(await gladys.fake.widgetGet('favorites')).components[0].items;
  assert.equal(item.badge.color, 'danger');

  const empty = await setupApp(t);
  const body = content(await empty.gladys.fake.widgetGet('favorites'));
  assert.deepEqual(validateWidgetContent(body), []);
  assert.equal(body.components[0].type, 'text');
});
