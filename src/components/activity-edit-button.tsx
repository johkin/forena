import type { MouseEventHandler } from "react";

export function ActivityEditButton({ onClick }: { onClick: MouseEventHandler<HTMLButtonElement> }) {
  return <button type="button" className="icon-button activity-edit-button" aria-label="Redigera" title="Redigera aktivitet" onClick={onClick}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m16 3 5 5M4 20l4-1L21 6a2.1 2.1 0 0 0-3-3L5 16l-1 4Z" />
    </svg>
  </button>;
}
