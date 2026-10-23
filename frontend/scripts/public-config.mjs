import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (![undefined, "native", "supabase"].includes(process.env.FORENA_AUTH_MODE)) throw new Error("Unknown authentication mode");
const native = process.env.FORENA_AUTH_MODE === "native";
if (!native && (url !== "https://ckzrtxqjskosqzoitymc.supabase.co" || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key ?? ""))) {
  throw new Error("Build requires the isolated project's public Auth URL and publishable key");
}
const activityId = process.env.FORENA_KOTLIN_TEST_ACTIVITY_ID || undefined;
if (activityId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(activityId)) {
  throw new Error("Invalid default activity ID");
}
const version = randomUUID();
mkdirSync("public", { recursive: true });
// Construct an allowlist, never serialize process.env or a pulled .env file.
writeFileSync("public/config.json", JSON.stringify(native ? { authMode: "native", activityId, version } : { supabaseUrl: url, publishableKey: key, activityId, version }) + "\n");
writeFileSync("public/app-version.json", JSON.stringify({ version }) + "\n");
