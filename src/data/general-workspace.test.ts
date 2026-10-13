import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({session:vi.fn(),public:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:mocks.session}));
vi.mock("@/lib/supabase/public",()=>({createPublicClient:mocks.public}));
vi.mock("@/lib/supabase/env",()=>({isSupabaseConfigured:()=>true}));
import { getGeneralWorkspace } from "./general-workspace";
const org={id:"club",slug:"aik",name:"AIK",assistant_name:"A",time_zone:"Europe/Stockholm"};
function client(organization:typeof org|null,user:{id:string;email:string}|null){
 const selects: Record<string,string[]>={};
 const from=vi.fn((table:string)=>{
  const rows:Record<string,unknown[]>={sections:[{id:"section",organization_id:"club",slug:"innebandy",name:"Innebandy"}],teams:[{id:"team",organization_id:"club",section_id:"section",slug:"f16",name:"F16",season:"2026"}],activity_types:[],activities:[]};
  const query={select:vi.fn((columns:string)=>{(selects[table]??=[]).push(columns);return query;}),eq:vi.fn(()=>query),order:vi.fn(()=>query),or:vi.fn(()=>query),in:vi.fn(()=>query),gte:vi.fn(()=>query),lte:vi.fn(()=>query),limit:vi.fn(()=>query),maybeSingle:vi.fn(async()=>({data:table==="organizations"?organization:null,error:null})),then:(resolve:(value:unknown)=>void)=>Promise.resolve({data:rows[table]??[],error:null}).then(resolve)};
  return query;
 });
 return {from,selects,rpc:vi.fn(async()=>({data:false,error:null})),auth:{getUser:vi.fn(async()=>({data:{user},error:null}))}};
}
beforeEach(()=>vi.clearAllMocks());
it("loads only publicly granted information when a signed-in nonmember cannot read the club",async()=>{
 const session=client(null,{id:"system-admin",email:"admin@example.com"}),publicClient=client(org,null);mocks.session.mockResolvedValue(session);mocks.public.mockReturnValue(publicClient);
 const result=await getGeneralWorkspace("aik");expect(result?.organization.name).toBe("AIK");expect(result?.teams[0].name).toBe("F16");expect(result?.publicOnly).toBe(true);expect(result?.accountEmail).toBe("admin@example.com");expect(result?.canAdministerOrganization).toBe(false);
 expect(publicClient.selects.sections).toEqual(["id, organization_id, slug, name"]);expect(publicClient.from).not.toHaveBeenCalledWith("organization_members");expect(publicClient.from).not.toHaveBeenCalledWith("people");expect(session.from).toHaveBeenCalledWith("organization_members");
});
it("returns null for an unknown club after the public fallback",async()=>{
 mocks.session.mockResolvedValue(client(null,{id:"user",email:"user@example.com"}));mocks.public.mockReturnValue(client(null,null));expect(await getGeneralWorkspace("missing")).toBeNull();
});
it("does not use anonymous fallback when the club is visible in the authenticated session",async()=>{
 mocks.session.mockResolvedValue(client(org,{id:"user",email:"user@example.com"}));expect((await getGeneralWorkspace("aik"))?.publicOnly).toBe(false);expect(mocks.public).not.toHaveBeenCalled();
});

it("checks structure administration for a single section even while its navigation level is hidden",async()=>{
 const session=client(org,{id:"admin",email:"admin@example.com"});
 session.rpc.mockResolvedValue({data:true,error:null});mocks.session.mockResolvedValue(session);
 const result=await getGeneralWorkspace("aik");
 expect(result?.section).toBeUndefined();expect(result?.canAdministerSectionTeams).toBe(true);
 expect(session.rpc).toHaveBeenCalledWith("can_administer_section_teams",{target_section_id:"section"});
});
