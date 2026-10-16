import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHmac, generateKeyPairSync, verify } from "node:crypto";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), admin: vi.fn(), client: vi.fn(), answer: vi.fn(), query: vi.fn() }));
vi.mock("./supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.client }));
vi.mock("./ai/team-assistant", () => ({ answerTeamAssistant: mocks.answer }));
import { answerTelegramQuestion, telegramUserToken, telegramMentionsTeam } from "./telegram-assistant";
const userId = "a1000000-0000-4000-8000-000000000001";
const question = { sender: "123", chatId: "123", messageId: "u:1", eventAt: new Date().toISOString(), question: "När tränar vi?" };
const team = { id: "team", name: "Team", slug: "f2016", organization_id: "org" };
const key = Buffer.from("synthetic-signing-key-at-least-32-bytes");
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("TELEGRAM_ASSISTANT_SIGNING_JWK", JSON.stringify({ kty: "oct", alg: "HS256", k: key.toString("base64url") }));
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-key");
  mocks.admin.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValueOnce({ data: { status: "ready", userId }, error: null }).mockResolvedValue({ data: userId, error: null });
  const query = { select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: "org" }, error: null }), then: (resolve: (v: unknown) => void) => resolve(mocks.query()) };
  mocks.query.mockReturnValue({ data: [team], error: null });
  mocks.client.mockReturnValue({ from: () => query });
  mocks.answer.mockResolvedValue({ answer: "Träningen är på tisdag.", source: "ai", model: "test" });
});
afterEach(() => vi.unstubAllEnvs());
it("signs a short-lived authenticated user token without service privileges", () => {
  const token = telegramUserToken(userId);
  const [header, body, signature] = token.split(".");
  expect(JSON.parse(Buffer.from(body, "base64url").toString())).toMatchObject({ sub: userId, role: "authenticated", aud: "authenticated" });
  const claims = JSON.parse(Buffer.from(body, "base64url").toString());
  expect(claims.exp - claims.iat).toBe(120);
  expect(signature).toBe(createHmac("sha256", key).update(`${header}.${body}`).digest("base64url"));
});
it("supports Supabase asymmetric signing keys and fails closed on invalid configuration", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  vi.stubEnv("TELEGRAM_ASSISTANT_SIGNING_JWK", JSON.stringify({ ...privateKey.export({ format: "jwk" }), kid: "test-key", alg: "ES256" }));
  const [header, body, signature] = telegramUserToken(userId).split(".");
  expect(verify("sha256", Buffer.from(`${header}.${body}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"))).toBe(true);
  vi.stubEnv("TELEGRAM_ASSISTANT_SIGNING_JWK", '{}');
  expect(() => telegramUserToken(userId)).toThrow();
});
it("uses only the database-bound identity and an RLS client for the shared assistant", async () => {
  expect(await answerTelegramQuestion(question)).toBe("Träningen är på tisdag.");
  expect(mocks.rpc).toHaveBeenCalledWith("claim_telegram_assistant", { sender: "123", message_id: "u:1", event_at: question.eventAt });
  expect(mocks.client).toHaveBeenCalledWith("https://db.test", "public-key", expect.objectContaining({ global: { headers: { Authorization: expect.stringMatching(/^Bearer /) } } }));
  expect(mocks.answer).toHaveBeenCalledWith({ teamId: "team", question: question.question, messages: [] }, expect.objectContaining({ userId }));
});
it("never authorizes questions from a group or someone else's private chat", async () => {
  expect(await answerTelegramQuestion({ ...question, chatId: "-123" })).toBeNull();
  expect(await answerTelegramQuestion({ ...question, chatId: "456" })).toBeNull();
  expect(mocks.admin).not.toHaveBeenCalled();
});
it.each(["unlinked", "ignored", "limited"])("does not call AI for %s requests", async status => {
  mocks.rpc.mockReset().mockResolvedValue({ data: { status }, error: null });
  const result = await answerTelegramQuestion(question);
  expect(status === "ignored" ? result === null : typeof result === "string").toBe(true);
  expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.answer).not.toHaveBeenCalled();
});
it("asks for an explicit team when multiple workspaces are visible", async () => {
  mocks.query.mockReturnValueOnce({ data: [team, { ...team, id: "other", slug: "p2015" }], error: null }).mockReturnValueOnce({ data: [{ id: "org", slug: "ursvik" }], error: null });
  expect(await answerTelegramQuestion(question)).toContain("lagets namn i din fråga");
  expect(mocks.answer).not.toHaveBeenCalled();
});
it("does not claim draft completion or saving in Telegram", async () => {
  mocks.answer.mockResolvedValue({ answer: "Jag har öppnat ett utkast", activityDraft: {} });
  expect(await answerTelegramQuestion(question)).toContain("Inget har sparats eller skickats");
});
it("suppresses results after revocation during generation", async () => {
  mocks.rpc.mockReset().mockResolvedValueOnce({ data: { status: "ready", userId }, error: null }).mockResolvedValueOnce({ data: null, error: null });
  expect(await answerTelegramQuestion(question)).toBeNull();
});
it("does not turn a database failure into an empty calendar", async () => {
  mocks.query.mockReturnValue({ data: null, error: { code: "error" } });
  expect(await answerTelegramQuestion(question)).toContain("kunde inte svara");
  expect(mocks.answer).not.toHaveBeenCalled();
});

it("selects a uniquely named team from ordinary language without slash commands", async () => {
  mocks.query.mockReturnValue({ data: [{ ...team, name: "F2016" }, { ...team, id: "other", name: "P2015", slug: "p2015" }], error: null });
  expect(await answerTelegramQuestion({ ...question, question: "När är nästa träning för F2016?" })).toBe("Träningen är på tisdag.");
  expect(mocks.answer).toHaveBeenCalledWith(expect.objectContaining({ teamId: "team" }), expect.anything());
});
it("does not confuse parts of names or regex characters with a team mention", () => {
  expect(telegramMentionsTeam("Fråga om F20160", { name: "F2016", slug: "f2016" })).toBe(false);
  expect(telegramMentionsTeam("När tränar F2016?", { name: "F2016", slug: "f2016" })).toBe(true);
  expect(telegramMentionsTeam("Vad gör A+B?", { name: "A+B", slug: "a-b" })).toBe(true);
  expect(telegramMentionsTeam("Vad gör AAAB?", { name: "A+B", slug: "a-b" })).toBe(false);
});
