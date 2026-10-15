#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Live check of the Radio Browser client, read-only, from a machine that has
// the network:
//
//   node scripts/probe.mjs            # servers, searches "FIP" and "France Inter"
//   node scripts/probe.mjs --click    # also counts ONE click on the first FIP
//
// It runs the integration's own code (src/radiobrowser.js, src/logos.js
// checks) against the real directory and prints what a user would see. Nothing
// sensitive is involved: the directory is public, with no account. The stream
// addresses are printed as server names only, like the integration's logs.
// -----------------------------------------------------------------------------

import { validateWidgetImage } from '@gladysassistant/integration-sdk';
import { RadioBrowser, USER_AGENT, streamUrlOf } from '../src/radiobrowser.js';
import { fetchPublicFile, loggableUrl } from '../src/net.js';
import { stationSummary } from '../src/format.js';

const click = process.argv.includes('--click');
const client = new RadioBrowser();
let failures = 0;

async function step(title, run) {
  process.stdout.write(`\n== ${title}\n`);
  try {
    await run();
  } catch (err) {
    failures += 1;
    console.log(`FAILED: ${err.message}`);
  }
}

async function logo(station) {
  if (!station.favicon) return 'no logo';
  try {
    const bytes = await fetchPublicFile(station.favicon, { userAgent: USER_AGENT });
    const errors = validateWidgetImage(bytes.toString('base64'));
    return errors.length === 0
      ? `logo usable (${bytes.length} bytes)`
      : `logo not shown: ${errors[0]}`;
  } catch (err) {
    return `logo not shown: ${err.message}`;
  }
}

let fip;

await step('Servers (DNS SRV, else /json/servers, else all.api)', async () => {
  console.log((await client.servers()).join(', '));
  console.log(`User-Agent: ${USER_AGENT}`);
});

for (const name of ['FIP', 'France Inter']) {
  await step(`Search "${name}"`, async () => {
    const stations = await client.search({ name });
    if (stations.length === 0) throw new Error('no station found');
    for (const [index, station] of stations.entries()) {
      console.log(
        `${index + 1}. ${station.name} — ${stationSummary(station)} | online=${station.online} ` +
          `hls=${station.hls} | ${station.uuid} | ${loggableUrl(streamUrlOf(station))} | ` +
          `${await logo(station)}`,
      );
    }
    if (name === 'FIP') [fip] = stations;
  });
}

await step('Search: genre "jazz", country "FR"', async () => {
  const stations = await client.search({ tag: 'jazz', country: 'FR', limit: 5 });
  for (const station of stations) console.log(`- ${station.name} — ${stationSummary(station)}`);
});

await step('Random station, genre "jazz"', async () => {
  const [station] = await client.search({ tag: 'jazz', order: 'random', limit: 1 });
  console.log(station ? `${station.name} — ${stationSummary(station)}` : 'none');
});

await step('Refresh of the favorites (/json/stations/byuuid)', async () => {
  if (!fip) throw new Error('no FIP station to refresh');
  const [station] = await client.stationsByUuid([fip.uuid]);
  if (!station) throw new Error('the station was not returned');
  console.log(`${station.name}: online=${station.online}, ${station.bitrate} kbit/s`);
});

if (click) {
  await step('Click (/json/url/{uuid})', async () => {
    if (!fip) throw new Error('no FIP station to click');
    console.log(`stream to play: ${loggableUrl(await client.click(fip.uuid))}`);
  });
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
