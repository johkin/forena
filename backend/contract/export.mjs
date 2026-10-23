import { readFileSync, writeFileSync } from "node:fs";

// The integration test fetches this from the real, authenticated springdoc endpoint.
const name = "openapi.json";
const document = JSON.parse(readFileSync(new URL(`../target/${name}`, import.meta.url), "utf8"));
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  }
  return value;
}
writeFileSync(new URL(name, import.meta.url), `${JSON.stringify(sortKeys(document), null, 2)}\n`);
