"use client";
import { useEffect, useState } from "react";

/** Refresh at activity boundaries and when a suspended tab becomes active. */
export function useActivityClock(startsAt: string, endsAt: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const boundaries = [Date.parse(startsAt), Date.parse(endsAt)];
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      const timestamp = Date.now();
      setNow(timestamp);
      const next = Math.min(...boundaries.filter(boundary => boundary > timestamp));
      if (Number.isFinite(next)) timer = setTimeout(refresh, Math.min(next - timestamp, 2147483647));
    };
    const resume = () => { if (!document.hidden) refresh(); };
    timer = setTimeout(refresh, 0);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", resume);
    return () => { clearTimeout(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", resume); };
  }, [startsAt, endsAt]);
  return now;
}
