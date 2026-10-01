import { jsonSchema } from "ai";
import type { ActivityDraftInput } from "./activity-draft";

export const activityDraftSchema = jsonSchema<ActivityDraftInput>({
  type: "object",
  properties: {
    title: { type: "string", description: "Kort aktivitetstitel, till exempel Intresseanmälan: Aroscupen" },
    description: { type: "string", description: "Färdig text direkt till föräldrarna med verifierade fakta, vad svaret betyder och en tydlig fråga" },
    location: { type: "string", description: "Verifierad ort/plats eller Preliminärt: ej fastställt" },
    startsOn: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Aktivitetens startdatum i organisationens tidszon, YYYY-MM-DD" },
    startTime: { type: "string", pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$", description: "Starttid i organisationens tidszon, HH:mm" },
    durationMinutes: { type: "number", enum: [30, 45, 60, 75, 90, 120, 180, 480], description: "Uppskattad längd; använd 480 för heldag" },
    gatheringMinutesBefore: { type: "number", enum: [0, 15, 30, 45, 60] },
    recurrence: {
      type: ["object", "null"],
      description: "Återkommande aktiviteter: veckodagar och slutdatum. null för en enstaka aktivitet.",
      properties: {
        weekdays: { type: "array", minItems: 1, maxItems: 7, items: { type: "integer", minimum: 1, maximum: 7 }, description: "ISO-veckodagar: måndag=1 till söndag=7. Ta med alla efterfrågade dagar." },
        endsOn: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Seriens sista datum (inklusive), YYYY-MM-DD. null om användaren inte angett slutdatum eller period." },
      },
      required: ["weekdays", "endsOn"],
      additionalProperties: false,
    },
  },
  required: ["title", "description", "location", "startsOn", "startTime", "durationMinutes", "gatheringMinutesBefore", "recurrence"],
  additionalProperties: false,
});
