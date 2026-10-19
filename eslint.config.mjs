import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  { files: ["frontend/**/*.{ts,tsx}"], rules: { "@next/next/no-html-link-for-pages": "off" } },
  globalIgnores([".next/**", "frontend/dist/**", "coverage/**", "next-env.d.ts"]),
]);
