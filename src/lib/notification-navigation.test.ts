import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, it, vi } from "vitest";
function worker(existing = true) {
  const listeners:Record<string,(e:unknown)=>void>={};
  const client={url:"https://forena.test/o/club/t/team",navigate:vi.fn(async()=>{}),focus:vi.fn(),postMessage:vi.fn()};
  const openWindow=vi.fn();const showNotification=vi.fn();
  vm.runInNewContext(readFileSync("public/sw.js","utf8"),{URL,self:{location:{origin:"https://forena.test"},addEventListener:(name:string,fn:(e:unknown)=>void)=>{listeners[name]=fn;},clients:{matchAll:async()=>existing?[client]:[],openWindow},registration:{showNotification}}});
  return {listeners,client,openWindow,showNotification};
}
it("navigates an already open window to the requested activity and focuses it",async()=>{
 const w=worker();let task:Promise<unknown>|undefined;
 w.listeners.notificationclick({notification:{close:vi.fn(),data:{url:"/activities/abc"}},waitUntil:(p:Promise<unknown>)=>{task=p;}});await task;
 expect(w.client.navigate).toHaveBeenCalledWith("https://forena.test/activities/abc");expect(w.client.focus).toHaveBeenCalled();
});
it("opens a new window and prevents external notification redirects",async()=>{
 const w=worker(false);let task:Promise<unknown>|undefined;
 w.listeners.notificationclick({notification:{close:vi.fn(),data:{url:"https://evil.test/"}},waitUntil:(p:Promise<unknown>)=>{task=p;}});await task;
 expect(w.openWindow).toHaveBeenCalledWith("https://forena.test");
});
it("refreshes open clients on receipt without navigating them",async()=>{
 const w=worker();let task:Promise<unknown>|undefined;
 w.listeners.push({data:{json:()=>({url:"/activities/abc",title:"Kallelse"})},waitUntil:(p:Promise<unknown>)=>{task=p;}});await task;
 expect(w.client.postMessage).toHaveBeenCalledWith({type:"activity-notification"});expect(w.client.navigate).not.toHaveBeenCalled();expect(w.showNotification).toHaveBeenCalled();
});
