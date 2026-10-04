"use client";

import { useRef, useState } from "react";

export function CopyAddress({ address }: { address: string }) {
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  async function copy() {
    setStatus("copying");
    try {
      await navigator.clipboard.writeText(address);
      setStatus("copied");
    } catch {
      setStatus("failed");
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }

  return <div className="copy-address">
    <label htmlFor="mcp-address">MCP-adress</label>
    <div className="copy-address-row">
      <input ref={inputRef} id="mcp-address" value={address} readOnly spellCheck={false} aria-describedby="copy-address-status" onFocus={event => event.currentTarget.select()} />
      <button className="secondary copy-address-button" type="button" onClick={copy} disabled={status === "copying"} aria-label="Kopiera MCP-adressen" title="Kopiera MCP-adressen">
        {status === "copied"
          ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
          : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>}
      </button>
    </div>
    <p id="copy-address-status" className="form-help copy-address-status" role="status" aria-live="polite">
      {status === "copied" ? "Adressen har kopierats." : status === "failed" ? "Kunde inte kopiera automatiskt. Adressen är markerad så att du kan kopiera den själv." : "Kopiera adressen med knappen eller markera den i fältet."}
    </p>
  </div>;
}
