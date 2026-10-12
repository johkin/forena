import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(()=>({client:vi.fn(),redirect:vi.fn((path:string)=>{throw Error(path);}),revalidate:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:mocks.client}));
vi.mock("next/navigation",()=>({redirect:mocks.redirect}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
import { createManagedClub,createOwnClub,saveSection,deleteSection } from "./club-administration-actions";
const org="10000000-0000-0000-0000-000000000001",section="20000000-0000-0000-0000-000000000001",discipline="30000000-0000-0000-0000-000000000001";
const structure={organization:{id:org,slug:"club",name:"Club",assistantName:"A",timeZone:"Europe/Stockholm"},sections:[]};
function form(values:Record<string,string>={}) {const f=new FormData();for(const [k,v] of Object.entries({organizationName:"Club",organizationSlug:"club",sectionName:"Sport",disciplineId:discipline,timeZone:"Europe/Stockholm",...values}))f.set(k,v);return f;}
beforeEach(()=>vi.clearAllMocks());
function client(rpc:ReturnType<typeof vi.fn>,signedIn=true){mocks.client.mockResolvedValue({auth:{getUser:vi.fn().mockResolvedValue({data:{user:signedIn?{id:"user"}:null},error:null})},rpc});}
it("blocks managed creation without the platform role before writing",async()=>{
 const rpc=vi.fn().mockResolvedValue({data:false,error:null});client(rpc);
 expect(await createManagedClub({},form())).toHaveProperty("error");expect(rpc).toHaveBeenCalledTimes(1);expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("creates the reviewed structure atomically in managed mode",async()=>{
 const rpc=vi.fn().mockResolvedValueOnce({data:true,error:null}).mockResolvedValueOnce({data:{id:org,slug:"club",teamSlug:null},error:null});client(rpc);
 await expect(createManagedClub({},form())).rejects.toThrow(`/system/organizations/${org}?created=1`);
 expect(rpc).toHaveBeenLastCalledWith("create_club_workspace",expect.objectContaining({managed:true,input:expect.objectContaining({sectionName:"Sport",disciplineId:discipline})}));
});
it("reports duplicate creation without redirecting to success",async()=>{
 const rpc=vi.fn().mockResolvedValue({data:null,error:{code:"23505"}});client(rpc);expect(await createOwnClub({},form())).toEqual({error:"Namnet eller adressnamnet är redan upptaget."});expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("denies anonymous creation before any RPC",async()=>{const rpc=vi.fn();client(rpc,false);await expect(createOwnClub({},form())).rejects.toThrow("/login");expect(rpc).not.toHaveBeenCalled();});
it("checks club access before section writes",async()=>{
 const rpc=vi.fn().mockResolvedValue({data:null,error:{code:"42501"}});client(rpc);
 await expect(saveSection(form({organizationId:org,name:"New"}))).rejects.toThrow("/");expect(rpc).toHaveBeenCalledExactlyOnceWith("club_structure",{target:org});
});
it("preserves section identity and returns a used-section deletion error",async()=>{
 const rpc=vi.fn().mockResolvedValueOnce({data:structure,error:null}).mockResolvedValueOnce({data:null,error:{code:"55000",message:"Section is in use"}});client(rpc);
 await expect(deleteSection(form({organizationId:org,sectionId:section}))).rejects.toThrow("error=");
 expect(rpc).toHaveBeenLastCalledWith("delete_club_section",{target:org,section_id:section});expect(mocks.revalidate).not.toHaveBeenCalled();
});
