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
 * path (e.g. 'native' vs 'wsl' on Windows). Returns the step list that the
 * M2 execution engine drives, one confirm+execute round per step.
 */
export function planForAgent(agent, platformKey, mode = null) {
  const p = agent.platforms?.[platformKey];
  if (!p) {
    return { agentId: agent.id, platform: platformKey, available: false, steps: [] };
  }
  const chosen = mode && p.choices?.[mode] ? mode : p.recommended;
  const choice = p.choices?.[chosen];

  let steps = Array.isArray(choice.steps) ? choice.steps : [];
  if (steps.length === 0 && choice.command) {
    // Legacy single-command recipes become one step until re-verified.
    steps = [{
      id: 'install',
      title: 'install',
      command: choice.command,
      shell: choice.shell ?? null,
      timeoutMs: choice.timeoutMs ?? 300000,
      verify: true,
    }];
  }

  return {
    agentId: agent.id,
    platform: platformKey,
    available: true,
    mode: chosen,
    label: choice?.label ?? chosen,
    commands: steps.map((s) => s.command),
    steps,
    requires: choice?.requires ?? [],
    defaultWorkDir: choice?.defaultWorkDir ?? null,
    verified: agent.verified === true,
  };
}
