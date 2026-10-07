import { FootballFields } from "./football-fields";
import { packageForSection } from "@/lib/disciplines";
import { DisciplinePackageSummary } from "./discipline-package-summary";
import { createClient } from "@/lib/supabase/server";
import { activitySettingsAccess } from "@/lib/activity-settings-access";
import { resolveActivityDefaults, type ActivityDefaultsRow } from "@/lib/activity-defaults";
import { normalizeDefaultsPatch } from "@/lib/activity-configuration";
import { NavigationLinks } from "./navigation-links";
import { AppShell } from "./app-shell";
import { notFound, redirect } from "next/navigation";
import { saveActivityDefaults, saveActivityType, saveTargetDiscipline } from "@/app/activity-settings-actions";

import { ActivityDefaultsFields } from "./activity-defaults-fields";

const sourceNames = { system: "System", organization: "Klubb", section: "Sektion", team: "Lag", fallback: "Grundvärde" };
type Query = { team?: string; scope?: string; scopeId?: string; typeId?: string; saved?: string; error?: string };
export async function ActivitySettingsPage({ organizationSlug = null, query }: { organizationSlug?: string | null; query: Query }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: org } = organizationSlug ? await supabase.from("organizations").select("id, name, slug, discipline_id").eq("slug",organizationSlug).single() : { data: null };
  if (organizationSlug && !org) notFound();
  const [{ data: canAdministerOrganization }, sectionResult, teamResult, disciplineResult] = await Promise.all([
    org ? supabase.rpc("has_organization_role", { target_organization_id: org.id, allowed_roles: ["owner", "admin"] }) : Promise.resolve({ data: false }),
    org ? supabase.from("sections").select("id, name, discipline_id").eq("organization_id",org.id).order("name") : Promise.resolve({ data: [] }),
    org ? supabase.from("teams").select("id, slug, name, section_id, discipline_id").eq("organization_id",org.id).order("name") : Promise.resolve({ data: [] }),
    supabase.from("disciplines").select("id, key, name").order("name"),
  ]);
  const candidates = org ? [{ scope: "organization" as const, id: org.id, name: org.name, discipline_id: org.discipline_id }, ...(sectionResult.data ?? []).map(s => ({ ...s, scope: "section" as const })), ...(teamResult.data ?? []).map(t => ({ ...t, scope: "team" as const }))] : [{ scope: "system" as const, id: null, name: "System", discipline_id: null }];
  const targets = (await Promise.all(candidates.map(async target => {
    const { data, error } = await supabase.rpc("can_manage_activity_defaults", { target_scope: target.scope, target_organization_id: org?.id ?? null, target_scope_id: target.id });
    return !error && data ? target : null;
  }))).filter(target => target !== null);
  const requestedTeam = (teamResult.data ?? []).find(t=>t.slug===query.team);
  const selected = (requestedTeam ? targets.find(t=>t.scope==="team" && t.id===requestedTeam.id) : undefined) ?? targets.find(t => t.scope === query.scope && t.id === (query.scopeId ?? null)) ?? targets[0];
  if (!selected) redirect(organizationSlug ? `/o/${organizationSlug}` : "/system");
  await activitySettingsAccess(organizationSlug,selected.scope,selected.id);
  const path = organizationSlug ? `/o/${organizationSlug}/activity-settings` : "/system/activity-types";
  const selectedTeam = (teamResult.data ?? []).find(t => selected.scope === "team" && t.id === selected.id);
  const selectedSection = (sectionResult.data ?? []).find(s => s.id === (selectedTeam?.section_id ?? (selected.scope === "section" ? selected.id : null)));
  const disciplineId = selected.discipline_id ?? selectedSection?.discipline_id ?? org?.discipline_id ?? null;
  const [typesResult, rowsResult] = await Promise.all([
    supabase.from("activity_types").select("id, name, slug, system_category, discipline_id, organization_id, active").or(org ? `organization_id.is.null,organization_id.eq.${org.id}` : "organization_id.is.null").order("name"),
    supabase.from("activity_defaults").select("id, activity_type_id, scope, organization_id, scope_id, revision, values").or(org ? `organization_id.is.null,organization_id.eq.${org.id}` : "organization_id.is.null"),
  ]);
  if (typesResult.error || rowsResult.error || disciplineResult.error) throw new Error("Aktivitetsinställningarna kunde inte hämtas.");
  const types = (typesResult.data ?? []).filter(t => !org || !t.discipline_id || t.discipline_id === disciplineId);
  const rows: ActivityDefaultsRow[] = (rowsResult.data ?? []).map(r => ({ id:r.id,activityTypeId:r.activity_type_id,scope:r.scope,organizationId:r.organization_id,scopeId:r.scope_id,revision:r.revision,values:normalizeDefaultsPatch(r.values) }));
  const disciplines = disciplineResult.data ?? [];
  const disciplinePackage = packageForSection(selectedSection?.discipline_id ?? null, disciplineId, disciplines);
  const hidden = <><input type="hidden" name="organizationSlug" value={organizationSlug ?? ""}/><input type="hidden" name="scope" value={selected.scope}/><input type="hidden" name="scopeId" value={selected.id ?? ""}/></>;
  function typeFields(type?: typeof types[number]) { return <div className="settings-fields"><label>Namn<input name="name" required maxLength={80} defaultValue={type?.name}/></label><label>Nyckel<input name="slug" required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={type?.slug}/></label><label>Kategori<select name="system_category" defaultValue={type?.system_category ?? "session"}>{[["session","Träning"],["competition","Tävling"],["work","Arbetspass"],["meeting","Möte"],["education","Utbildning"],["other","Övrigt"]].map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label><label>Disciplin<select name="discipline_id" defaultValue={type?.discipline_id ?? ""}><option value="">Alla discipliner</option>{disciplines.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label className="settings-checkbox"><input name="active" type="checkbox" defaultChecked={type?.active ?? true}/>Aktiv</label></div>; }
  const content = (
    <main className="application-page"><section className="application-card activity-settings"><p className="eyebrow">{org ? org.name : "System"}</p><h1>{org ? "Aktivitetsinställningar" : "Aktivitetstyper och standardvärden"}</h1><p>Förval ärvs per fält: system → klubb → sektion → lag. Ändringar gäller nya aktiviteter. Mottagare och utskick väljs i aktivitetsdialogen.</p>
    {query.saved ? <p className="auth-message" role="status">Sparat.</p> : null}{query.error ? <p className="auth-error" role="alert">{query.error}</p> : null}
    {org ? <><nav className="settings-targets" aria-label="Nivå för standardvärden">{targets.map(t=><a aria-current={t.id === selected.id && t.scope === selected.scope ? "page" : undefined} className="secondary" key={`${t.scope}${t.id}`} href={`${path}?${new URLSearchParams({ scope:t.scope,scopeId:t.id! })}`}>{sourceNames[t.scope]}: {t.name}</a>)}</nav>
    <form action={saveTargetDiscipline} className="application-form">{hidden}<label>Disciplin för {selected.name}<select name="discipline_id" defaultValue={selected.discipline_id ?? ""}><option value="">{selected.scope === "organization" ? "Ingen disciplin" : "Ärv från överordnad nivå"}</option>{disciplines.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><small>Aktuell disciplin: {disciplines.find(d=>d.id===disciplineId)?.name ?? "Ingen"}. Gemensamma aktivitetstyper är alltid tillgängliga.</small><button className="secondary">Spara disciplin</button></form></> : <details className="settings-item"><summary>Ny aktivitetstyp</summary><form action={saveActivityType} className="application-form">{typeFields()}<button className="primary">Skapa aktivitetstyp</button></form></details>}
    {disciplinePackage && selectedTeam ? <FootballFields teamId={selectedTeam.id} scope="team"/> : null}
    {disciplinePackage ? <DisciplinePackageSummary discipline={disciplinePackage}/> : null}
    <h2>Standardvärden för {selected.name}</h2><p>Välj ett förval eller ärv från överordnad nivå. Ta bort alla påminnelser för att stänga av dem.</p>
    {types.map(type=>{
      const row = rows.find(r=>r.activityTypeId===type.id && r.scope===selected.scope && r.scopeId===selected.id && r.organizationId===(org?.id ?? null));
      const applicable = rows.filter(r=> selected.scope === "system" ? r.scope === "system" : selected.scope === "organization" ? ["system","organization"].includes(r.scope) : selected.scope === "section" ? r.scope!=="team" : true);
      const resolved = resolveActivityDefaults({ activityTypeId:type.id,organizationId:org?.id ?? "",sectionId:selectedSection?.id ?? "",teamId:selectedTeam?.id ?? "" },applicable.filter(candidate => candidate.id !== row?.id));
      return <details className="settings-item" key={type.id} open={query.typeId===type.id}><summary>{type.name} {!type.active ? "(inaktiv)" : ""} <small>{disciplines.find(d=>d.id===type.discipline_id)?.name ?? (type.organization_id ? "Lokal typ" : "Gemensam")}</small></summary>
        {!org ? <details><summary>Redigera aktivitetstyp</summary><form action={saveActivityType} className="application-form"><input type="hidden" name="id" value={type.id}/>{typeFields(type)}<button className="secondary">Spara aktivitetstyp</button></form></details> : null}
        <form action={saveActivityDefaults} className="application-form">{hidden}<input type="hidden" name="activityTypeId" value={type.id}/><input type="hidden" name="revision" value={row?.revision ?? 0}/><ActivityDefaultsFields initial={row?.values ?? {}} resolved={resolved}/><button className="primary">Spara standardvärden</button></form>
      </details>;
    })}</section></main>);
  return org ? <AppShell homeHref={`/o/${org.slug}`} accountEmail={auth.user?.email}
    organization={{ id: org.id, slug: org.slug, name: org.name, assistantName: "" }}
    logoutDestination={`/o/${org.slug}`}
    adminHref={canAdministerOrganization ? `/o/${org.slug}/admin/roles` : undefined}
    workspaces={[{ id: org.id, kind: "organization", name: org.name, description: "Förening", href: `/o/${org.slug}`, active: !selectedTeam }, ...(teamResult.data ?? []).map(team => ({ id: team.id, kind: "team" as const, name: team.name, description: "Lag", href: `/o/${org.slug}/t/${team.slug}`, active: team.id === selectedTeam?.id }))]}
    navigation={<NavigationLinks label="Aktivitetsinställningar" items={[{ href: path, label: "Aktivitetsinställningar" }]} />}
  >{content}</AppShell> : content;
}
