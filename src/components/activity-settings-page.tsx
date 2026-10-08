import { FootballFields } from "./football-fields";
import { packageForSection } from "@/lib/disciplines";
import { DisciplinePackageSummary } from "./discipline-package-summary";
import { createClient } from "@/lib/supabase/server";
import { activitySettingsAccess } from "@/lib/activity-settings-access";
import { resolveDisciplineDefaults } from "@/lib/discipline-defaults";
import { loadDisciplineDefaults } from "@/lib/activity-configuration";
import { NavigationLinks } from "./navigation-links";
import { AppShell } from "./app-shell";
import { notFound, redirect } from "next/navigation";
import { saveDisciplineDefaults, saveActivityType, saveTargetDiscipline } from "@/app/activity-settings-actions";
import { DisciplineDefaultsFields } from "./discipline-defaults-fields";

const sourceNames = { section: "Sektion", team: "Lag" };
type Query = { team?: string; scope?: string; scopeId?: string; typeId?: string; saved?: string; error?: string };
export async function ActivitySettingsPage({ organizationSlug = null, query }: { organizationSlug?: string | null; query: Query }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: org } = organizationSlug ? await supabase.from("organizations").select("id, name, slug").eq("slug",organizationSlug).single() : { data: null };
  if (organizationSlug && !org) notFound();
  const [sectionResult, teamResult, disciplineResult, organizationAccess] = await Promise.all([
    org ? supabase.from("sections").select("id, name, discipline_id").eq("organization_id",org.id).order("name") : Promise.resolve({ data: [], error: null }),
    org ? supabase.from("teams").select("id, slug, name, section_id").eq("organization_id",org.id).order("name") : Promise.resolve({ data: [], error: null }),
    supabase.from("disciplines").select("id, key, name").order("name"),
    org ? supabase.rpc("has_organization_role", { target_organization_id: org.id, allowed_roles: ["owner", "admin"] }) : Promise.resolve({ data: false }),
  ]);
  if (sectionResult.error || teamResult.error || disciplineResult.error) throw new Error("Aktivitetsinställningarna kunde inte hämtas.");
  const candidates = [...(sectionResult.data ?? []).map(s => ({ ...s, scope: "section" as const })), ...(teamResult.data ?? []).map(t => ({ ...t, scope: "team" as const }))];
  const targets = (await Promise.all(candidates.map(async target => {
    const { data, error } = await supabase.rpc("can_manage_discipline_defaults", { target_scope: target.scope, target_organization_id: org!.id, target_scope_id: target.id });
    return !error && data ? target : null;
  }))).filter(target => target !== null);
  const requestedTeam = teamResult.data?.find(t => t.slug === query.team);
  const selected = (requestedTeam ? targets.find(t => t.scope === "team" && t.id === requestedTeam.id) : undefined)
    ?? targets.find(t => t.scope === query.scope && t.id === query.scopeId) ?? targets[0];
  if (org && !selected) redirect(`/o/${org.slug}`);
  await activitySettingsAccess(organizationSlug, selected?.scope ?? "system", selected?.id ?? null);
  const path = org ? `/o/${org.slug}/activity-settings` : "/system/activity-types";
  const selectedTeam = teamResult.data?.find(t => selected?.scope === "team" && t.id === selected.id);
  const selectedSection = sectionResult.data?.find(s => s.id === (selectedTeam?.section_id ?? selected?.id));
  const disciplineId = selectedSection?.discipline_id ?? null;
  const disciplines = disciplineResult.data ?? [];
  const disciplineKey = disciplines.find(d => d.id === disciplineId)?.key ?? null;
  const typesResult = await supabase.from("activity_types").select("id, name, slug, system_category, discipline_id, organization_id, active").or(org ? `organization_id.is.null,organization_id.eq.${org.id}` : "organization_id.is.null").order("name");
  if (typesResult.error) throw new Error("Aktivitetstyperna kunde inte hämtas.");
  const types = (typesResult.data ?? []).filter(t => !org || (t.active && (!t.discipline_id || t.discipline_id === disciplineId)));
  const rows = org && selectedSection ? await loadDisciplineDefaults(supabase, org.id, selectedSection.id, selectedTeam?.id) : [];
  const disciplinePackage = packageForSection(disciplineId, disciplineId, disciplines);
  const hidden = <><input type="hidden" name="organizationSlug" value={organizationSlug ?? ""}/><input type="hidden" name="scope" value={selected?.scope ?? ""}/><input type="hidden" name="scopeId" value={selected?.id ?? ""}/><input type="hidden" name="disciplineId" value={disciplineId ?? ""}/><input type="hidden" name="version" value="1.0.0"/></>;
  function typeFields(type?: typeof types[number]) { return <div className="settings-fields"><label>Namn<input name="name" required maxLength={80} defaultValue={type?.name}/></label><label>Nyckel<input name="slug" required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={type?.slug}/></label><label>Kategori<select name="system_category" defaultValue={type?.system_category ?? "session"}>{[["session","Träning"],["competition","Tävling"],["work","Arbetspass"],["meeting","Möte"],["education","Utbildning"],["other","Övrigt"]].map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label><label>Disciplin<select name="discipline_id" defaultValue={type?.discipline_id ?? ""}><option value="">Alla discipliner</option>{disciplines.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label className="settings-checkbox"><input name="active" type="checkbox" defaultChecked={type?.active ?? true}/>Aktiv</label></div>; }
  const content = <main className="application-page"><section className="application-card activity-settings">
    <p className="eyebrow">{org ? org.name : "System"}</p><h1>{org ? "Disciplinförval" : "Aktivitetstyper"}</h1>
    <p>{org ? "Förval ärvs per fält: disciplin → sektion → lag. Ändringar gäller nya aktiviteter." : "Aktivitetsförval definieras i disciplinens kodägda profil. Här administreras katalogens aktivitetstyper."}</p>
    {query.saved ? <p className="auth-message" role="status">Sparat.</p> : null}{query.error ? <p className="auth-error" role="alert">{query.error}</p> : null}
    {org ? <><nav className="settings-targets" aria-label="Nivå för disciplinförval">{targets.map(t => <a className="secondary" aria-current={t.id === selected?.id && t.scope === selected.scope ? "page" : undefined} key={`${t.scope}${t.id}`} href={`${path}?${new URLSearchParams({ scope:t.scope,scopeId:t.id })}`}>{sourceNames[t.scope]}: {t.name}</a>)}</nav>
      {selected?.scope === "section" ? <form action={saveTargetDiscipline} className="application-form">{hidden}<label>Disciplin för {selected.name}<select name="discipline_id" defaultValue={disciplineId ?? ""}><option value="">Ingen disciplin</option>{disciplines.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><small>Disciplinen gäller sektionens samtliga lag. Förval för tidigare disciplin används inte efter byte.</small><button className="secondary">Spara disciplin</button></form> : <p>Disciplin från {selectedSection?.name}: {disciplines.find(d => d.id === disciplineId)?.name ?? "Ingen"}.</p>}
    </> : <details className="settings-item"><summary>Ny aktivitetstyp</summary><form action={saveActivityType} className="application-form">{typeFields()}<button className="primary">Skapa aktivitetstyp</button></form></details>}
    {disciplinePackage && selectedTeam ? <FootballFields teamId={selectedTeam.id} scope="team"/> : null}
    {disciplinePackage ? <DisciplinePackageSummary discipline={disciplinePackage}/> : null}
    {org && !disciplineId ? <p>Välj en disciplin på sektionen för att kunna spara förval. Gemensamma aktivitetstyper kan fortfarande användas.</p> : null}
    {org && selected ? <h2>Förval för {selected.name}</h2> : null}
    {types.map(type => {
      const row = rows.find(r => r.activityTypeId === type.id && r.scope === selected?.scope && r.scopeId === selected.id && r.disciplineId === disciplineId);
      const resolved = resolveDisciplineDefaults({ activityTypeId:type.id,organizationId:org?.id ?? "",sectionId:selectedSection?.id ?? "",teamId:selectedTeam?.id ?? "",disciplineId,disciplineKey,activityTypeSlug:type.slug,activityCategory:type.system_category }, rows.filter(r => r.id !== row?.id));
      return <details className="settings-item" key={type.id} open={query.typeId === type.id}><summary>{type.name}{!type.active ? " (inaktiv)" : ""}</summary>
        {!org ? <form action={saveActivityType} className="application-form"><input type="hidden" name="id" value={type.id}/>{typeFields(type)}<button className="secondary">Spara aktivitetstyp</button></form> : null}
        {org && disciplineId ? <form action={saveDisciplineDefaults} className="application-form">{hidden}<input type="hidden" name="activityTypeId" value={type.id}/><input type="hidden" name="revision" value={row?.revision ?? 0}/><DisciplineDefaultsFields initial={row?.values ?? {}} resolved={resolved}/><button className="primary">Spara förval</button></form> : null}
      </details>;
    })}
  </section></main>;
  return org ? <AppShell homeHref={`/o/${org.slug}`} accountEmail={auth.user?.email} organization={{ id:org.id,slug:org.slug,name:org.name,assistantName:"" }} logoutDestination={`/o/${org.slug}`} adminHref={organizationAccess.data ? `/o/${org.slug}/admin/roles` : undefined} workspaces={[{id:org.id,kind:"organization",name:org.name,description:"Förening",href:`/o/${org.slug}`,active:!selectedTeam},...(teamResult.data ?? []).map(team => ({id:team.id,kind:"team" as const,name:team.name,description:"Lag",href:`/o/${org.slug}/t/${team.slug}`,active:team.id === selectedTeam?.id}))]} navigation={<NavigationLinks label="Aktivitetsinställningar" items={[{href:path,label:"Disciplinförval"}]}/>} >{content}</AppShell> : content;
}
