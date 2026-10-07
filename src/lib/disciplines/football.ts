import { z } from "zod";

// Planning formats, not age/competition rules or recommended squad sizes.
export const footballFormats = [
  { id: "3v3", name: "3 mot 3", playersOnPitch: 3 },
  { id: "5v5", name: "5 mot 5", playersOnPitch: 5 },
  { id: "7v7", name: "7 mot 7", playersOnPitch: 7 },
  { id: "9v9", name: "9 mot 9", playersOnPitch: 9 },
  { id: "11v11", name: "11 mot 11", playersOnPitch: 11 },
] as const;
export const footballPositions = [
  { id: "goalkeeper", name: "Målvakt" },
  { id: "defender", name: "Back" },
  { id: "midfielder", name: "Mittfältare" },
  { id: "forward", name: "Anfallare" },
] as const;
const format = z.enum(footballFormats.map(item => item.id)).meta({ title: "Spelform" });
const position = z.enum(footballPositions.map(item => item.id));
const shirtNumber = z.number().int().min(0).max(999).meta({ title: "Tröjnummer", description: "Lagets nummer; tävlingens regler kontrolleras separat." });

// One source for runtime validation and portable JSON Schema. All values are
// optional: an absent value is unknown, never a guessed age-dependent default.
export const footballSchemas = {
  section: z.strictObject({}),
  team: z.strictObject({
    gameFormat: format.optional(),
    targetSquadSize: z.number().int().min(1).max(100).meta({ title: "Önskad matchtrupp", description: "Planeringsmål inklusive avbytare, inte antal spelare på planen." }).optional(),
    requiredGoalkeepers: z.number().int().min(0).max(10).meta({ title: "Önskat antal målvakter" }).optional(),
  }),
  teamMembership: z.strictObject({
    shirtNumber: shirtNumber.optional(),
    positions: z.array(position).max(4).meta({ title: "Positioner", uniqueItems: true }).optional(),
  }),
  activity: z.strictObject({
    gameFormat: format.optional(),
    periods: z.number().int().min(1).max(10).meta({ title: "Antal perioder" }).optional(),
    periodMinutes: z.number().int().min(1).max(120).meta({ title: "Minuter per period" }).optional(),
    venue: z.enum(["home", "away", "neutral"]).meta({ title: "Hemma/borta" }).optional(),
  }),
  activityParticipation: z.strictObject({
    shirtNumber: shirtNumber.optional(),
    position: position.meta({ title: "Position i matchen" }).optional(),
    captain: z.boolean().meta({ title: "Lagkapten" }).optional(),
  }),
};
export type DisciplineScope = keyof typeof footballSchemas;
export const disciplineScopeNames: Record<DisciplineScope, string> = {
  section: "Sektion", team: "Lag", teamMembership: "Lagmedlemskap",
  activity: "Matchtillfälle", activityParticipation: "Aktivitetsdeltagande",
};
export const footballPackage = {
  key: "football", version: "1.0.0", name: "Fotboll", category: "sport",
  assignmentScope: "section",
  gameFormats: footballFormats,
  positions: footballPositions,
  schemas: Object.fromEntries(Object.entries(footballSchemas).map(([scope, schema]) => [scope, z.toJSONSchema(schema)])),
  ui: {
    section: { fields: [] },
    team: { fields: ["gameFormat", "targetSquadSize", "requiredGoalkeepers"] },
    teamMembership: { fields: ["shirtNumber", "positions"] },
    activity: { fields: ["gameFormat", "periods", "periodMinutes", "venue"], categories: ["competition"] },
    activityParticipation: { fields: ["shirtNumber", "position", "captain"], categories: ["competition"] },
  },
} as const;

export function validateFootballData(scope: DisciplineScope, input: unknown) {
  const parsed = footballSchemas[scope].parse(input);
  if ("positions" in parsed && parsed.positions && new Set(parsed.positions).size !== parsed.positions.length) {
    throw new Error("Samma position kan inte väljas flera gånger.");
  }
  if ("targetSquadSize" in parsed && parsed.targetSquadSize !== undefined) {
    const players = "gameFormat" in parsed ? footballFormats.find(f => f.id === parsed.gameFormat)?.playersOnPitch : undefined;
    if (players !== undefined && parsed.targetSquadSize < players) throw new Error("Matchtruppen är mindre än spelformen.");
    if ("requiredGoalkeepers" in parsed && parsed.requiredGoalkeepers !== undefined && parsed.requiredGoalkeepers > parsed.targetSquadSize) throw new Error("Målvaktsbehovet överstiger matchtruppen.");
  }
  return parsed;
}
