import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(here, '..', 'data', 'agents.json');

let cache = null;

export async function loadAgents() {
  if (cache) return cache;
  const raw = await fs.readFile(dataFile, 'utf8');
  const data = JSON.parse(raw);
  cache = Array.isArray(data.agents) ? data.agents : [];
  return cache;
}

/**
 * Build the full install plan for one agent on one platform (design §7:
 * GET /api/agents/:id/plan). `mode` falls back to the recipe's recommended
 * path (e.g. 'native' vs 'wsl' on Windows).
 */
export function planForAgent(agent, platformKey, mode = null) {
  const p = agent.platforms?.[platformKey];
  if (!p) {
    return { agentId: agent.id, platform: platformKey, available: false };
  }
  const chosen = mode && p.choices?.[mode] ? mode : p.recommended;
  const choice = p.choices?.[chosen];
  return {
    agentId: agent.id,
    platform: platformKey,
    available: true,
    mode: chosen,
    label: choice?.label ?? chosen,
    commands: choice?.command ? [choice.command] : [],
    requires: choice?.requires ?? [],
    defaultWorkDir: choice?.defaultWorkDir ?? null,
    verified: agent.verified === true,
  };
}
