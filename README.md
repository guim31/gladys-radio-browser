# Radio Browser for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that brings the web radios of the whole world from
[Radio Browser](https://www.radio-browser.info/), a free directory of about
50,000 stations run by volunteers. No account, no key.

> Not affiliated with radio-browser.info.

## What it does

- **Search** the directory by name, country, language or genre, from the
  actions of the Configuration tab.
- **Favorites**: each favorite station becomes a Gladys device (stream online,
  bitrate, codec, stream address; country, language, genres, website and logo
  as parameters), stored in `/data` with its last known details.
- **Dashboard widget** "Favorite radios": the favorites with their logo,
  country, codec, bitrate and stream state; a tap shows the details and links
  to the website and to the https stream.
- **Scene actions** "Get the stream of a radio" (a favorite) and "Pick a
  random radio" (a genre, a country, a language): they give the stream
  address, name, codec, bitrate and state to the next actions of the scene.
  A listen is counted in Radio Browser each time, as the directory asks.

### Playing a radio

Gladys 5.2 gives an external integration **no way to command a device of
another integration**: the host API has no "set the value of that device", a
`source: "devices"` field only lists the integration's own devices, and the
core's `music.play-notification` scene action only plays a spoken text (on
Sonos it reverts after 20 seconds, on AirPlay after 5 minutes). So the
integration does not play anything itself; a scene chains two actions:

1. **Get the stream of a radio**, station FIP;
2. **Play a URL on a DLNA renderer** (the
   [DLNA integration](https://github.com/guim31/gladys-dlna)), URL
   `{{0.0.stream_url}}`, title `{{0.0.name}}`.

A core scene action "play this URL on this music device" (or a host API call
letting an integration command another integration's player, under the
user's control) would make this one action, and a "play" button in the
widget: that is the missing piece of a "Gladys Music".

## Requirements

- Gladys 5.1.0 or later.
- Internet access from the Gladys machine.
- To listen: a player integration with a "play a URL" scene action (DLNA).

## Installation

In Gladys: **Integrations → Install from GitHub**, then paste
`https://github.com/guim31/gladys-radio-browser`. Or install it from the
integration store once it is listed.

Then open the **Configuration** tab: run **Search a station**, then **Add to
favorites** with the number of a result, and add the station from the
**Discover** tab. The [documentation](docs/en.md) has the details (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)).

## How it uses the directory

One request for all the favorites per refresh (every 60 minutes by default,
15 to 360), searches only on demand, servers found by DNS
(`_api._tcp.radio-browser.info`, then `/json/servers`, then
`all.api.radio-browser.info`) and picked at random, an explicit User-Agent
(`gladys-radio-browser/<version>`), `url_resolved` played, and a click
(`/json/url/{uuid}`) counted when a scene action starts a station. The
container refreshes by itself (Gladys#3198); the core's poll is only a
fallback.

## Limits

- No direct play (see above).
- 50 favorites at most; the widget shows 12 (8 as a list).
- Logos are shown only when they are PNG, JPEG or WebP of 300 KB at most
  (many stations publish an .ico or an SVG); they are downloaded from the
  stations' websites, public addresses only.
- The stream state is the directory's own check (about daily), not a live
  check.
- **Developed without a live connection to the directory** (the development
  sandbox could not reach it): tested on recorded answers of the API.
  `node scripts/probe.mjs` runs the real client read-only. Feedback welcome.

## Development

```bash
npm install
npm test                 # node --test, against the SDK's fake Gladys, no network
npm run lint
npm run format:check
node scripts/probe.mjs   # live, read-only check of the directory (network needed)
```

See [CLAUDE.md](CLAUDE.md) for the architecture and the project rules.

## Credits

- [Radio Browser](https://www.radio-browser.info/) and its volunteers, for
  the directory and its open API.
- [frenck/python-radios](https://github.com/frenck/python-radios) (MIT,
  Franck Nijhof), the library behind the
  [Home Assistant integration](https://www.home-assistant.io/integrations/radio_browser)
  (Apache 2.0): the server discovery, the deduplication of streams and the
  real API answers used as test fixtures come from it.
- Built from the official
  [JavaScript template](https://github.com/GladysAssistant/integration-template-js)
  and SDK of Gladys Assistant.

## License

[Apache-2.0](LICENSE)
