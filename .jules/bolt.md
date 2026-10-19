## 2024-10-19 - Avoid redundant Intl.DateTimeFormat instantiation
**Learning:** Instantiating `Intl.DateTimeFormat` inside frequently called functions (like `activityDateKey` used for indexing activities) creates a massive performance bottleneck. In Node/V8, recreating the formatter per call takes ~4s for 10k calls, while caching it takes ~30ms.
**Action:** When using `Intl.DateTimeFormat` or `Intl.NumberFormat` inside loops or mapping functions, always memoize or cache the formatter instance based on the parameters (e.g. `timeZone`).
