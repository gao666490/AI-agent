import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const i18nDir = path.join(here, '..', 'i18n');

const cache = new Map();

export async function loadDict(lang) {
  const key = lang || 'en';
  if (cache.has(key)) return cache.get(key);
  try {
    const raw = await fs.readFile(path.join(i18nDir, `${key}.json`), 'utf8');
    const dict = JSON.parse(raw);
    cache.set(key, dict);
    return dict;
  } catch {
    // Fall back to English, remember the original language was missing.
    const en = await loadDict('en');
    const dict = { ...en, _fallback: true, _requested: key };
    cache.set(key, dict);
    return dict;
  }
}

export async function listLanguages() {
  const entries = await fs.readdir(i18nDir);
  return entries.filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
}

/** Translate a single key; returns the key itself when untranslated. */
export function t(dict, key) {
  return dict?.[key] ?? key;
}
