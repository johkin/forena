"use client";
import { useCallback, useRef, useState } from "react";
import { z } from "zod";
import { AccountProfile, type AccountProfileData } from "./account-profile";
import { AccountSecurity, AccountEmailConfirmation } from "./account-security";
import { AccountAiConnection } from "./account-ai-connection";
import { ClubAccountAdministration } from "./club-account-administration";
import { PasskeyList } from "./passkey-list";
import type { ParticipationFetch } from "./activity-invitation-response";
const id = (value: number) => `11111111-1111-4111-8111-${String(value).padStart(12, "0")}`;
function fixture(mode: string): AccountProfileData {
  const people = mode === "empty" || mode === "deletion" ? [] : [0, 1, 2].map(index => ({ id: id(index + 1), organizationId: id(index + 11), organizationName: ["Exempelföreningen", "Andra föreningen", "Tredje föreningen"][index], kind: "guardian" as const, name: index === 2 ? "Alex Andersson" : "Sam Andersson", birthDate: index === 2 ? null : "2014-05-12", phone: "", contactEmail: "", address: "", revision: 0, editable: index < 2, linkGroup: null }));
  return { profile: { name: "Kim Andersson", phone: "0701234567", revision: 0 }, email: "kim@example.invalid", people, clubs: mode === "empty" || mode === "deletion" ? [] : people.map(person => ({ id: person.organizationId, name: person.organizationName })), deletionAt: mode === "deletion" ? "2026-12-16T12:00:00Z" : null, activated: mode !== "empty", followers: mode === "empty" || mode === "deletion" ? [] : [{ id: id(30), personId: id(31), organizationId: id(11), organizationName: "Exempelföreningen", personName: "Kim Andersson", requester: "Alex Andersson", incoming: true, state: "pending", expiresAt: "2026-12-16T12:00:00Z", teams: ["Seniorlaget"] }] };
}
function AccountExample({ mode }: { mode: string }) {
  const data = useRef(fixture(mode));
  const [passkeys, setPasskeys] = useState([{ id: "example-key", label: "Min telefon" }]);
  const request = useCallback<ParticipationFetch>(async (path, init) => {
    if (mode === "loading") return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Avbruten", "AbortError")), { once: true }));
    if (mode === "error") return Response.json({ error: "Exempelfel" }, { status: 503 });
    if (mode === "conflict" && init?.method === "PUT") return Response.json({ error: "Konflikt" }, { status: 409 });
    if (path.endsWith("/account") && (!init?.method || init.method === "GET")) return Response.json(data.current);
    if (path.endsWith("/account") && init?.method === "PUT") {
      const body = z.object({ name: z.string(), phone: z.string() }).parse(JSON.parse(String(init.body)));
      data.current = { ...data.current, profile: { ...body, revision: data.current.profile.revision + 1 } };
    }
    if (path.endsWith("/sessions") && !init?.method) return Response.json([{ id: id(40), device: "Safari · iOS (uppskattat)", lastActiveAt: "2026-11-16T12:00:00Z", current: true }, { id: id(41), device: "Okänd webbläsare/enhet", lastActiveAt: "2026-11-15T12:00:00Z", current: false }]);
    if (path.endsWith("/account-administration")) return Response.json({ people: [{ id: id(1), name: "Sam Andersson", birthDate: "2014-05-12", revision: 0 }], proposals: [{ id: id(50), personId: id(1), email: "guardian@example.invalid", operation: "add", state: "pending" }] });
    const historyUrl = new URL(path, "https://example.invalid");
    if (historyUrl.pathname.endsWith("/history")) {
      const offset = Number(historyUrl.searchParams.get("offset") ?? 0);
      const length = mode === "history" ? Math.min(100, Math.max(0, 101 - offset)) : 1;
      return Response.json(Array.from({ length }, (_, index) => ({ id: id(100 + offset + index), actor: "Kim Andersson", changedAt: "2026-11-16T12:00:00Z", changes: mode === "history" ? `Ändring ${offset + index + 1}` : "Telefon: 0700000000 → 0701234567" })));
    }
    if (path.endsWith("/matches")) return Response.json([]);
    return Response.json({ ok: true });
  }, [mode]);
  return <div className="account-examples"><AccountProfile request={request} /><AccountSecurity request={request} onPasskeyVerify={async () => {}} onSessionRevoked={() => {}} /><AccountEmailConfirmation request={request} code={mode === "empty" ? "" : "synthetic-example-code"} onConfirmed={() => {}} /><PasskeyList items={passkeys} onRename={(id, label) => setPasskeys(items => items.map(item => item.id === id ? { ...item, label } : item))} onRemove={id => setPasskeys(items => items.filter(item => item.id !== id))} /><ClubAccountAdministration request={request} teamId={id(11)} /><AccountAiConnection address="https://example.invalid/api/mcp" /></div>;
}
export function AccountExamples() {
  const [mode, setMode] = useState("ready");
  return <section id="account-example"><h2>Mitt konto</h2><p>Produktionskomponenter med lokala exempel. Inga verkliga konton ändras.</p><label>Kontoläge<select value={mode} onChange={event => setMode(event.target.value)}><option value="ready">Konto med kopplingar</option><option value="history">Sidindelad historik</option><option value="empty">Väntar på klubbkoppling</option><option value="deletion">Övergångstid före borttagning</option><option value="loading">Laddning</option><option value="error">Läsfel</option><option value="conflict">Konflikt vid sparande</option></select></label><AccountExample key={mode} mode={mode} /></section>;
}
