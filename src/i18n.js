// -----------------------------------------------------------------------------
// Languages of the texts the integration produces.
//
// Gladys exists in English, French, German and Spanish, and shows the text of
// the user's language, English otherwise. A widget content or a manifest
// action result is a `{ en, fr, de, es }` object the front resolves itself; an
// error thrown to a scene action, and the names of the features, are plain
// strings picked here from the `language` of the configuration (a "device"
// integration never learns the user's language).
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

/** The text of `language` in a `{ en, fr, de, es }` object, English otherwise. */
export function localize(text, language) {
  return text[language] ?? text.en;
}

/** Apply `fn(language)` to every language: a `{ en, fr, de, es }` object. */
export function perLanguage(fn) {
  return Object.fromEntries(LANGUAGES.map((language) => [language, fn(language)]));
}

/** An error whose message is meant for the user, in `{ en, fr, de, es }`. */
export class UserError extends Error {
  constructor(text, language = 'en', cause) {
    super(localize(text, language), { cause });
    this.name = 'UserError';
    this.text = text;
  }
}
