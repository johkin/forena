/** Page context is a bounded hint, never authorization or a copy of page content. */
export function assistantPageContext(path: string, organizationSlug: string, teamName?: string) {
  const base = `/o/${organizationSlug}`;
  if (path !== base && !path.startsWith(`${base}/`)) return undefined;
  const sectionSlug = path.match(/^\/o\/[^/]+\/s\/([^/]+)/)?.[1];
  const suffix = path.split("/").filter(Boolean).at(-1);
  const labels: Record<string, string> = { members: "Truppen", memories: "Assistentminnen", applications: "Medlemsansökningar", roles: "Roller och behörigheter", "activity-settings": "Aktivitetsinställningar", join: "Medlemsansökan" };
  return { sectionSlug, page: { path: path.slice(0, 250), title: labels[suffix ?? ""] ?? (teamName ? "Lagöversikt" : sectionSlug ? "Sektionsöversikt" : "Klubböversikt") } };
}
