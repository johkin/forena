import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signInWithPassword: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signInWithPassword: mocks.signInWithPassword }, rpc: mocks.rpc }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error("redirect:" + url); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
import { signInWithPassword } from "./actions";
beforeEach(() => { vi.clearAllMocks(); mocks.signInWithPassword.mockResolvedValue({ error: null }); mocks.rpc.mockResolvedValue({ error: null }); });
afterEach(() => vi.unstubAllEnvs());
it.each(["legacy", "kotlin"])("uses real Auth and only claims legacy people in %s mode", async mode => {
  vi.stubEnv("FORENA_PARTICIPATION_BACKEND", mode);
  const form = new FormData(); form.set("email", "family@example.invalid"); form.set("password", "synthetic-password"); form.set("next", "/migration/participation");
  await expect(signInWithPassword(form)).rejects.toThrow("redirect:/migration/participation");
  expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "family@example.invalid", password: "synthetic-password" });
  expect(mocks.rpc).toHaveBeenCalledTimes(mode === "legacy" ? 1 : 0);
});
