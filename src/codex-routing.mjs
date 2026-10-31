import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const stateFile = () => join(homedir(), ".jev-router-codex");

export function codexRoutingEnabled() {
  try {
    return readFileSync(stateFile(), "utf8").trim() !== "off";
  } catch {
    return true;
  }
}

export function setCodexRouting(enabled) {
  const file = stateFile();
  const temporary = `${file}.${process.pid}.tmp`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(temporary, enabled ? "on\n" : "off\n", { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, file);
}

export function runCodexRoutingCommand(args = process.argv.slice(2)) {
  const [action, ...extra] = args;
  if (extra.length || !["on", "off", "status"].includes(action)) {
    process.stderr.write("Usage: jev-codex-toggle <on|off|status>\n");
    process.exitCode = 2;
    return;
  }

  if (action === "status") {
    process.stdout.write(`Jev routing is ${codexRoutingEnabled() ? "on" : "off"}.\n`);
    return;
  }

  setCodexRouting(action === "on");
  process.stdout.write(`Jev routing is ${action}.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCodexRoutingCommand();
}
