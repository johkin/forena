import { expect, it } from "vitest";
import { publicConfig } from "./config";

const config = { version: "11111111-1111-4111-8111-111111111111" };
it("starts without external authentication configuration", () => expect(publicConfig.parse(config)).toEqual(config));
it.each([{ ...config, publishableKey: "sb_publishable_unused" }, { ...config, password: "private" }, { ...config, version: "invalid" }])("rejects credentials, extra fields and invalid versions", value => {
  expect(publicConfig.safeParse(value).success).toBe(false);
});
