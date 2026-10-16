import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), redirect: vi.fn((url: string) => { throw new Error(`redirect:${url}`); }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/components/app-shell", () => ({ AppShell: () => null }));
vi.mock("@/components/telegram-settings", () => ({ TelegramSettings: () => null }));
vi.mock("@/components/telegram-group-settings", () => ({ TelegramGroupSettings: () => null }));
vi.mock("@/components/whatsapp-settings", () => ({ WhatsAppSettings: () => null }));
vi.mock("./actions", () => ({ updateProfile: vi.fn() }));
import ProfilePage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } });
});
it("discards legacy Telegram identity parameters before auth and never carries them to login", async () => {
  await expect(ProfilePage({ searchParams: Promise.resolve({ telegram: "123.signature" }) })).rejects.toThrow("redirect:/profile#telegram");
  expect(mocks.createClient).not.toHaveBeenCalled();
});
it("returns an unsigned bot profile link to the Telegram settings after login", async () => {
  await expect(ProfilePage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/login?next=%2Fprofile%23telegram");
});
