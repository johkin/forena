## 2024-05-15 - Open Redirect Backslash Evasion
**Vulnerability:** Open Redirect via protocol-relative URL bypass using `/\`
**Learning:** Checking for `!value.startsWith("//")` is insufficient for local path validation because browsers normalize `/\example.com` to `//example.com`, allowing attackers to redirect users to external sites despite the application's intended restrictions.
**Prevention:** Always validate against both `//` and `/\` when restricting redirects to relative paths, or rely on URL object parsing to strictly enforce the hostname.
