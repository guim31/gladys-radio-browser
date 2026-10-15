# Radio Browser fixtures

- `stations.json`, `station_click.json`, `stats.json`: real answers of the
  Radio Browser API, from the tests of
  [frenck/python-radios](https://github.com/frenck/python-radios)
  (`tests/fixtures/`, MIT License, Copyright (c) 2022-2026 Franck Nijhof), the
  library behind the Home Assistant integration. Copied unchanged.
- `search-fip.json`, `search-france-inter.json`: answers of
  `/json/stations/search` rebuilt in the exact format of `stations.json` for
  the searches the brief asks to try ("FIP", "France Inter"). The stream
  addresses are the public Radio France ones; the station uuids are made up
  (the real ones are listed by `scripts/probe.mjs`). The third FIP entry is the
  same stream added a second time, as the directory often has: the search
  keeps one.
