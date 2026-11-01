## 2024-05-24 - URL redirect vulnerabilities when using relative paths
**Vulnerability:** A relative path bypass can occur when checking if a URL is relative using `url.startsWith("/") && !url.startsWith("//")`. A string like `/\example.com` can be interpreted by browsers and some URL parsers as an absolute URL (`https://example.com/`), causing an Open Redirect vulnerability.
**Learning:** Checking for `//` is not enough. You also need to check for `/\`.
**Prevention:** Make sure to also verify that `!url.startsWith("/\\")`.
