import { beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { FamilyActivity } from "@/domain/club";
const hooks=vi.hoisted(()=>({index:0,values:[] as unknown[],lock:{current:false}}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),useRef:()=>hooks.lock,useState:(initial:unknown)=>{const index=hooks.index++;return [index in hooks.values?hooks.values[index]:initial,(next:unknown)=>{hooks.values[index]=next;}];}}));
import { OverviewInvitationResponse } from "./overview-invitation-response";
function elements(node:unknown):ReactElement<Record<string,unknown>>[]{
 if(Array.isArray(node))return node.flatMap(elements);
 if(!node || typeof node!=="object" || !("props" in node))return [];
 const el=node as ReactElement<Record<string,unknown>>;return [el,...elements(el.props.children)];
}
const item={member:{id:"person-one",displayName:"Spelare Ett"},activity:{id:"activity-one"},invitation:{id:"invitation-one",response:"pending",responseComment:"Bevara kommentaren"}} as FamilyActivity;
function render(props:Partial<Extract<Parameters<typeof OverviewInvitationResponse>[0], { item:FamilyActivity }>>={}){hooks.index=0;return elements(OverviewInvitationResponse({item,readOnly:false,...props}));}
beforeEach(()=>{vi.unstubAllGlobals();hooks.values=[undefined,false,undefined];hooks.lock.current=false;});
it("answers only this person's invitation, omits comment, and marks the confirmed response",async()=>{
 const fetch=vi.fn().mockResolvedValue({ok:true});vi.stubGlobal("fetch",fetch);const onAnswered=vi.fn();
 const button=render({onAnswered}).find(e=>e.props["data-response"]==="accepted")!;
 (button.props.onClick as ()=>void)();await vi.waitFor(()=>expect(onAnswered).toHaveBeenCalledOnce());
 expect(fetch).toHaveBeenCalledWith("/api/invitations/invitation-one/respond",expect.objectContaining({method:"PUT",body:JSON.stringify({response:"accepted"})}));
 expect(render().find(e=>e.props["data-response"]==="accepted")!.props["aria-pressed"]).toBe(true);
 const fresh={...item,invitation:{...item.invitation!,response:"declined" as const}};
 expect(render({item:fresh}).find(e=>e.props["data-response"]==="declined")!.props["aria-pressed"]).toBe(true);
});
it("keeps the previous answer and reports an error when saving fails",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false}));const onAnswered=vi.fn();
 (render({onAnswered}).find(e=>e.props["data-response"]==="declined")!.props.onClick as ()=>void)();
 await vi.waitFor(()=>expect(hooks.values[2]).toBeTruthy());
 expect(render().find(e=>e.props.role==="alert")).toBeDefined();expect(onAnswered).not.toHaveBeenCalled();
 expect(render().filter(e=>e.props["aria-pressed"]===true)).toHaveLength(0);
});
it("prevents a second write while one is in flight",async()=>{
 let resolve!:(value:unknown)=>void;const fetch=vi.fn(()=>new Promise(r=>{resolve=r;}));vi.stubGlobal("fetch",fetch);
 const buttons=render().filter(e=>e.type==="button");(buttons[0].props.onClick as ()=>void)();(buttons[1].props.onClick as ()=>void)();expect(fetch).toHaveBeenCalledOnce();
 resolve({ok:true});await vi.waitFor(()=>expect(hooks.lock.current).toBe(false));
});
it.each([{readOnly:true},{demo:true}])("does not write in read-only or demo mode",props=>{
 const fetch=vi.fn();vi.stubGlobal("fetch",fetch);const buttons=render(props).filter(e=>e.type==="button");expect(buttons.every(b=>b.props.disabled)).toBe(true);(buttons[0].props.onClick as ()=>void)();expect(fetch).not.toHaveBeenCalled();
});
it("shows a duty-only person without response buttons or invented invitation",()=>{
 expect(render({item:{...item,invitation:undefined,hasDutyAssignment:true}}).filter(e=>e.type==="button")).toHaveLength(0);
});

it("uses the authenticated Kotlin request for a direct invitation without sending comments",async()=>{
 const request=vi.fn().mockResolvedValue({ok:true});
 hooks.index=0;
 const invitation={id:"invitation-two",person_id:"person-two",name:"Ombudets person",response:"pending" as const,response_comment:null};
 const tree=elements(OverviewInvitationResponse({invitation,readOnly:false,request}));
 (tree.find(e=>e.props["data-response"]==="accepted")!.props.onClick as ()=>void)();
 await vi.waitFor(()=>expect(request).toHaveBeenCalledOnce());
 expect(request).toHaveBeenCalledWith("/api/invitations/invitation-two/respond",expect.objectContaining({method:"PUT",body:JSON.stringify({response:"accepted"})}));
});
