import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDict, listLanguages, t } from '../src/i18n.js';

test('zh-CN and en dictionaries have identical key sets', async () => {
  const [zh, en] = await Promise.all([loadDict('zh-CN'), loadDict('en')]);
  const zhKeys = Object.keys(zh).filter((k) => !k.startsWith('_')).sort();
  const enKeys = Object.keys(en).filter((k) => !k.startsWith('_')).sort();
  assert.deepEqual(zhKeys, enKeys, 'i18n key sets must match (design §11)');
});

test('loadDict falls back to en for unknown languages', async () => {
  const dict = await loadDict('xx-YY');
  assert.equal(dict._fallback, true);
  assert.equal(dict._requested, 'xx-YY');
});

test('t returns the key itself when missing', () => {
  assert.equal(t({ a: 'A' }, 'a'), 'A');
  assert.equal(t({}, 'missing.key'), 'missing.key');
});

test('listLanguages discovers both dictionaries', async () => {
  const langs = await listLanguages();
  assert.ok(langs.includes('zh-CN'));
  assert.ok(langs.includes('en'));
});
