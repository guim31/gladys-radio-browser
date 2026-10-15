// -----------------------------------------------------------------------------
// Short descriptions of a station, the same in every language: country names
// and codecs come from the directory as they are, units are international.
// -----------------------------------------------------------------------------

/** `France · AAC 192 kbit/s`: what tells two stations of one name apart. */
export function stationSummary(station) {
  const sound = [station.codec, station.bitrate > 0 ? `${station.bitrate} kbit/s` : '']
    .filter(Boolean)
    .join(' ');
  return [station.country || station.countrycode, sound].filter(Boolean).join(' · ');
}

/** Cut a text to `max` characters, with an ellipsis when it was longer. */
export function truncate(text, max) {
  const value = String(text ?? '');
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** Lowercase, without accents: to compare names the way people read them. */
export function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}
