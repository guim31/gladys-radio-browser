// -----------------------------------------------------------------------------
// Translations: Gladys exists in English, French, German and Spanish. Every
// multi-language text of the manifest and of the code carries exactly these
// four languages, none empty, none longer than the place it is shown allows;
// the four documentation files have the same sections.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { LANGUAGES, localize } from '../src/i18n.js';
import { MESSAGES } from '../src/messages.js';
import { NAMES, FEATURE_KEYS } from '../src/devices/station.js';
import { favoritesContent } from '../src/widgets.js';
import { normalizeStation } from '../src/radiobrowser.js';
import { rawStations } from './helpers/directory.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const EXPECTED = [...LANGUAGES].sort();
// The core's language key grammar: an object made only of such keys is a
// multi-language text.
const LANGUAGE_KEY = /^[a-z]{2}(-[A-Z]{2})?$/;

const isLocalized = (value) =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length > 0 &&
  Object.keys(value).every((key) => LANGUAGE_KEY.test(key));

/** Every multi-language text under `root`, with its path. */
function collect(root, path = '') {
  if (isLocalized(root)) return [{ path, text: root }];
  if (Array.isArray(root)) return root.flatMap((item, index) => collect(item, `${path}[${index}]`));
  if (root && typeof root === 'object') {
    return Object.entries(root).flatMap(([key, value]) =>
      collect(value, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

function checkText({ path, text }, max = Infinity, min = 1) {
  assert.deepEqual(Object.keys(text).sort(), EXPECTED, `${path}: languages`);
  for (const lang of LANGUAGES) {
    assert.equal(typeof text[lang], 'string', `${path}.${lang}`);
    assert.ok(text[lang].trim().length >= min, `${path}.${lang} is empty or too short`);
    assert.ok(
      text[lang].length <= max,
      `${path}.${lang} has ${text[lang].length} characters (${max} at most)`,
    );
  }
}

// What the core and the store allow, by place in the manifest.
function maxLengthOf(path) {
  if (path === 'description') return 100; // catalog card
  if (/^widgets\[\d+\]\.label$/.test(path)) return 30;
  if (/^widgets\[\d+\]\.description$/.test(path)) return 100;
  if (/\.description$/.test(path)) return 1000; // a section text
  return 200;
}

/** Every text of the message table, templates filled with a sample value. */
function messageTexts() {
  return Object.entries(MESSAGES).map(([key, value]) => ({
    path: `MESSAGES.${key}`,
    text: typeof value === 'function' ? value('Sample 42') : value,
  }));
}

test('the configuration offers exactly the languages of the code, French first', () => {
  const language = manifest.config_schema.find((field) => field.key === 'language');
  assert.deepEqual(
    language.options.map((option) => option.value),
    LANGUAGES,
  );
  assert.equal(language.default, 'fr');
  assert.deepEqual(LANGUAGES, ['en', 'fr', 'de', 'es']);
});

test('every manifest text exists in English, French, German and Spanish', () => {
  const texts = collect(manifest);
  // Nothing skipped: every label of every field, option, widget, scene card…
  const labels = JSON.stringify(manifest).match(/"label":/g).length;
  assert.equal(texts.filter(({ path }) => path.endsWith('.label')).length, labels);
  assert.ok(texts.length > 60, `only ${texts.length} texts found`);
  for (const entry of texts) {
    checkText(entry, maxLengthOf(entry.path), entry.path === 'description' ? 10 : 1);
  }
});

test('the name is the same in every language', () => {
  assert.equal(typeof manifest.name, 'string');
});

test('no plain string where the manifest expects a translated text', () => {
  const textKeys = new Set(['label', 'description', 'placeholder']);
  const walk = (node, path) => {
    if (Array.isArray(node)) return node.forEach((item, i) => walk(item, `${path}[${i}]`));
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (textKeys.has(key)) {
        assert.ok(isLocalized(value), `${path}.${key} is not a multi-language text`);
      } else {
        walk(value, `${path}.${key}`);
      }
    }
  };
  walk(manifest, 'manifest');
});

test('every message of the code is translated', () => {
  const texts = messageTexts();
  assert.ok(texts.length >= 30, `only ${texts.length} texts checked`);
  // An error or an action result: short enough to read under a button.
  for (const entry of texts) checkText(entry, 200);
});

test('the feature names exist in every language, distinct within a device', () => {
  assert.deepEqual(Object.keys(NAMES).sort(), EXPECTED);
  for (const lang of LANGUAGES) {
    assert.deepEqual(Object.keys(NAMES[lang]).sort(), [...FEATURE_KEYS].sort(), `NAMES.${lang}`);
    const names = Object.values(NAMES[lang]);
    for (const name of names) assert.ok(name.trim(), `NAMES.${lang}`);
    assert.equal(new Set(names).size, names.length, `NAMES.${lang}: duplicates`);
  }
});

test('the widget contents are translated and fit the core budget in every language', async () => {
  const favorites = (await rawStations())
    .map(normalizeStation)
    .filter(Boolean)
    .map((station, index) => ({ station, custom_name: '', missing: index === 1 }));
  const contents = [
    favoritesContent(favorites, { logoStatus: () => 'ok' }),
    favoritesContent(favorites, { display: 'list' }),
    favoritesContent([]),
  ];
  for (const content of contents) {
    assert.deepEqual(validateWidgetContent(content), []);
    for (const entry of collect(content)) checkText(entry);
    // Each language on its own, as the front resolves it.
    for (const lang of LANGUAGES) {
      const resolved = JSON.parse(
        JSON.stringify(content, (key, value) =>
          isLocalized(value) ? localize(value, lang) : value,
        ),
      );
      assert.deepEqual(validateWidgetContent(resolved), [], lang);
    }
  }
});

test('no text of the code is left without German or Spanish', async () => {
  // A literal `{ en, fr }` written without German and Spanish, or a text
  // picked by `language === 'fr'`, would slip past the tables above.
  const dir = new URL('../src/', import.meta.url);
  const files = (await readdir(dir, { recursive: true })).filter((name) => name.endsWith('.js'));
  for (const name of files) {
    const source = await readFile(new URL(name, dir), 'utf8');
    const count = (key) =>
      (source.match(new RegExp(`^\\s*${key}:|[{,]\\s*${key}:`, 'gm')) ?? []).length;
    assert.equal(count('de'), count('fr'), `${name}: French texts without German`);
    assert.equal(count('es'), count('fr'), `${name}: French texts without Spanish`);
    assert.doesNotMatch(source, /===\s*'fr'\s*\?/, `${name}: a text chosen by language`);
  }
});

/** Every German text: manifest, messages, feature names. */
function germanTexts() {
  return [
    ...collect(manifest).map(({ path, text }) => [path, text.de]),
    ...messageTexts().map(({ path, text }) => [path, text.de]),
    ...Object.entries(NAMES.de).map(([key, text]) => [`NAMES.de.${key}`, text]),
  ];
}

test('German speaks to the user with "du", as the recent screens of Gladys do', () => {
  // The polite forms only: "Sie" (capitalized, a whole word) and the
  // possessive "Ihr…". A lowercase "sie" (she, they, it) is fine.
  const polite = /\b(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres|Ihnen)\b/;
  const texts = germanTexts();
  assert.ok(texts.length > 80, `only ${texts.length} German texts checked`);
  for (const [path, text] of texts) {
    assert.doesNotMatch(text, polite, `${path}: "${text}" uses the polite form`);
  }
});

test('Spanish speaks to the user with "usted"', () => {
  const familiar = /\b(tú|tu|tus|puedes|tienes|quieres|elige|añade|busca|abre|pulsa)\b/i;
  const spanish = [
    ...collect(manifest).map(({ path, text }) => [path, text.es]),
    ...messageTexts().map(({ path, text }) => [path, text.es]),
  ];
  for (const [path, text] of spanish) {
    assert.doesNotMatch(text, familiar, `${path}: "${text}" uses the familiar form`);
  }
});

// --- Documentation -------------------------------------------------------------

const docs = Object.fromEntries(
  await Promise.all(
    LANGUAGES.map(async (lang) => [
      lang,
      await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8'),
    ]),
  ),
);

/** The outline of a document: the level of each heading, in order. */
const outline = (markdown) =>
  markdown
    .split('\n')
    .filter((line) => /^#{1,4} /.test(line))
    .map((line) => line.match(/^#+/)[0].length);

test('the four documentation files exist, with the same sections', () => {
  const reference = outline(docs.en);
  assert.ok(reference.filter((level) => level === 2).length >= 9, 'the sections the store expects');
  for (const lang of LANGUAGES) {
    assert.ok(docs[lang].length >= 300, `docs/${lang}.md is too short for the store`);
    assert.deepEqual(outline(docs[lang]), reference, `docs/${lang}.md: sections`);
  }
});

test('the documentation names every action, scene action and widget of the manifest', () => {
  for (const lang of LANGUAGES) {
    for (const entry of [...manifest.actions, ...manifest.scene_actions, ...manifest.widgets]) {
      assert.ok(
        docs[lang].includes(entry.label[lang]),
        `docs/${lang}.md does not name "${entry.label[lang]}"`,
      );
    }
    assert.match(docs[lang], /radio-browser\.info/, `docs/${lang}.md: not affiliated`);
  }
});

test('German documentation speaks with "du" too', () => {
  assert.doesNotMatch(docs.de, /\b(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres|Ihnen)\b/);
});
