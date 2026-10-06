import type { ActivityDraftInput } from "./activity-draft";

type DraftType = { id: string; name: string; category: string };

/** Only select IDs from the team's available catalogue, including recurring drafts. */
export function resolveDraftActivityType(draft: ActivityDraftInput, question: string, types: DraftType[] = []) {
  const selected = types.find(type => type.id === draft.activityTypeId);
  if (draft.activityTypeId && !selected) throw new Error("Aktivitetstypen är inte tillgänglig för laget.");
  const training = /\bträning(?:ar|en|arna)?\b/iu.test(question);
  if (training && selected?.category !== "session") {
    const sessions = types.filter(type => type.category === "session");
    const standard = sessions.find(type => type.name.toLocaleLowerCase("sv-SE") === "träning");
    const type = standard ?? (sessions.length === 1 ? sessions[0] : undefined);
    if (!type) throw new Error("Välj en tillgänglig aktivitetstyp för träning.");
    return type.id;
  }
  return selected?.id;
}
