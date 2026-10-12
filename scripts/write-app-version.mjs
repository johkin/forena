import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

// Shared by the browser bundle and the static file; rollbacks change it too.
writeFileSync(new URL("../public/app-version.json", import.meta.url), JSON.stringify({ version: randomUUID() }) + "\n");
