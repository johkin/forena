import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DateTimeRangeFields } from "./date-time-range-fields";
import { ActivityDatePicker } from "./activity-date-picker";
import { ActivityRangeCalendar } from "./activity-range-calendar";

const props = { mode: "single" as const, startDate: "2026-10-16", endDate: "2026-10-18", startTime: "17:02", endTime: "18:02", onDatesChange: () => {}, onStartTimeChange: () => {}, names: { startDate: "startsOn", endDate: "endsOn", startTime: "startTime", endTime: "endTime" } };
it("renders a timestamp with one date and one time, even if a mode callback is supplied", () => {
 const html = renderToStaticMarkup(createElement(DateTimeRangeFields, {...props, onModeChange: () => {}}));
 expect(html).toContain('name="startsOn"');
 expect(html).toContain('name="startTime" value="17:02"');
 expect(html).not.toContain('name="endTime"');
 expect(html).not.toContain('aria-label="Datumläge"');
 expect(html.match(/class="activity-time-stepper"/g)).toHaveLength(1);
});
it("preserves form values and date constraints in required date-only fields", () => {
 const html = renderToStaticMarkup(createElement(ActivityDatePicker, {name:"endsOn", value:"2026-10-16", min:"2026-10-15", required:true, onChange:()=>{}}));
 expect(html).toMatch(/name="endsOn"/);
 expect(html).toContain('min="2026-10-15"');
 expect(html).toContain('required=""');
 expect(html).toMatch(/disabled="" aria-label="måndag 12 oktober 2026"/);
});
it("supports empty required dates without choosing a birthday on behalf of the user", () => {
 const html = renderToStaticMarkup(createElement(ActivityDatePicker, {name:"birthday", value:"", required:true, onChange:()=>{}}));
 expect(html).toContain('open=""');
 expect(html).toContain('value=""');
 expect(html).not.toContain('aria-pressed="true"');
});
it("includes both endpoints in a continuous range and carries it through the month boundary", () => {
 const html = renderToStaticMarkup(createElement(ActivityRangeCalendar, {start:"2026-10-30",end:"2026-11-02",onChange:()=>{}}));
 expect(html.match(/data-in-range="true"/g)).toHaveLength(2);
 expect(html).toContain('name="activityEndsOn" value="2026-11-02"');
 expect(html).not.toContain('>Startdag</button>');
 expect(html).not.toContain('>Slutdag</button>');
});
