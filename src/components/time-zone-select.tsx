"use client";
import timeZones from "@/lib/iana-time-zones.json";

export function TimeZoneSelect({ value, defaultValue = "Europe/Stockholm", onChange }: {
  value?: string; defaultValue?: string; onChange?: (value: string) => void;
}) {
  // A shared IANA list keeps server HTML and browser hydration identical.
  const zones = [...new Set(["Europe/Stockholm", "UTC", value ?? defaultValue, ...timeZones])];
  return <label>Tidszon<select name="timeZone" required value={value} defaultValue={value === undefined ? defaultValue : undefined} onChange={event => onChange?.(event.target.value)}>
    {zones.map(zone => <option key={zone} value={zone}>{zone === "Europe/Stockholm" ? "Sverige – Europe/Stockholm" : zone.replaceAll("_", " ")}</option>)}
  </select></label>;
}
