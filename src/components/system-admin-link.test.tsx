import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({state:null as {email:string;allowed:boolean}|null,effect:undefined as (()=>(()=>void)|void)|undefined,rpc:vi.fn()}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),useState:()=>[mocks.state,(value:typeof mocks.state)=>{mocks.state=value;}],useEffect:(effect:typeof mocks.effect)=>{mocks.effect=effect;}}));
vi.mock("@/lib/supabase/client",()=>({createClient:()=>({rpc:mocks.rpc})}));
vi.mock("@/lib/supabase/env",()=>({isSupabaseConfigured:()=>true}));
import { SystemAdminLink } from "./system-admin-link";
beforeEach(()=>{mocks.state=null;mocks.rpc.mockReset();});
it("shows platform administration only after the database confirms access",async()=>{
 mocks.rpc.mockResolvedValue({data:true,error:null});expect(SystemAdminLink({accountEmail:"admin@test.example"})).toBeNull();mocks.effect?.();await vi.waitFor(()=>expect(mocks.state?.allowed).toBe(true));expect(SystemAdminLink({accountEmail:"admin@test.example"})?.props.href).toBe("/system");expect(mocks.rpc).toHaveBeenCalledWith("has_platform_role",{allowed_roles:["system_admin"]});
});
it("hides a prior account's access immediately after account switching",()=>{mocks.state={email:"admin@test.example",allowed:true};expect(SystemAdminLink({accountEmail:"member@test.example"})).toBeNull();});
it("fails closed if the role check errors",async()=>{
 mocks.rpc.mockResolvedValue({data:true,error:{message:"failed"}});SystemAdminLink({accountEmail:"member@test.example"});mocks.effect?.();await vi.waitFor(()=>expect(mocks.state).toEqual({email:"member@test.example",allowed:false}));expect(SystemAdminLink({accountEmail:"member@test.example"})).toBeNull();
});
