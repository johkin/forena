import assert from "node:assert/strict";
import { readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Read public build configuration only. Never source a pulled env file as shell.
const project = JSON.parse(readFileSync(".vercel/project.json", "utf8"));
assert.equal(project.projectId, "prj_V1a7hd39ABj3w5ARUOATF31XMWX9", "Wrong Vercel project");
assert.equal(project.orgId, "team_hkR9c8WmDdaB7Ohge0pDlA6X", "Wrong Vercel team");
assert.ok(!project.settings?.rootDirectory, "Set forena-kotlin Root Directory to repository root before deploying");
const pulled = parseEnv(readFileSync(".vercel/.env.production.local", "utf8"));
const url = pulled.NEXT_PUBLIC_SUPABASE_URL;
const key = pulled.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.equal(url, "https://ckzrtxqjskosqzoitymc.supabase.co", "Build must use the new Auth project");
assert.match(key ?? "", /^sb_publishable_[A-Za-z0-9_-]+$/, "Missing publishable key");
assert.equal(pulled.SITE_URL, "https://forena-kotlin.vercel.app", "Set the canonical SITE_URL on forena-kotlin");
// Validate the runtime-only key without exporting it to build args, output or logs.
const sessionKey = pulled.FORENA_WEB_SESSION_KEY;
assert.ok(typeof sessionKey === "string" && /^[A-Za-z0-9+/]{43}=$/.test(sessionKey) && Buffer.from(sessionKey, "base64").length === 32,
  "Configure FORENA_WEB_SESSION_KEY as a base64-encoded 32-byte runtime secret before releasing");
assert.ok(process.env.GITHUB_ENV, "Run this preparation in GitHub Actions");
appendFileSync(process.env.GITHUB_ENV, `NEXT_PUBLIC_SUPABASE_URL=${url}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${key}\n`);
const activity = pulled.FORENA_KOTLIN_TEST_ACTIVITY_ID;
if (activity) {
  assert.match(activity, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid test activity ID");
  appendFileSync(process.env.GITHUB_ENV, `FORENA_KOTLIN_TEST_ACTIVITY_ID=${activity}\n`);
}
// The container builder forwards build env as Docker arguments. Restrict it to
// public config and platform metadata/OIDC needed by the Vercel registry.
const buildEnv = Object.fromEntries(Object.entries(pulled).filter(([name]) =>
  name.startsWith("VERCEL_") || ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "FORENA_KOTLIN_TEST_ACTIVITY_ID"].includes(name)));
writeFileSync(".vercel/.env.production.local", Object.entries(buildEnv)
  .map(([name, value]) => `${name}=${JSON.stringify(value)}`).join("\n") + "\n", { mode: 0o600 });
console.log("Verified Kotlin project, repository root, target Auth and canonical origin.");
