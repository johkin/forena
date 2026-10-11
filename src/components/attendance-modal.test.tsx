import { beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
const hooks = vi.hoisted(() => ({ index:0, values:[] as unknown[] }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: (initial:unknown) => { const index=hooks.index++; return [index in hooks.values ? hooks.values[index] : initial, (value:unknown) => { hooks.values[index]=typeof value === "function" ? value(hooks.values[index]) : value; }]; },
  useEffect: () => {}, useMemo: (factory:() => unknown) => factory(),
}));
vi.mock("@/lib/use-modal-scroll-lock", () => ({ useModalScrollLock: () => {} }));
import { AttendanceModal } from "./attendance-modal";
function elements(node:unknown):ReactElement<Record<string,unknown>>[] {
  if(Array.isArray(node))return node.flatMap(elements);
  if(!node || typeof node!=="object" || !("props" in node))return [];
  const element=node as ReactElement<Record<string,unknown>>;
  return [element,...elements(element.props.children)];
}
const rows = [
  {personId:"one", displayName:"Spelare Ett", role:"participant", response:"accepted", present:true},
  {personId:"two", displayName:"Spelare Två", role:"participant", response:"pending", present:false},
  {personId:"coach", displayName:"Ledare Ett", role:"leader", response:"accepted", present:true},
];
function render(onClose=vi.fn()) {hooks.index=0;return elements(AttendanceModal({activityId:"activity",onClose}));}
beforeEach(() => {vi.restoreAllMocks();hooks.values=[rows,new Set(["one","coach"]),null,"",false,"all",""];});
it("filters mobile roster without changing the saved attendance or totals", async () => {
  let tree=render();
  const search=tree.find(e=>e.type==="input" && e.props.type==="search")!;
  (search.props.onChange as (event:unknown)=>void)({target:{value:"två"}});
  tree=render();
  const mobile=elements(tree.find(e=>e.props.className==="attendance-mobile-list"));
  const people=mobile.filter(e=>e.type==="button");
  expect(people).toHaveLength(1);
  expect(people[0].props["aria-pressed"]).toBe(false);
  const fetch=vi.spyOn(globalThis,"fetch").mockResolvedValue({ok:true,json:async()=>({reportedAt:"2030-01-01"})} as Response);
  const save=tree.find(e=>e.type==="button" && e.props.className==="primary")!;
  await (save.props.onClick as ()=>Promise<void>)();
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).personIds).toEqual(["one","coach"]);
});
it("toggles from the filtered mobile list and keeps other people selected", () => {
  hooks.values[5]="absent";
  const mobile=elements(render().find(e=>e.props.className==="attendance-mobile-list"));
  const people=mobile.filter(e=>e.type==="button");
  expect(people).toHaveLength(1);
  (people[0].props.onClick as ()=>void)();
  expect([...hooks.values[1] as Set<string>]).toEqual(["one","coach","two"]);
  expect(elements(render().find(e=>e.props.className==="attendance-mobile-list")).filter(e=>e.type==="button")).toHaveLength(0);
});
