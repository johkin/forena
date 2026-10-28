"use client";

import type { RefObject } from "react";

export function AssistantLauncher({
  trigger,
  label,
  open,
  unread = false,
  onOpen,
}: {
  trigger: RefObject<HTMLButtonElement | null>;
  label: string;
  open: boolean;
  unread?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      ref={trigger}
      type="button"
      className="assistant-launcher"
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onOpen}
    >
      <svg
        viewBox="0 0 24 24"
        width="25"
        height="25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2Z" />
      </svg>
      {unread ? (
        <span className="assistant-unread" aria-hidden="true">
          1
        </span>
      ) : null}
    </button>
  );
}

export function AssistantHeading({
  id,
  name,
  context,
  onMinimize,
}: {
  id: string;
  name: string;
  context: string;
  onMinimize: () => void;
}) {
  return (
    <div className="floating-assistant-heading">
      <div>
        <h2 id={id}>{name}</h2>
        <p>{context}</p>
      </div>
      <button
        type="button"
        aria-label="Minimera assistenten"
        onClick={onMinimize}
      >
        −
      </button>
      <button type="button" aria-label="Stäng assistenten" onClick={onMinimize}>
        ×
      </button>
    </div>
  );
}
