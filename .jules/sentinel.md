## 2025-02-20 - Fix Open Redirect Bypass via Backslash

**Vulnerability:** Open Redirect bypass using `/\` instead of `//`.
**Learning:** The codebase already mitigated Open Redirect attacks by checking `!next.startsWith("//")` to block protocol-relative URLs. However, a known bypass is to use `/\` (e.g. `/\malicious.com`). When passed to `new URL()` or many browser URL parsers, this is often normalized to `//malicious.com`, effectively bypassing the `startsWith("//")` check and allowing a redirect to an external site.
**Prevention:** When validating relative paths for redirects in Next.js or Node, always include `!next.startsWith("/\\")` in addition to checking for `//` to prevent path normalization bypasses.
