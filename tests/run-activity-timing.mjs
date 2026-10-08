// Uses the project's own TypeScript compiler and dependencies. No Vitest/network is
// needed for this focused check. The same cases also run in npm test (Vitest).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const loadModule = createRequire(import.meta.url);
const output = fs.mkdtempSync(path.join(os.tmpdir(), "forena-timing-"));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  fs.symlinkSync(path.join(root, "node_modules"), path.join(output, "node_modules"), "dir");
  const localTsc = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
  const result = spawnSync(fs.existsSync(localTsc) ? localTsc : "tsc", [
    "--strict", "--target", "ES2022", "--module", "commonjs", "--moduleResolution", "node",
    "--esModuleInterop", "--skipLibCheck", "--lib", "ES2022,DOM", "--outDir", output,
    "src/lib/activity-time-rules.ts", "src/lib/discipline-defaults.ts", "src/lib/activity-series.ts", "tests/activity-timing-cases.ts",
  ], { cwd: root, stdio: "inherit" });
  if (result.error || result.status !== 0) throw result.error ?? new Error("TypeScript compilation failed");
  const cases = loadModule(path.join(output, "tests/activity-timing-cases.js")).timingCases;
  let failures = 0;
  for (const item of cases) {
    try { item.run(); console.log(`PASS ${item.name}`); }
    catch (error) { failures++; console.error(`FAIL ${item.name}\n${error.stack}`); }
  }
  console.log(`\n${cases.length - failures}/${cases.length} passed (TZ=${process.env.TZ ?? "default"})`);
  if (failures) process.exitCode = 1;
} finally { fs.rmSync(output, { force: true, recursive: true }); }
