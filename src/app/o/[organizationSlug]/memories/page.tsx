import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { AssistantMemoryManager } from "@/components/assistant-memory-manager";
import { createClient } from "@/lib/supabase/server";

type Scope = "personal" | "organization" | "section" | "team" | "system";
type Props = { params: Promise<{ organizationSlug: string }>; searchParams: Promise<{ scope?: string; scopeId?: string; saved?: string; deleted?: string; error?: string }> };

export default async function MemoriesPage({ params, searchParams }: Props) {
  const { organizationSlug } = await params;
  const query = await searchParams;
  const destination = `/o/${organizationSlug}/memories`;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect(`/login?next=${encodeURIComponent(destination)}`);

  const { data: organization } = await supabase.from("organizations").select("id, slug, name, assistant_name").eq("slug", organizationSlug).maybeSingle();
  if (!organization) redirect("/setup");
  const [{ data: membership }, { data: sections }, { data: teams }, { data: sectionStaff }, { data: people }] = await Promise.all([
    supabase.from("organization_members").select("role").eq("organization_id", organization.id).eq("user_id", authData.user.id).maybeSingle(),
    supabase.from("sections").select("id, slug, name").eq("organization_id", organization.id).order("name"),
    supabase.from("teams").select("id, section_id, slug, name").eq("organization_id", organization.id).order("name"),
    supabase.from("section_staff").select("section_id, role").eq("organization_id", organization.id).eq("user_id", authData.user.id),
    supabase.from("people").select("id").eq("organization_id", organization.id).eq("user_id", authData.user.id),
  ]);
  if (!membership) redirect(`/o/${organizationSlug}`);

  const personIds = (people ?? []).map(person => person.id);
  const today = new Date().toISOString().slice(0, 10);
  const { data: teamAssignments } = personIds.length ? await supabase.from("team_access_assignments")
    .select("team_id, access_profile_id")
    .eq("organization_id", organization.id)
    .in("person_id", personIds)
    .lte("starts_on", today)
    .or(`ends_on.is.null,ends_on.gte.${today}`) : { data: [] };
  const profileIds = [...new Set((teamAssignments ?? []).map(item => item.access_profile_id))];
  const { data: memoryProfiles } = profileIds.length ? await supabase.from("team_access_profile_permissions")
    .select("access_profile_id").eq("organization_id", organization.id).eq("permission_key", "assistant.memory.manage").in("access_profile_id", profileIds) : { data: [] };
  const allowedProfileIds = new Set((memoryProfiles ?? []).map(item => item.access_profile_id));
  const managedTeamIds = new Set((teamAssignments ?? []).filter(item => allowedProfileIds.has(item.access_profile_id)).map(item => item.team_id));
  const admin = membership.role === "owner" || membership.role === "admin";
  const managedSectionIds = new Set((sectionStaff ?? []).filter(item => item.role === "section_admin").map(item => item.section_id));

  const targets = [
    { id: authData.user.id, scope: "personal" as const, name: "Mina minnen", description: "Bara för dig" },
    ...(admin ? [{ id: organization.id, scope: "organization" as const, name: organization.name, description: "Hela klubben" }] : []),
    ...(sections ?? []).filter(section => admin || managedSectionIds.has(section.id)).map(section => ({ id: section.id, scope: "section" as const, name: section.name, description: "Sektion" })),
    ...(teams ?? []).filter(team => admin || managedSectionIds.has(team.section_id) || managedTeamIds.has(team.id)).map(team => ({ id: team.id, scope: "team" as const, name: team.name, description: "Lag" })),
   ];

  const { data: memories } = await supabase.from("assistant_memories")
    .select("id, scope, scope_id, discipline_id, kind, subject, content, updated_at")
    .eq("organization_id", organization.id)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("updated_at", { ascending: false });

  const workspaces = [
    { id: organization.id, kind: "organization" as const, name: organization.name, description: "Förening", href: `/o/${organizationSlug}`, active: true },
    ...(teams ?? []).map(team => ({ id: team.id, kind: "team" as const, name: team.name, description: "Lag", href: `/o/${organizationSlug}/t/${team.slug}`, active: false })),
  ];
  const requestedScope = ["personal", "organization", "section", "team"].includes(query.scope ?? "") ? query.scope as Scope : "personal";

  return <>
    <AppHeader homeHref={`/o/${organizationSlug}`} accountEmail={authData.user.email} organization={{ ...organization, assistantName: organization.assistant_name }}
      workspaces={workspaces} logoutDestination={`/o/${organizationSlug}`} adminHref={admin ? `/o/${organizationSlug}/admin/roles` : undefined} />
    <main className="application-page memory-page"><section className="application-card">
      <div className="application-page-heading"><div><p className="eyebrow">Assistent</p><h1>Minnen</h1><p>Se vad assistenten kommer ihåg och på vilken nivå informationen gäller. Ett lagminne följer laget, medan personliga minnen bara gäller dig.</p></div><a className="secondary" href={`/o/${organizationSlug}`}>Tillbaka</a></div>
      {query.saved ? <p className="auth-message">Minnet har sparats.</p> : null}{query.deleted ? <p className="auth-message">Minnet har tagits bort.</p> : null}{query.error ? <p className="auth-error">{query.error}</p> : null}
      <AssistantMemoryManager organizationSlug={organizationSlug} targets={targets} memories={(memories ?? []) as never} initialScope={requestedScope} initialScopeId={query.scopeId} />
    </section></main>
  </>;
}
