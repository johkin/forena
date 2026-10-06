import { beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
const hooks=vi.hoisted(()=>({index:0,values:[] as unknown[],effects:[] as (()=>unknown)[],setters:[] as ReturnType<typeof vi.fn>[]}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),useState:(initial:unknown)=>{
  const i=hooks.index++;
  return [i in hooks.values?hooks.values[i]:initial,hooks.setters[i] ?? (hooks.setters[i]=vi.fn())];
},useEffect:(fn:()=>unknown)=>hooks.effects.push(fn)}));
import { ActivityInvitationResponse } from "./activity-invitation-response";
function elements(node:unknown):ReactElement<Record<string,unknown>>[] {
  if(Array.isArray(node))return node.flatMap(elements);
  if(!node || typeof node!=="object" || !("props" in node))return [];
  const el=node as ReactElement<Record<string,unknown>>;
  return [el,...elements(el.props.children)];
}
beforeEach(()=>{vi.unstubAllGlobals();hooks.index=0;hooks.effects=[];hooks.setters=[];hooks.values=[[{id:"i",name:"Test",response:"accepted",response_comment:"Old"}],{i:"New"},0,undefined,undefined,false];});
it("saves edited text while preserving the selected answer",async()=>{
  const fetch=vi.fn().mockResolvedValue({ok:true});vi.stubGlobal("fetch",fetch);
  const tree=ActivityInvitationResponse({activityId:"a",cancelled:false});
  const button=elements(tree).find(el=>el.type==="button" && el.props.children==="Spara kommentar");
  expect(button).toBeDefined();
  (button!.props.onClick as ()=>void)();
  await vi.waitFor(()=>expect(fetch).toHaveBeenCalled());
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({response:"accepted",comment:"New"});
});
it("push invalidates the mounted response panel and cleans up the listener",()=>{
  const addEventListener=vi.fn(),removeEventListener=vi.fn();
  vi.stubGlobal("navigator",{serviceWorker:{addEventListener,removeEventListener}});
  ActivityInvitationResponse({activityId:"a",cancelled:false});
  const cleanup=hooks.effects[0]() as ()=>void;
  addEventListener.mock.calls[0][1]({data:{type:"activity-notification"}});
  expect(hooks.setters[2]).toHaveBeenCalled();
  expect(hooks.setters[1]).not.toHaveBeenCalled(); // preserve unsaved comment
  cleanup();expect(removeEventListener).toHaveBeenCalled();
});
it("defers reads while a response is being saved",()=>{
  hooks.values[5]=true;
  const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
  ActivityInvitationResponse({activityId:"a",cancelled:false});
  hooks.effects[1]();expect(fetch).not.toHaveBeenCalled();
});
