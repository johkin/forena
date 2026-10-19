import { expect, it } from "vitest";
import { publicConfig } from "./config";

const config = { supabaseUrl: "https://ckzrtxqjskosqzoitymc.supabase.co", publishableKey: "sb_publishable_synthetic", version: "11111111-1111-4111-8111-111111111111" };
it("accepts only the isolated project's public configuration", () => expect(publicConfig.parse(config)).toEqual(config));
it.each([{ ...config, supabaseUrl: "https://legacy.supabase.co" }, { ...config, publishableKey: "sb_secret_private" }, { ...config, password: "must-not-be-public" }])("rejects mismatched projects, secret keys and extra fields", value => {
  expect(publicConfig.safeParse(value).success).toBe(false);
});
