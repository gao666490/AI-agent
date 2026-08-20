#!/usr/bin/env node
import { main } from '../src/index.js';

main(process.argv.slice(2)).catch((err) => {
  console.error(`[agent-guide] fatal: ${err?.stack || err}`);
  process.exit(1);
});
