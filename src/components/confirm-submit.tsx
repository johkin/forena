"use client";
import { useFormStatus } from "react-dom";
export function ConfirmSubmit({ label, message, disabled = false }: { label: string; message: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="danger" disabled={disabled || pending} onClick={event => { if (!window.confirm(message)) event.preventDefault(); }}>{pending ? "Tar bort…" : label}</button>;
}
