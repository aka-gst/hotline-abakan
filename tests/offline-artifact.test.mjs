import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const url = new URL('../ИГРАТЬ.html', import.meta.url);
const exists = existsSync(fileURLToPath(url));

test('offline artifact has no placeholder GIF and keeps real weapon resources', { skip: !exists && 'standalone intentionally not shipped in server-first build' }, () => {
  const html = readFileSync(url, 'utf8');
  assert.equal(html.includes('R0lGODlhAQABAAD'), false);
  assert.match(html, /assets\/items\/[^"}]+\.png/);
  assert.match(html, /window\.__OFFLINE_RESOURCES__/);
  assert.match(html, /HTMLImageElement,HTMLMediaElement/);
  assert.match(html, /player\.weapon === "fists"/);
  assert.match(html, /ui\.weaponIcon\.hidden = false/);
});
