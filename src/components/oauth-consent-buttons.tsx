"use client";

import { useFormStatus } from "react-dom";

export function OAuthConsentButtons() {
  const { pending } = useFormStatus();
  return <div className="consent-actions">
    <button className="secondary" type="submit" name="decision" value="deny" disabled={pending}>Avbryt</button>
    <button className="primary" type="submit" name="decision" value="approve" disabled={pending}>Godkänn anslutning</button>
    <span role="status">{pending ? "Behandlar ditt val…" : ""}</span>
  </div>;
}
