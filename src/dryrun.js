import { detect, recipePlatform } from './detect.js';
import { loadAgents, planForAgent } from './agents.js';
import { loadDict, t } from './i18n.js';

/**
 * `agent-guide --dry-run` (design §11): print the full plan without
 * executing anything. Used for review and CI.
 */
export async function printDryRun() {
  const env = await detect();
  const agents = await loadAgents();
  const platformKey = recipePlatform(env.platform);
  const dict = await loadDict(process.env.AGENT_GUIDE_LANG || 'zh-CN');

  console.log('=== agent-guide dry-run ===');
  console.log(t(dict, 'dryrun.env'));
  console.log(`  OS:       ${env.platform} (${env.arch}) ${env.osVersion}`);
  console.log(`  Node:     ${env.node ?? 'missing (need >=20)'}`);
  console.log(`  npm:      ${env.npm ?? 'missing'}`);
  console.log(`  git:      ${env.git ?? 'missing'}`);
  console.log(`  python:   ${env.python ?? 'missing'}`);
  if (env.wsl) {
    console.log(`  WSL:      available=${env.wsl.available} wsl2=${env.wsl.wsl2}`);
  }
  console.log('');
  console.log(t(dict, 'dryrun.agents').replace('{platform}', platformKey));
  for (const agent of agents) {
    const plan = planForAgent(agent, platformKey);
    const lines = [];
    for (const s of plan.steps) {
      const cmd = s.command.length > 96 ? s.command.slice(0, 96) + '…' : s.command;
      lines.push(`      ${s.id}: ${cmd}`);
    }
    console.log(`  - ${agent.name.padEnd(14)} [${plan.mode}] ${plan.verified ? 'verified' : 'UNVERIFIED'}${plan.steps.length > 1 ? ` (${plan.steps.length} steps)` : ''}`);
    for (const l of lines) console.log(l);
  }
  console.log('');
  console.log(t(dict, 'dryrun.nothingExecuted'));
}
