#!/usr/bin/env node
import { runCodex } from "../src/codex-cli.mjs";
import { runCodexRoutingCommand } from "../src/codex-routing.mjs";

if (process.argv[2] === "--jev") {
  runCodexRoutingCommand(process.argv.slice(3));
} else {
  await runCodex();
}
