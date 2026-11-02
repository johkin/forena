export function ActivityCapacity({ maximum, accepted = 0 }: { maximum?: number | null; accepted?: number }) {
  if (maximum == null) return null;
  const full = accepted >= maximum;
  return <div className="activity-capacity">
    <label>{accepted} av {maximum} platser{accepted > maximum ? " · Överbelagd aktivitet" : full ? " · Aktiviteten är full" : ""}
      <progress max={maximum} value={Math.min(accepted, maximum)} aria-label={`${accepted} av ${maximum} deltagarplatser`} />
    </label>
  </div>;
}
