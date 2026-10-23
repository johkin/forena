import assert from "node:assert/strict";
import { readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Read public build configuration only. Never source a pulled env file as shell.
const project = JSON.parse(readFileSync(".vercel/project.json", "utf8"));
assert.equal(project.projectId, "prj_V1a7hd39ABj3w5ARUOATF31XMWX9", "Wrong Vercel project");
assert.equal(project.orgId, "team_hkR9c8WmDdaB7Ohge0pDlA6X", "Wrong Vercel team");
assert.ok(!project.settings?.rootDirectory, "Set forena-kotlin Root Directory to repository root before deploying");
const pulled = parseEnv(readFileSync(".vercel/.env.production.local", "utf8"));
assert.equal(pulled.SITE_URL, "https://forena-kotlin.vercel.app", "Set the canonical SITE_URL on forena-kotlin");
// Production Secrets are pulled as placeholders, never as their real values.
// Check presence here; the backend validates the actual key at runtime startup.
// Validate readable values too, without exporting either form to the build.
const sessionKey = pulled.FORENA_WEB_SESSION_KEY;
assert.ok(sessionKey === "[SENSITIVE]" || (typeof sessionKey === "string" && /^[A-Za-z0-9+/]{43}=$/.test(sessionKey) && Buffer.from(sessionKey, "base64").length === 32),
  "Configure FORENA_WEB_SESSION_KEY as a base64-encoded 32-byte runtime secret before releasing");
for (const name of ["RESEND_API_KEY", "RESEND_FROM_EMAIL"]) {
  assert.ok(pulled[name]?.trim(), `Configure ${name} before releasing`);
}
assert.ok(process.env.GITHUB_ENV, "Run this preparation in GitHub Actions");
appendFileSync(process.env.GITHUB_ENV, "\n");
const activity = pulled.FORENA_KOTLIN_TEST_ACTIVITY_ID;
if (activity) {
  assert.match(activity, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid test activity ID");
  appendFileSync(process.env.GITHUB_ENV, `FORENA_KOTLIN_TEST_ACTIVITY_ID=${activity}\n`);
}
// The container builder forwards build env as Docker arguments. Restrict it to
// public config and platform metadata/OIDC needed by the Vercel registry.
const buildEnv = Object.fromEntries(Object.entries(pulled).filter(([name]) =>
  name.startsWith("VERCEL_") || ["FORENA_KOTLIN_TEST_ACTIVITY_ID"].includes(name)));
writeFileSync(".vercel/.env.production.local", Object.entries(buildEnv)
  .map(([name, value]) => `${name}=${JSON.stringify(value)}`).join("\n") + "\n", { mode: 0o600 });
console.log("Verified Kotlin project, repository root, canonical origin and runtime secret presence.");
