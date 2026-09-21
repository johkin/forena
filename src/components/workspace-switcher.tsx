"use client";

import { useRouter } from "next/navigation";
import type { Organization, Team, Workspace } from "@/domain/club";

type Props = {
  organization: Organization;
  team: Team;
  workspaces: Workspace[];
};

export function WorkspaceSwitcher({ organization, team, workspaces }: Props) {
  const router = useRouter();

  return (
    <label className="workspace-switcher">
      <span className="organization-avatar" aria-hidden>{organization.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
      <span className="workspace-copy">
        <small>{organization.name}</small>
        <span className="sr-only">Aktiv arbetsyta</span>
        <select
          aria-label="Välj arbetsyta"
          value={workspaces.find((workspace) => workspace.active)?.href ?? ""}
          onChange={(event) => router.push(event.target.value)}
        >
          {workspaces.map((workspace) => (
            <option key={`${workspace.kind}-${workspace.id}`} value={workspace.href}>
              {workspace.name}{workspace.kind === "team" && workspace.id === team.id ? " · aktiv" : ""}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}
