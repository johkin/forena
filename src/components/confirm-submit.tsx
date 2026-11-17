"use client";
import { useFormStatus } from "react-dom";
export function ConfirmSubmit({ label, message, disabled = false, variant = "danger" }: { label: string; message: string; disabled?: boolean; variant?: "primary" | "danger" }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={variant} disabled={disabled || pending} onClick={event => { if (!window.confirm(message)) event.preventDefault(); }}>{pending ? "Tar bort…" : label}</button>;
}
