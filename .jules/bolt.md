## 2024-10-19 - Avoid redundant Intl.DateTimeFormat instantiation
**Learning:** Instantiating `Intl.DateTimeFormat` inside frequently called functions (like `activityDateKey` used for indexing activities) creates a massive performance bottleneck. In Node/V8, recreating the formatter per call takes ~4s for 10k calls, while caching it takes ~30ms.
**Action:** When using `Intl.DateTimeFormat` or `Intl.NumberFormat` inside loops or mapping functions, always memoize or cache the formatter instance based on the parameters (e.g. `timeZone`).
## 2024-10-20 - Intl.DateTimeFormat caching optimization
**Learning:** Frequent instantiations of `Intl.DateTimeFormat` within render functions of components (like calendars and lists) can cause unnecessary performance overhead as this is an expensive operation.
**Action:** Memoize instances of `Intl.DateTimeFormat` using `useMemo` in React components, or cache them globally if their options don't change dynamically.

## 2025-02-12 - Cached Intl.DateTimeFormat
**Learning:** `Intl.DateTimeFormat` instantiations are heavily used in React component render cycles (e.g. lists). Doing `new Intl.DateTimeFormat` inline is extremely slow (tested ~59ms vs ~1.5ms for 100 iterations).
**Action:** Use the pre-existing cached utility `getFormatter(timeZone, options)` exported from `src/lib/date-time.ts` everywhere possible instead of `new Intl.DateTimeFormat`.

## 2025-02-12 - Prevent formatters execution in React State hook on every render
**Learning:** Even when caching `Intl.DateTimeFormat` via `getFormatter`, directly calling its `.format()` in a `useState` initializer evaluates the formatting logic unconditionally during every single render cycle, tying up the main thread unnessarily.
**Action:** When initializing state that derives from an expensive synchronous call like formatting dates, use React's lazy initialization mechanism (`useState(() => getFormatter(...).format(...))`) to evaluate it exactly once on mount.
