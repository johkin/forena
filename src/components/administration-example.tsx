"use client";
import { useCallback, useState } from "react";
import { Administration } from "./administration";
import type { ParticipationFetch } from "./activity-invitation-response";

export function AdministrationExample() {
  const [state, setState] = useState("bootstrap");
  const request = useCallback<ParticipationFetch>(async (path, init) => {
    if (state === "loading") return new Promise<Response>(resolve => init?.signal?.addEventListener("abort", () => resolve(Response.json({})), { once: true }));
    if (state === "error") return Response.json({}, { status: 503 });
    if (init?.method && init.method !== "GET") return Response.json({ error: "Lokalt exempel: granskningen är klar. Inga verkliga behörigheter eller klubbar ändras." }, { status: 409 });
    if (path.startsWith("/api/admin/slug?")) return Response.json({ status: "available" });
    const role = { subject: "11111111-1111-4111-8111-111111111111", email: "admin@example.invalid", active: true, startsOn: null, endsOn: null };
    const club = {
      id: "22222222-2222-4222-8222-222222222222", name: "Exempelklubben", slug: "exempelklubben", timeZone: "Europe/Stockholm", canManage: true,
      administrators: [role], sections: [{ id: "33333333-3333-4333-8333-333333333333", name: "Fotboll", slug: "fotboll", disciplineKey: "football",
        canManage: true, canChangeDiscipline: false, canDelete: false, administrators: [role],
        teams: [{ id: "44444444-4444-4444-8444-444444444444", name: "Exempellaget", slug: "exempellaget", season: "2030", canManage: true, canDelete: false, canAssignAdministrators: state === "club", administrators: [role] }],
      }],
    };
    return Response.json({ platformAdmin: state === "platform", canBootstrap: state === "bootstrap", platformAdministrators: state === "platform" ? [role] : [], clubs: ["platform", "club"].includes(state) ? [club] : [] });
  }, [state]);
  return <section id="administration-example"><h2>Administrationskedjan</h2>
    <p>Produktionskomponenter med lokala exempel. Ingen kontotilldelning eller databasändring görs.</p>
    <label>Administrationsläge<select value={state} onChange={event => setState(event.target.value)}>
      <option value="bootstrap">Första systemadministratören</option><option value="platform">Systemadmin och klubbskapande</option>
      <option value="club">Klubb-, sektions- och lagadministration</option><option value="empty">Ingen behörighet</option><option value="loading">Laddning</option><option value="error">Serverfel</option>
    </select></label><Administration key={state} request={request}/>
  </section>;
}
