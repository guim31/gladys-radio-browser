// -----------------------------------------------------------------------------
// The Configuration screen actions: search, add, list, remove.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIP, FRANCE_INTER, STATION_538, setupApp } from './helpers/directory.js';

const ok = (ack) => {
  assert.equal(ack.success, true, ack.error);
  return ack.data?.message ?? ack.data;
};

test('a search lists numbered results in the four languages', async (t) => {
  const { gladys } = await setupApp(t);
  const message = ok(await gladys.fake.action('search', { name: 'FIP' }));
  assert.deepEqual(Object.keys(message).sort(), ['de', 'en', 'es', 'fr']);
  const lines = message.fr.split('\n');
  assert.match(lines[0], /^3 station\(s\) trouvée\(s\)/);
  assert.equal(lines[1], '1. FIP — France · AAC 192 kbit/s');
  assert.equal(lines.length, 4, 'the duplicate stream is listed once');
});

test('a search needs one criterion, and says when nothing is found', async (t) => {
  const { gladys } = await setupApp(t, { config: { language: 'en' } });
  const empty = await gladys.fake.action('search', {});
  assert.equal(empty.success, false);
  assert.match(empty.error, /at least one field/);
  const none = ok(await gladys.fake.action('search', { name: 'zzzz' }));
  assert.match(none.en, /No station found/);
});

test('a search tells the stations already in the favorites', async (t) => {
  const { gladys } = await setupApp(t, { favorites: [FIP] });
  const message = ok(await gladys.fake.action('search', { name: 'FIP' }));
  assert.match(message.en.split('\n')[1], /★ already a favorite$/);
});

test('adding the result number 1 makes it a favorite and a discovered device', async (t) => {
  const { gladys, store } = await setupApp(t);
  ok(await gladys.fake.action('search', { name: 'France Inter' }));
  const message = ok(await gladys.fake.action('add_favorite', { station: '1' }));
  assert.match(message.fr, /« France Inter » est maintenant un favori/);
  assert.equal(store.list()[0].station.uuid, FRANCE_INTER);
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.name),
    ['France Inter'],
  );
  assert.ok(gladys.fake.widgetRefreshes.includes('favorites'));
});

test('a station can be added by its uuid or its radio-browser.info address, with a name', async (t) => {
  const { gladys, store } = await setupApp(t);
  ok(await gladys.fake.action('add_favorite', { station: STATION_538, name: 'Radio 538' }));
  ok(
    await gladys.fake.action('add_favorite', {
      station: `https://www.radio-browser.info/history/${FIP.toUpperCase()}`,
    }),
  );
  assert.deepEqual(
    store.list().map((favorite) => favorite.custom_name || favorite.station.name),
    ['Radio 538', 'FIP'],
  );
  const again = ok(await gladys.fake.action('add_favorite', { station: FIP }));
  assert.match(again.en, /already a favorite/);
  assert.equal(store.list().length, 2);
});

test('adding without a search, a wrong number or an unknown uuid explains why', async (t) => {
  const { gladys } = await setupApp(t, { config: { language: 'de' } });
  const noSearch = await gladys.fake.action('add_favorite', { station: '1' });
  assert.match(noSearch.error, /zuerst „Sender suchen“/);
  ok(await gladys.fake.action('search', { name: 'FIP' }));
  assert.match((await gladys.fake.action('add_favorite', { station: '9' })).error, /Nummer 9/);
  assert.match((await gladys.fake.action('add_favorite', { station: 'hello' })).error, /UUID/);
  const unknown = await gladys.fake.action('add_favorite', {
    station: '00000000-0000-4000-8000-000000000000',
  });
  assert.match(unknown.error, /keinen Sender/);
});

test('the directory down: the action says so in the language of the configuration', async (t) => {
  const { gladys, directory } = await setupApp(t, { config: { language: 'es' } });
  directory.state = 'down';
  const ack = await gladys.fake.action('search', { tag: 'jazz' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /No se puede contactar con Radio Browser/);
});

test('the list tells which favorites were added to Gladys', async (t) => {
  const { gladys } = await setupApp(t, { favorites: [FIP] });
  ok(await gladys.fake.action('add_favorite', { station: FRANCE_INTER }));
  const message = ok(await gladys.fake.action('list_favorites'));
  assert.deepEqual(message.fr.split('\n'), [
    '2 favori(s) :',
    '1. FIP — France · AAC 192 kbit/s (dans Gladys)',
    '2. France Inter — France · MP3 128 kbit/s (pas encore ajouté à Gladys)',
  ]);
});

test('a favorite is removed by its number, its name or its uuid', async (t) => {
  const { gladys, store } = await setupApp(t, { favorites: [FIP, FRANCE_INTER, STATION_538] });
  ok(await gladys.fake.action('remove_favorite', { station: '3' }));
  ok(await gladys.fake.action('remove_favorite', { station: 'france inter' }));
  const message = ok(await gladys.fake.action('remove_favorite', { station: FIP }));
  assert.match(message.en, /"FIP" is no longer a favorite/);
  assert.deepEqual(store.list(), []);
  assert.deepEqual(gladys.fake.discoveredDevices, []);
  const empty = ok(await gladys.fake.action('list_favorites'));
  assert.match(empty.en, /No favorite station yet/);
  const unknown = await gladys.fake.action('remove_favorite', { station: 'FIP' });
  assert.equal(unknown.success, false);
});
