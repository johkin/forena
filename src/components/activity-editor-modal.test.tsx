import { beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { organization,team,activity } from "@/data/demo";
const hooks=vi.hoisted(()=>({index:0,values:[] as unknown[],setters:[] as ReturnType<typeof vi.fn>[]}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),
 useState:(initial:unknown)=>{const i=hooks.index++;return [i in hooks.values?hooks.values[i]:initial,hooks.setters[i]??(hooks.setters[i]=vi.fn())];},
 useEffect:()=>{},useMemo:(fn:()=>unknown)=>fn(),useRef:(value:unknown)=>({current:value})
}));
vi.mock("@/lib/use-modal-scroll-lock",()=>({useModalScrollLock:()=>{}}));
import { ActivityEditorModal } from "./activity-editor-modal";
function elements(node:unknown):ReactElement<Record<string,unknown>>[] {
 if(Array.isArray(node))return node.flatMap(elements);
 if(!node || typeof node!=="object" || !("props" in node))return [];
 const el=node as ReactElement<Record<string,unknown>>;return [el,...elements(el.props.children)];
}
const render=()=>elements(ActivityEditorModal({mode:"edit",organization,team,activity:{...activity,seriesId:"series",startsAt:"2030-10-20T16:00:00Z",endsAt:"2030-10-20T17:00:00Z",gatheringAt:"2030-10-20T15:30:00Z"},members:[],source:"database",canManageInvitations:false,onClose:vi.fn(),onNotice:vi.fn()}));
beforeEach(()=>{vi.unstubAllGlobals();hooks.index=0;hooks.values=[];hooks.setters=[];vi.stubGlobal("window",{confirm:vi.fn(()=>true),location:{reload:vi.fn()}});});
it("requires a scope before deletion",()=>{
 const button=render().find(el=>el.type==="button"&&el.props.children==="Ställ in");expect(button?.props.disabled).toBe(true);
});
it("previews the series instead of deleting only the anchor",async()=>{
 hooks.values[1]="following";
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({count:2,token:"preview",activities:[]})});vi.stubGlobal("fetch",fetch);
 const button=render().find(el=>el.type==="button"&&el.props.children==="Ta bort eller ställ in kommande");
 (button!.props.onClick as ()=>void)();
 await vi.waitFor(()=>expect(hooks.setters[3]).toHaveBeenCalledWith(expect.objectContaining({count:2})));
 expect(fetch.mock.calls[0][0]).toBe(`/api/activities/${activity.id}/series`);
 expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({preview:true});expect(window.location.reload).not.toHaveBeenCalled();
});
it("confirms exactly the previewed series token",async()=>{
 hooks.values[1]="following";hooks.values[3]={count:2,skipped:1,token:"preview",activities:[]};
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({deleted:1,cancelled:1})});vi.stubGlobal("fetch",fetch);
 const tree=render();expect(tree.some(el=>el.type==="button"&&el.props.children==="Förhandsgranska")).toBe(false);
 const button=tree.find(el=>el.type==="button"&&el.props.children==="Bekräfta borttagning");(button!.props.onClick as ()=>void)();
 await vi.waitFor(()=>expect(window.location.reload).toHaveBeenCalled());
 expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({preview:false,token:"preview"});
});

it("uses shared group shortcuts for send-now and invalidates its preview", async () => {
 const {PersonSelectionList}=await import("./person-selection-list");
 // Hook indexes: 10 groups, 15 invitationMode, 16 selectedPeople,
 // 6 preview and 7 payload. Keep this mapping aligned with ActivityEditorModal.
 hooks.values[10]=[{id:"g",name:"Grön",personIds:["p"]}];
 hooks.values[15]="now";
 const tree=elements(ActivityEditorModal({mode:"create",organization,team,members:[{id:"p",organizationId:organization.id,displayName:"Spelare",teamRelation:"player"}],source:"demo",canManageInvitations:true,onClose:vi.fn(),onNotice:vi.fn()}));
 const list=tree.find(el=>el.type===PersonSelectionList)!;
 expect(list.props.quickGroups).toEqual([{id:"g",label:"Grön",personIds:["p"]}]);
 const selection=new Set(["p"]);
 (list.props.onSelectionChange as (selected:Set<string>)=>void)(selection);
 expect(hooks.setters[16]).toHaveBeenCalledWith(selection);
 expect(hooks.setters[6]).toHaveBeenCalledWith(undefined);
 expect(hooks.setters[7]).toHaveBeenCalledWith(undefined);
});
