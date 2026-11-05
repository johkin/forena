## 2025-02-14 - Fix Open Redirects via `/\\`

**Vulnerability:** Next.js redirect functions and URL parsing functions allow Open Redirect using paths that start with `/\\`. The `new URL()` resolves `/\example.com` to `https://example.com/`, creating an Open Redirect bypass.
**Learning:** Checking for `//` is not enough. The `new URL` resolution interprets `/\\` identically to `//`.
**Prevention:** Use `!value.startsWith("/\\")` along with `!value.startsWith("//")` to correctly prevent Open Redirects when processing relative paths in redirects or link targets.
