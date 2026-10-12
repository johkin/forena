"use client";
import { useState } from "react";
import { DutyPlacesStepper } from "./duty-places-stepper";
import { DateTimeRangeFields } from "./date-time-range-fields";
import { shiftCalendarDate } from "./activity-date-picker";
import { dutySeriesDefinitionSchema, expandDutySeries, validateDutyBounds, type Duty, type DutyCommand, type DutySeries, type DutySeriesDefinition } from "@/lib/activity-duty-schedule";
import { localActivityTime } from "@/lib/activity-time-rules";

type Propose = (command: DutyCommand, text: string) => void;
export function DutySeriesForm({ initial, startsAt, endsAt, timeZone, disabled = false, buttonLabel = "Granska schema", onReview }: {
 initial?: DutySeriesDefinition; startsAt: string; endsAt: string; timeZone: string; disabled?: boolean; buttonLabel?: string; onReview: (definition: DutySeriesDefinition) => void;
}) {
 const dateValue = (value: string) => new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
 const clock = (value: string) => new Intl.DateTimeFormat("sv-SE", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
 const first = initial?.startsAt ?? initial?.dueAt ?? startsAt, last = initial?.endsAt ?? endsAt;
 const [kind, setKind] = useState(initial?.timingKind ?? "interval");
 const [date, setDate] = useState(dateValue(first)), [endDate, setEndDate] = useState(dateValue(last));
 const [start, setStart] = useState(clock(first)), [end, setEnd] = useState(clock(last));
 const [minutes, setMinutes] = useState(initial ? initial.intervalMinutes ?? Math.max(5, Math.ceil((Date.parse(last) - Date.parse(first)) / 300000) * 5) : 120);
 const [places, setPlaces] = useState(initial?.places ?? 3);
 const [instructions, setInstructions] = useState(initial?.instructions ?? "");
 const [opening, setOpening] = useState(initial?.openingInstructions ?? ""), [closing, setClosing] = useState(initial?.closingInstructions ?? "");
 const [error, setError] = useState("");
 const [dayMode,setDayMode]=useState<"single"|"multi">(dateValue(first)===dateValue(last)?"single":"multi");
 function review() {
   setError("");
   try {
     const definition = dutySeriesDefinitionSchema.parse({ timingKind: kind,
       startsAt: kind === "interval" ? localActivityTime(date, start, timeZone).toISOString() : null,
       endsAt: kind === "interval" ? localActivityTime(endDate, end, timeZone).toISOString() : null,
       dueAt: kind === "deadline" ? localActivityTime(date, start, timeZone).toISOString() : null,
       intervalMinutes: kind === "interval" ? minutes : null, places, instructions,
       openingInstructions: kind === "interval" ? opening : "", closingInstructions: kind === "interval" ? closing : "" });
     validateDutyBounds(expandDutySeries(definition), startsAt, endsAt);
     onReview(definition);
   } catch (e) { setError(e instanceof Error && !("issues" in e) ? e.message : "Kontrollera datum, tider, instruktioner och antal platser. Välj högst 48 pass."); }
 }
 return <div className="duty-series-form">
   <div className="workflow-section-heading"><h4>Tid och bemanning</h4></div>
   <div className="participant-selection"><label>Tid<select value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="interval">Bemanningspass</option><option value="deadline">Deadline för leverans</option><option value="none">Ingen särskild tid</option></select></label><DutyPlacesStepper label="Platser per tillfälle" value={places} onChange={setPlaces} disabled={disabled}/></div>
   <p className="duty-timing-help">Bemanningspass använder aktivitetens tider som utgångspunkt och måste rymmas inom aktivitetens start och slut. Alla tider anges i föreningens tidszon.</p>
   {kind!=="none" ? <DateTimeRangeFields mode={kind==="deadline" ? "single" : dayMode} onModeChange={kind==="interval" ? mode=>{setDayMode(mode);setEndDate(mode==="single" ? date : endDate===date ? shiftCalendarDate(date,1) : endDate);} : undefined} startDate={date} endDate={endDate} startTime={start} endTime={end} onDatesChange={(start,end)=>{setDate(start);if(kind==="interval")setEndDate(end);}} onStartTimeChange={setStart} onEndTimeChange={kind==="interval" ? setEnd : undefined} startLabel={kind==="deadline" ? "Lämnas senast" : "Starttid"}/> : null}
   {kind==="interval" ? <label>Minuter per pass<input type="number" min={5} step={5} value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></label> : null}
   <div className="duty-instruction-fields"><h4>Rutiner och instruktioner</h4><label>Gemensamma instruktioner<textarea maxLength={2000} value={instructions} onChange={e => setInstructions(e.target.value)} /></label>
   {kind === "interval" && <><label>Extra instruktion för första passet<textarea maxLength={500} value={opening} onChange={e => setOpening(e.target.value)} /></label><label>Extra instruktion för sista passet<textarea maxLength={500} value={closing} onChange={e => setClosing(e.target.value)} /></label></>}
   </div>
   {error && <p role="alert">{error}</p>}<button type="button" className="primary" disabled={disabled} onClick={review}>{buttonLabel}</button>
 </div>;
}
export function DutySeriesEditor({ series, duties, startsAt, endsAt, timeZone, propose }: {
 series: DutySeries; duties: Duty[]; startsAt: string; endsAt: string; timeZone: string; propose: Propose;
}) {
 const completed = duties.some(d => d.slots.some(s => s.completedAt));
 return <details className="workflow-disclosure"><summary>Redigera hela uppgiftsserien</summary>{completed ? <p>Serien innehåller genomförda uppgifter och behålls som historik.</p> : <>
   <p>Ändringen gäller alla pass i serien, även individuellt redigerade pass. Bokningar behålls på samma passnummer. Bokningar på pass som försvinner måste frigöras först.</p>
   <DutySeriesForm initial={series.definition} startsAt={startsAt} endsAt={endsAt} timeZone={timeZone} buttonLabel="Granska serieändring" onReview={definition => {
     const definitions = expandDutySeries(definition);
     for (const [index, duty] of duties.entries()) {
       const next = definitions[(duty.position ?? index + 1) - 1];
       const booked = duty.slots.filter(s => s.occupied).length;
       if (!next && booked) throw new Error("Frigör bokningarna på pass som tas bort innan du ändrar serien.");
       if (next && next.places < booked) throw new Error("Antalet platser får inte vara mindre än antalet bokningar på något pass.");
     }
     propose({ op: "edit_series", seriesId: series.id, revision: series.revision, definition }, `Ändra hela ${series.name}-serien till ${definitions.length} pass med ${definition.places} platser per pass? Kontrollera tiderna för befintliga bokningar nedan. Berörda familjer notifieras och väntande ändringsförslag stängs.`);
   }} />
   <button type="button" className="danger" onClick={() => propose({ op: "cancel_series", seriesId: series.id, revision: series.revision }, `Ta bort hela ${series.name}-serien med ${duties.length} pass? Alla bokningar frigörs, berörda familjer notifieras och historiken behålls.`)}>Ta bort hela uppgiftsserien</button>
 </>}</details>;
}
