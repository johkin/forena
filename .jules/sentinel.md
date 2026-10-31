## 2024-05-16 - Prevent Open Redirect Via Backslash Escaping
**Vulnerability:** Open redirect where url starts with `/\` bypassing the `//` check but browser treats it as a domain redirect.
**Learning:** `new URL` and web browsers treat `/\example.com` identically to `//example.com`. Validating strings starting with `/` isn't enough, we must explicitly check for `/\\`.
**Prevention:** Include `!next.startsWith("/\\")` alongside `!next.startsWith("//")` whenever we are allowing relative redirect URL values from user input.
