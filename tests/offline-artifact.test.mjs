import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../ИГРАТЬ.html', import.meta.url), 'utf8');

test('offline artifact has no placeholder GIF and keeps real weapon resources', () => {
  assert.equal(html.includes('R0lGODlhAQABAAD'), false);
  assert.match(html, /assets\/items\/[^"}]+\.png/);
  assert.match(html, /window\.__OFFLINE_RESOURCES__/);
  assert.match(html, /HTMLImageElement,HTMLMediaElement/);
  assert.match(html, /player\.weapon === "fists"/);
  assert.match(html, /ui\.weaponIcon\.hidden = false/);
});
