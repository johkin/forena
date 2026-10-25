"use client";
import { createContext, useCallback, useContext, useState, type AnchorHTMLAttributes } from "react";
import { ApplicationMenu } from "./application-menu";
import { NavigationLinksView } from "./navigation-links-view";
import { systemNavigationItems } from "./system-navigation-items";
import { Administration } from "./administration";
import type { ParticipationFetch } from "./activity-invitation-response";

const ExampleNavigation = createContext<(href: string) => void>(() => {});
function ExampleLink({ href = "/system", onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const navigate = useContext(ExampleNavigation);
  return <a href={href} {...props} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); navigate(href);
  }} />;
}

export function AdministrationExample() {
  const [state, setState] = useState("bootstrap");
  const [path, setPath] = useState("/system");
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
    <label>Administrationsläge<select aria-label="Administrationsläge" value={state} onChange={event => { setState(event.target.value); setPath(event.target.value === "club" ? "/administration" : "/system"); }}>
      <option value="bootstrap">Första systemadministratören</option><option value="platform">Systemadmin och klubbskapande</option>
      <option value="club">Klubb-, sektions- och lagadministration</option><option value="empty">Ingen behörighet</option><option value="loading">Laddning</option><option value="error">Serverfel</option>
    </select></label><ExampleNavigation value={setPath}>
      {state === "platform" ? <details className="card"><summary>Systemmeny – samma innehåll som i appen</summary>
        <ApplicationMenu accountEmail="admin@example.invalid" linkComponent={ExampleLink}
          navigation={<NavigationLinksView items={systemNavigationItems} label="Systemadministration" pathname={path.split("?")[0]} linkComponent={ExampleLink} />}
          accountLinks={<ExampleLink href="/system">Systemadministration</ExampleLink>} logout={<button type="button" disabled>Logga ut</button>} />
      </details> : null}
      <Administration key={state} request={request} path={path} onNavigate={setPath} linkComponent={ExampleLink} />
    </ExampleNavigation>
  </section>;
}
