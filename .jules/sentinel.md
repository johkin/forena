## 2026-11-02 - [Fix Open Redirect Vulnerability in Next Parameter]
**Vulnerability:** Open Redirect via bypass of `startsWith('/') && !startsWith('//')` validation when URL starts with `/\`.
**Learning:** `new URL(value)` or `new URL(value, origin)` converts `/\example.com` to `https://example.com/`, bypassing the basic string checking for double slashes.
**Prevention:** Use an explicit regex or check `!path.startsWith('/\')` in addition to `!path.startsWith('//')` when validating relative redirect URLs.
