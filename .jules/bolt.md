## 2024-10-20 - Intl.DateTimeFormat caching optimization
**Learning:** Frequent instantiations of `Intl.DateTimeFormat` within render functions of components (like calendars and lists) can cause unnecessary performance overhead as this is an expensive operation.
**Action:** Memoize instances of `Intl.DateTimeFormat` using `useMemo` in React components, or cache them globally if their options don't change dynamically.
