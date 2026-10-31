## 2025-02-14 - Fix Next.js URL Resolution Open Redirect Bypass
**Vulnerability:** Open Redirect bypass using `/\` format (e.g. `/\example.com`).
**Learning:** Checking `!next.startsWith("//")` is insufficient to validate relative paths in Node.js, because the `new URL()` constructor resolves `/\example.com` to `https://example.com/` (a different origin). This allowed a bypass of relative URL constraints, turning into an Open Redirect vulnerability.
**Prevention:** In addition to checking for `//`, always ensure to validate that the string does not start with `/\` before trusting it as a relative Next.js path or API URL (e.g., `!next.startsWith("/\\")`).
