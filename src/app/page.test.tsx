import { expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({dashboard:vi.fn()}));
vi.mock("@/data/personal-dashboard",()=>({getPersonalDashboard:mocks.dashboard}));
vi.mock("@/lib/supabase/env",()=>({isSupabaseConfigured:()=>true}));
vi.mock("@/components/personal-dashboard",()=>({PersonalDashboard:()=>null}));
vi.mock("@/components/app-shell",()=>({AppShell:()=>null}));
import Home from "./page";
import { invalidClubIdMessage } from "@/lib/club-administration";
it("renders the known club-ID error on the authenticated personal overview",async()=>{
 mocks.dashboard.mockResolvedValue({accountEmail:"user@test.example"});
 const page=await Home({searchParams:Promise.resolve({error:"invalid-club-id"})});
 expect(page.props.administrationError).toBe(invalidClubIdMessage);
});
it("does not display arbitrary error text supplied in the URL",async()=>{
 mocks.dashboard.mockResolvedValue({accountEmail:"user@test.example"});
 const page=await Home({searchParams:Promise.resolve({error:"untrusted"})});
 expect(page.props.administrationError).toBeUndefined();
});
