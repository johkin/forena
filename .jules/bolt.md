## 2025-05-18 - Avoid expensive Intl.DateTimeFormat
**Learning:** `new Intl.DateTimeFormat` is very expensive and can cause performance bottlenecks when called frequently or in a loop (like inside component renders).
**Action:** Use cached `getFormatter` from `src/lib/date-time.ts` and apply lazy initialization (`useState(() => getFormatter(...))`) or move local timezone checks outside component loops.
