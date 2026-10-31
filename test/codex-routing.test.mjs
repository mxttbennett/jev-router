import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codexRoutingEnabled, setCodexRouting } from "../src/codex-routing.mjs";

test("routing is on until it is switched off, and switches back on", (t) => {
  // Arrange
  const home = mkdtempSync(join(tmpdir(), "jev-routing-"));
  const previous = process.env.HOME;
  process.env.HOME = home;
  t.after(() => {
    process.env.HOME = previous;
    rmSync(home, { recursive: true, force: true });
  });

  // Act & Assert
  assert.equal(codexRoutingEnabled(), true);
  setCodexRouting(false);
  assert.equal(codexRoutingEnabled(), false);
  setCodexRouting(true);
  assert.equal(codexRoutingEnabled(), true);
  assert.equal(statSync(join(home, ".jev-router-codex")).mode & 0o777, 0o600);
});
