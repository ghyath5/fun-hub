// The build id two phones compare, and the service worker's cache version, are one number kept in two places.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUILD, compareBuild } from '../src/data/build.js';

const serviceWorker = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

test('the service worker cache carries the build number', () => {
  const version = /const CACHE = 'command-front-v(\d+)'/.exec(serviceWorker)?.[1];
  assert.equal(Number(version), BUILD, 'bump BUILD (src/data/build.js) and CACHE (sw.js) together');
});

test('only the same build may play; a phone that sends none is older', () => {
  assert.equal(compareBuild(BUILD), 'same');
  assert.equal(compareBuild(BUILD - 1), 'theirsOlder');
  assert.equal(compareBuild(BUILD + 1), 'mineOlder');
  assert.equal(compareBuild(undefined), 'theirsOlder');
  assert.equal(compareBuild('55'), 'theirsOlder');
});
