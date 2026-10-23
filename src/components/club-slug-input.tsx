"use client";
import { useEffect, useId, useState } from "react";

export function ClubSlugInput({ checkAvailability, name = "slug", value, defaultValue = "", organizationId, onChange }: {
  checkAvailability: (slug: string, organizationId?: string) => Promise<"available" | "taken" | "error">;
  name?: string; value?: string; defaultValue?: string; organizationId?: string; onChange?: (value: string) => void;
}) {
  const [draft, setDraft] = useState(defaultValue);
  const slug = value ?? draft;
  const [result, setResult] = useState<{ slug: string; status: "available" | "taken" | "error" } | null>(null);
  const id = useId();
  const valid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 120;
  useEffect(() => {
    if (!valid) return;
    let active = true;
    const timer = setTimeout(() => {
      checkAvailability(slug, organizationId).then(status => { if (active) setResult({ slug, status }); })
        .catch(() => { if (active) setResult({ slug, status: "error" }); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [slug, organizationId, valid, checkAvailability]);
  const status = result?.slug === slug ? result.status : null;
  return <label>Adressnamn (slug)<input name={name} value={slug} required maxLength={120} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" aria-describedby={id} aria-invalid={status === "taken" || (!!slug && !valid)} onChange={event => {
    const next = event.target.value.toLowerCase(); setDraft(next); onChange?.(next);
  }}/><small id={id} aria-live="polite">Klubbens adress: /o/{slug || "uik"}. {slug ? !valid ? "Använd bokstäver a–z, siffror och bindestreck." : status === "available" ? "Adressnamnet är ledigt för klubben." : status === "taken" ? "Adressnamnet är upptaget av en annan klubb." : status === "error" ? "Tillgängligheten kunde inte kontrolleras. Försök igen genom att ändra fältet." : "Kontrollerar tillgänglighet…" : "Ange exempelvis aik eller uik."}</small>
    {organizationId ? <small>Om adressnamnet ändras behöver tidigare länkar till klubben uppdateras.</small> : null}
  </label>;
}
