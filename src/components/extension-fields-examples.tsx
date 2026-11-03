"use client";

import { useCallback, useRef, useState } from "react";
import { z } from "zod";
import { ExtensionFields } from "./extension-fields";
import { ActivityCapacity } from "./activity-capacity";
import type { ParticipationFetch } from "./activity-invitation-response";

const teamId = "44444444-4444-4444-8444-444444444444";
const fields = [
  { key: "shirtNumber", title: "Tröjnummer", type: "integer", minimum: 0, maximum: 999, options: [] },
  { key: "positions", title: "Positioner", type: "choices", minimum: null, maximum: null,
    options: [{ id: "goalkeeper", name: "Målvakt" }, { id: "defender", name: "Back" }, { id: "midfielder", name: "Mittfältare" }, { id: "forward", name: "Anfallare" }] },
];
export function ExtensionFieldsExamples() {
  const [state, setState] = useState("editable");
  const [epoch, setEpoch] = useState(0);
  const stored = useRef<{ revision: number; values: Record<string, string | number | string[]> }>({ revision: 1, values: { shirtNumber: 7, positions: ["forward"] } });
  const request = useCallback<ParticipationFetch>(async (_path, init) => {
    if (state === "error") return Response.json({ error: "Exempel på läsfel." }, { status: 503 });
    if (init?.method === "PUT") {
      if (state === "conflict") return Response.json({ error: "Uppgifterna har ändrats. Ditt utkast finns kvar. Läs in senaste värden och försök igen." }, { status: 409 });
      const command = z.object({ values: z.record(z.string(), z.union([z.string(), z.number(), z.array(z.string())])) }).parse(JSON.parse(String(init.body)));
      stored.current = { revision: stored.current.revision + 1, values: command.values };
    }
    return Response.json({ ...stored.current, title: "Spelaruppgifter", disciplineKey: "football", version: "1.0.0", enabled: true, editable: state !== "reader",
      canManageInvitations: false, fields, teamPlayers: [], acceptedPlayers: [], participants: [] });
  }, [state]);
  return <section id="extension-fields-example"><h2>Disciplinfält och deltagarplatser</h2><p>Produktionskomponenter med lokalt exempelunderlag.</p>
    <label>Fältläge<select value={state} onChange={event => { setState(event.target.value); setEpoch(value => value + 1); }}>
      <option value="editable">Redigering</option><option value="reader">Lagmedlem eller målsman</option><option value="conflict">Samtidig ändring</option><option value="error">Läsfel</option>
    </select></label>
    <ExtensionFields key={epoch} request={request} teamId={teamId} scope="teamMembership" personId={teamId} />
    <ActivityCapacity maximum={10} accepted={8} /><ActivityCapacity maximum={10} accepted={10} /><ActivityCapacity maximum={10} accepted={12} />
  </section>;
}
