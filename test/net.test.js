// -----------------------------------------------------------------------------
// Logs never carry a full URL; logos are only fetched from public hosts.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertPublicUrl,
  fetchPublicFile,
  isHttpUrl,
  isPublicAddress,
  loggableUrl,
} from '../src/net.js';

test('a logged URL keeps the server only', () => {
  assert.equal(
    loggableUrl('https://user:secret@stream.example:8443/live.mp3?token=abc'),
    'https://stream.example:8443/…',
  );
  assert.equal(loggableUrl('https://stream.example'), 'https://stream.example');
  assert.equal(loggableUrl('not a url'), '(invalid URL)');
});

test('only http(s) URLs without credentials are accepted', () => {
  assert.ok(isHttpUrl('https://a.example/x'));
  assert.ok(isHttpUrl('http://a.example/x'));
  assert.ok(!isHttpUrl('file:///etc/passwd'));
  assert.ok(!isHttpUrl('https://user:pw@a.example/'));
  assert.ok(!isHttpUrl(''));
});

test('private, loopback, link-local and reserved addresses are not public', () => {
  for (const address of [
    '10.0.0.1',
    '127.0.0.1',
    '172.16.5.4',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '192.0.2.10',
    '198.51.100.1',
    '203.0.113.9',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fd00::1',
    'fe80::1',
    'ff02::1',
    '::ffff:192.168.1.1',
    '::ffff:127.0.0.1',
    '64:ff9b::c0a8:101',
    '2001:db8::1',
    'not-an-ip',
  ]) {
    assert.equal(isPublicAddress(address), false, address);
  }
  for (const address of [
    '8.8.8.8',
    '1.1.1.1',
    '172.32.0.1',
    '2a00:1450:4007:80f::200e',
    '::ffff:8.8.8.8',
  ]) {
    assert.equal(isPublicAddress(address), true, address);
  }
});

test('a host resolving to one private address is refused', async () => {
  const lookup = async () => [{ address: '8.8.8.8' }, { address: '192.168.1.1' }];
  await assert.rejects(assertPublicUrl('https://logo.example/x.png', { lookup }), {
    name: 'UnsafeUrlError',
  });
  await assert.rejects(assertPublicUrl('http://192.168.1.1/x.png', { lookup }), {
    name: 'UnsafeUrlError',
  });
  await assertPublicUrl('https://logo.example/x.png', {
    lookup: async () => [{ address: '8.8.8.8' }],
  });
});

test('a redirect to a private address is refused', async () => {
  const lookup = async (host) => [
    { address: host === 'router.example' ? '192.168.1.1' : '8.8.8.8' },
  ];
  const fetch = async () =>
    new Response(null, { status: 302, headers: { location: 'http://router.example/admin' } });
  await assert.rejects(fetchPublicFile('https://logo.example/x.png', { fetch, lookup }), {
    name: 'UnsafeUrlError',
  });
});

test('a file bigger than allowed is refused, a small one is read', async () => {
  const lookup = async () => [{ address: '8.8.8.8' }];
  const big = async () => new Response(Buffer.alloc(2000), { status: 200 });
  await assert.rejects(
    fetchPublicFile('https://logo.example/x.png', { fetch: big, lookup, maxBytes: 1000 }),
  );
  const small = async () => new Response(Buffer.from('hello'), { status: 200 });
  const bytes = await fetchPublicFile('https://logo.example/x.png', { fetch: small, lookup });
  assert.equal(bytes.toString(), 'hello');
  const missing = async () => new Response('no', { status: 404 });
  await assert.rejects(
    fetchPublicFile('https://logo.example/x.png', { fetch: missing, lookup }),
    /HTTP 404/,
  );
});
