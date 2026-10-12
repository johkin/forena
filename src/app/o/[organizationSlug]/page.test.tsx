import { expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({get:vi.fn(),notFound:vi.fn(()=>{throw Error("404");})}));
vi.mock("@/data/general-workspace",()=>({getGeneralWorkspace:mocks.get}));
vi.mock("next/navigation",()=>({notFound:mocks.notFound}));
vi.mock("@/components/general-workspace",()=>({GeneralWorkspace:()=>null}));
import Page from "./page";
it("returns a 404 for an unknown public club instead of looping through login",async()=>{mocks.get.mockResolvedValue(null);await expect(Page({params:Promise.resolve({organizationSlug:"missing"})})).rejects.toThrow("404");});
