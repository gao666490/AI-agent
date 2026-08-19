import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(here, '..', 'data', 'models.json');

let cache = null;

export async function loadModels() {
  if (cache) return cache;
  const raw = await fs.readFile(dataFile, 'utf8');
  const data = JSON.parse(raw);
  cache = Array.isArray(data.models) ? data.models : [];
  return cache;
}

/**
 * Filter the model catalogue by what is usable with a given agent,
 * using each model's `compat` matrix (design §5.3).
 * compat values: native | anthropic-compatible | openai-compatible | router | unsupported
 */
export async function modelsForAgent(agentId) {
  const models = await loadModels();
  return models.map((m) => ({
    id: m.id,
    name: m.name,
    region: m.region,
    models: m.models ?? [],
    compat: m.compat?.[agentId] ?? 'unsupported',
    verified: m.verified === true,
  }));
}
