import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const activityId = process.env.FORENA_KOTLIN_TEST_ACTIVITY_ID || undefined;
if (activityId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(activityId)) {
  throw new Error("Invalid default activity ID");
}
const version = randomUUID();
mkdirSync("public", { recursive: true });
// Construct an allowlist, never serialize process.env or a pulled .env file.
writeFileSync("public/config.json", JSON.stringify({ activityId, version }) + "\n");
writeFileSync("public/app-version.json", JSON.stringify({ version }) + "\n");
