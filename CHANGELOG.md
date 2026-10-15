# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-10-15

### Added

- Search the Radio Browser directory of web radios (name, country, language,
  genre) from the Configuration tab, and keep up to 50 favorite stations.
- One Gladys device per favorite station: stream online, bitrate, codec and
  stream address, with the country, language, genres, website and logo as
  parameters. The integration refreshes them by itself, in one request for
  all favorites (every 60 minutes by default, 15 to 360).
- "Favorite radios" dashboard widget: the favorites with their logo, country,
  codec, bitrate and stream state, and links to their website and https
  stream.
- "Get the stream of a radio" and "Pick a random radio" scene actions: the
  stream address, name, codec and bitrate for the "Play a URL" action of a
  player (the DLNA integration, for example). A listen is counted in Radio
  Browser each time.
- English, French, German and Spanish, in the configuration, the messages,
  the widget, the feature names and the documentation.

[Unreleased]: https://github.com/guim31/gladys-radio-browser/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-radio-browser/releases/tag/v1.0.1
