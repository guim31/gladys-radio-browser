// -----------------------------------------------------------------------------
// The favorites file in /data: persistence, limits, refresh of the copies.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FavoriteStore, MAX_FAVORITES, displayName } from '../src/favorites.js';
import { normalizeStation } from '../src/radiobrowser.js';
import { FIP, FRANCE_INTER, rawStations } from './helpers/directory.js';

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'favorites-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

const stations = async () => (await rawStations()).map(normalizeStation).filter(Boolean);
const byUuid = async (uuid) => (await stations()).find((station) => station.uuid === uuid);

test('favorites survive a restart of the container', async (t) => {
  const dir = await tempDir(t);
  const store = new FavoriteStore({ dir });
  await store.load();
  assert.deepEqual(store.list(), []);
  await store.add(await byUuid(FIP));
  await store.add(await byUuid(FRANCE_INTER), 'Inter');

  const again = new FavoriteStore({ dir });
  await again.load();
  assert.deepEqual(again.list().map(displayName), ['FIP', 'Inter']);
  assert.equal(again.get(FIP).station.codec, 'AAC');
  const file = JSON.parse(await readFile(join(dir, 'favorites.json'), 'utf8'));
  assert.equal(file.version, 1);
  assert.ok(!('stationuuid' in file.favorites[0].station), 'only the normalized fields are stored');
});

test('adding a favorite twice keeps one, with the new name', async (t) => {
  const store = new FavoriteStore({ dir: await tempDir(t) });
  await store.load();
  const first = await store.add(await byUuid(FIP));
  const second = await store.add(await byUuid(FIP), '  FIP Paris  ');
  assert.equal(first.added, true);
  assert.equal(second.added, false);
  assert.equal(store.list().length, 1);
  assert.equal(displayName(store.get(FIP)), 'FIP Paris');
});

test(`${MAX_FAVORITES} favorites at most`, async (t) => {
  const store = new FavoriteStore({ dir: await tempDir(t) });
  await store.load();
  const base = await byUuid(FIP);
  for (let i = 0; i < MAX_FAVORITES; i += 1) {
    const uuid = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    await store.add({ ...base, uuid });
  }
  await assert.rejects(store.add(await byUuid(FRANCE_INTER)), RangeError);
});

test('a removed favorite is gone from the file', async (t) => {
  const dir = await tempDir(t);
  const store = new FavoriteStore({ dir });
  await store.load();
  await store.add(await byUuid(FIP));
  assert.equal((await store.remove(FIP)).station.uuid, FIP);
  assert.equal(await store.remove(FIP), null);
  const again = new FavoriteStore({ dir });
  assert.deepEqual(await again.load(), []);
});

test('a broken file is kept aside, and the list starts empty', async (t) => {
  const dir = await tempDir(t);
  await writeFile(join(dir, 'favorites.json'), '{ not json');
  const store = new FavoriteStore({ dir });
  assert.deepEqual(await store.load(), []);
  assert.equal(await readFile(join(dir, 'favorites.json.broken'), 'utf8'), '{ not json');
});

test('entries that are not stations are skipped when reading', async (t) => {
  const dir = await tempDir(t);
  const good = await byUuid(FIP);
  await writeFile(
    join(dir, 'favorites.json'),
    JSON.stringify({
      version: 1,
      favorites: [
        { station: { uuid: '../x', url: 'http://a' } },
        { station: good },
        { station: good },
        42,
      ],
    }),
  );
  const store = new FavoriteStore({ dir });
  const list = await store.load();
  assert.equal(list.length, 1);
  assert.equal(list[0].station.uuid, FIP);
});

test('a refresh updates the copies, and marks a station gone from the directory', async (t) => {
  const store = new FavoriteStore({ dir: await tempDir(t) });
  await store.load();
  await store.add(await byUuid(FIP));
  await store.add(await byUuid(FRANCE_INTER));

  assert.deepEqual(await store.update([await byUuid(FIP), await byUuid(FRANCE_INTER)]), {
    changed: false,
    metadataChanged: false,
  });

  const fip = { ...(await byUuid(FIP)), bitrate: 256, online: false };
  let change = await store.update([fip, await byUuid(FRANCE_INTER)]);
  assert.deepEqual(change, { changed: true, metadataChanged: false });
  assert.equal(store.get(FIP).station.bitrate, 256);

  change = await store.update([{ ...fip, favicon: 'https://logo.example/fip.png' }]);
  assert.deepEqual(change, { changed: true, metadataChanged: true });
  assert.equal(store.get(FRANCE_INTER).missing, true);

  await store.update([fip, await byUuid(FRANCE_INTER)]);
  assert.equal(store.get(FRANCE_INTER).missing, false);
});
