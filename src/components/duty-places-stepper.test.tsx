import { expect, it, vi } from "vitest";
import type { ReactElement } from "react";
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useId: () => "places" }));
import { DutyPlacesStepper } from "./duty-places-stepper";
function elements(node: unknown): ReactElement<Record<string, unknown>>[] {
 if (Array.isArray(node)) return node.flatMap(elements);
 if (!node || typeof node !== "object" || !("props" in node)) return [];
 const element = node as ReactElement<Record<string, unknown>>;
 return [element, ...elements(element.props.children)];
}
it("changes staffing through the buttons while retaining manual entry", () => {
 const onChange=vi.fn();
 const tree=elements(DutyPlacesStepper({value:2,onChange}));
 const buttons=tree.filter(e=>e.type==="button");
 (buttons[0].props.onClick as ()=>void)();expect(onChange).toHaveBeenLastCalledWith(1);
 (buttons[1].props.onClick as ()=>void)();expect(onChange).toHaveBeenLastCalledWith(3);
 const input=tree.find(e=>e.type==="input")!;
 (input.props.onChange as (e:unknown)=>void)({target:{value:"5"}});expect(onChange).toHaveBeenLastCalledWith(5);
});
it("disables boundary and busy actions", () => {
 const render=(value:number,disabled=false)=>elements(DutyPlacesStepper({value,disabled,onChange:vi.fn()})).filter(e=>e.type==="button").map(e=>e.props.disabled);
 expect(render(1)).toEqual([true,false]);expect(render(50)).toEqual([false,true]);expect(render(2,true)).toEqual([true,true]);
});
