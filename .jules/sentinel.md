
## 2023-10-28 - [Open Redirect Bypass via `/\`]
**Vulnerability:** Open Redirect vulnerability despite a `!next.startsWith("//")` check.
**Learning:** In Next.js/Node.js environments, `new URL("/\\example.com", "https://app.com")` resolves to `https://example.com/`. Browsers and URL parsers interpret `/\` identically to `//` (a protocol-relative URL), allowing attackers to bypass simple string-matching checks for open redirects.
**Prevention:** When validating that a redirect path is strictly relative by checking that it starts with `/` and not `//`, always explicitly reject paths starting with `/\` as well (e.g., `!next.startsWith("/\\")`).
