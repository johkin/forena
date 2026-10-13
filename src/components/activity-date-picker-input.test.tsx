import { expect, it, vi } from "vitest";
import type { ReactElement } from "react";
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useState: () => [undefined, vi.fn()], useRef: () => ({current:null}), useId: () => "date-test" }));
import { ActivityDatePicker } from "./activity-date-picker";
function elements(node:unknown):ReactElement<Record<string,unknown>>[] {
 if(Array.isArray(node))return node.flatMap(elements);
 if(!node || typeof node!=="object" || !("props" in node))return [];
 const el=node as ReactElement<Record<string,unknown>>;
 return [el,...elements(el.props.children)];
}
it.each([false,true])("handles clearing a populated date with required=%s", required => {
 const onChange=vi.fn();
 const input=elements(ActivityDatePicker({value:"2026-10-16",required,onChange})).find(el=>el.type==="input")!;
 (input.props.onChange as (event:unknown)=>void)({target:{value:""}});
 if(required)expect(onChange).not.toHaveBeenCalled();else expect(onChange).toHaveBeenCalledWith("");
 (input.props.onChange as (event:unknown)=>void)({target:{value:"2026-10-17"}});
 expect(onChange).toHaveBeenLastCalledWith("2026-10-17");
});
