import { beforeEach, expect, it, vi } from "vitest";
const {createClient}=vi.hoisted(()=>({createClient:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient}));
import {GET} from "./route";
beforeEach(()=>vi.clearAllMocks());
it("requires authentication",async()=>{
 createClient.mockResolvedValue({auth:{getUser:async()=>({data:{user:null}})}});
 expect((await GET(new Request("https://test"),{params:Promise.resolve({activityId:"activity"})})).status).toBe(401);
});
it("limits invitation query to self and own wards even for a leader",async()=>{
 const filters:unknown[]=[];
 createClient.mockResolvedValue({auth:{getUser:async()=>({data:{user:{id:"user"}}})},from:(table:string)=>({select:()=>({eq:async(column:string,value:string)=>{
 if(table==="people")return {data:[{id:"self"}]};
 if(table==="person_guardians")return {data:[{person_id:"child"}]};
 filters.push([table,column,value]);return {data:[]};
 },in:async()=>({data:[]})})})});
 // Invitations have both eq and in; capture their final authorization filter.
 const client=await createClient();const original=client.from;
 client.from=(table:string)=>table==="activities"?{select:()=>({eq:()=>({maybeSingle:async()=>({data:{invitation_send_at:null},error:null})})})}:table==="invitations"?{select:()=>({eq:(column:string,value:string)=>({in:async(key:string,ids:string[])=>{filters.push([column,value,key,ids]);return {data:[]};}})})}:original(table);
 const response=await GET(new Request("https://test"),{params:Promise.resolve({activityId:"activity"})});
 expect(response.status).toBe(200);expect(filters).toContainEqual(["activity_id","activity","person_id",["self","child"]]);
});

it.each(["2099-01-01T00:00:00Z","invalid"])("does not query or expose responses before a valid send time: %s",async sendAt=>{
 const from=vi.fn(()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{invitation_send_at:sendAt},error:null})})})}));
 createClient.mockResolvedValue({auth:{getUser:async()=>({data:{user:{id:"user"}}})},from});
 const response=await GET(new Request("https://test"),{params:Promise.resolve({activityId:"activity"})});
 expect(await response.json()).toEqual({invitations:[]});expect(from).toHaveBeenCalledExactlyOnceWith("activities");expect(response.headers.get("Cache-Control")).toBe("no-store");
});
it("fails closed if the activity cannot be read",async()=>{
 const from=vi.fn(()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:{message:"denied"}})})})}));
 createClient.mockResolvedValue({auth:{getUser:async()=>({data:{user:{id:"user"}}})},from});
 expect((await GET(new Request("https://test"),{params:Promise.resolve({activityId:"activity"})})).status).toBe(404);
 expect(from).toHaveBeenCalledExactlyOnceWith("activities");
});
