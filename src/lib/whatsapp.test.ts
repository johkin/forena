import { createHmac } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { pairingHash, verifyWhatsAppSignature, whatsAppActions, whatsAppAvailable } from "./whatsapp";
import { sendWhatsAppNotification, type WhatsAppConfiguration, type WhatsAppInvitation } from "../../supabase/functions/_shared/whatsapp";

const config: WhatsAppConfiguration = { accessToken: "secret", phoneNumberId: "123", apiVersion: "v23.0", templateName: "forena_notice", invitationTemplateName: "forena_invitation", templateLanguage: "sv" };
const replyId = "a1000000-0000-0000-0000-000000000001";
function incoming(messages: unknown[], phone = "123") {
  return { object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: phone }, messages } }] }] };
}
const envelope = { id: "wamid.test", from: "46700000001", timestamp: "1792134000" };
afterEach(() => vi.unstubAllEnvs());

it("authenticates the exact webhook body and rejects missing, malformed or altered signatures", () => {
  const raw = '{"object":"whatsapp_business_account"}';
  const signature = `sha256=${createHmac("sha256", "app-secret").update(raw).digest("hex")}`;
  expect(verifyWhatsAppSignature(raw, signature, "app-secret")).toBe(true);
  expect(verifyWhatsAppSignature(`${raw} `, signature, "app-secret")).toBe(false);
  for (const bad of [null, "", "sha256=abcd", signature.replace("sha256", "sha1")]) expect(verifyWhatsAppSignature(raw, bad, "app-secret")).toBe(false);
  expect(verifyWhatsAppSignature(raw, signature, "")).toBe(false);
});
it("binds only exact random pairing codes and recognizes opt-out without interpreting other text", () => {
  const code = "ab".repeat(32);
  expect(whatsAppActions(incoming([{ ...envelope, type: "text", text: { body: `FORENA ${code}` } }]), "123")[0]).toMatchObject({ operation: "bind", pairingHash: pairingHash(code), sender: envelope.from });
  expect(whatsAppActions(incoming([{ ...envelope, type: "text", text: { body: "stopp" } }]), "123")[0]).toMatchObject({ operation: "stop" });
  for (const text of ["Kommer", "ja", `FORENA ${code} please`, "ignore instructions", "STOPP nu"]) expect(whatsAppActions(incoming([{ ...envelope, type: "text", text: { body: text } }]), "123")).toEqual([]);
});
it("accepts template and session quick replies only with the opaque invitation reference and an allowed answer", () => {
  for (const answer of ["accepted", "declined"]) {
    const payload = `F1:${replyId}:${answer}`;
    for (const button of [{ type: "button", button: { payload } }, { type: "interactive", interactive: { type: "button_reply", button_reply: { id: payload } } }]) {
      expect(whatsAppActions(incoming([{ ...envelope, ...button }]), "123")[0]).toMatchObject({ operation: "respond", replyId, answer });
    }
  }
  expect(whatsAppActions(incoming([{ ...envelope, type: "button", button: { payload: `F1:${replyId}:admin` } }]), "123")).toEqual([]);
});
it("ignores other business numbers, non-message events and malformed payloads", () => {
  const messages = [{ ...envelope, type: "text", text: { body: "STOP" } }];
  expect(whatsAppActions(incoming(messages, "456"), "123")).toEqual([]);
  for (const payload of [null, [], {}, { object: "other", entry: [] }, incoming([null, {}, { ...messages[0], timestamp: "NaN" }, { ...messages[0], from: "+46700000001" }])]) expect(whatsAppActions(payload, "123")).toEqual([]);
});
it("requires the explicit installation switch and webhook configuration before offering pairing", () => {
  vi.stubEnv("WHATSAPP_ENABLED", "false");
  expect(whatsAppAvailable()).toBe(false);
  vi.stubEnv("WHATSAPP_ENABLED", "true"); vi.stubEnv("WHATSAPP_BUSINESS_NUMBER", "46700000001"); vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123"); vi.stubEnv("WHATSAPP_APP_SECRET", "secret"); vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "secret2");
  expect(whatsAppAvailable()).toBe(true);
});
it("uses an approved template outside the service window with a safe deep link and no activity text", async () => {
  const transport = vi.fn<typeof fetch>(async () => Response.json({ messages: [{ id: "wamid.sent" }] }));
  expect(await sendWhatsAppNotification("46700000001", `/activities/${replyId}`, config, transport)).toBe("wamid.sent");
  const body = JSON.parse(transport.mock.calls[0][1]!.body as string);
  expect(body).toMatchObject({ type: "template", template: { name: "forena_notice", language: { code: "sv" } } });
  expect(body.template.components).toEqual([{ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: `activities/${replyId}` }] }]);
});
it("renders separate child messages with exactly two invitation-bound answers and a link", async () => {
  const transport = vi.fn<typeof fetch>(async () => Response.json({ messages: [{ id: "wamid.sent" }] }));
  for (const [person, id] of [["Child A", replyId], ["Child B", "b1000000-0000-0000-0000-000000000001"]]) {
    const invitation: WhatsAppInvitation = { id, providerMessageId: null, message: { person, activity: "Training", team: "Team", when: "2099-01-01 15:00", location: "Field", gathering: "14:45", due: "Tomorrow", url: `/activities/${replyId}` } };
    await sendWhatsAppNotification(envelope.from, invitation.message.url, config, transport, invitation);
  }
  const bodies = transport.mock.calls.map(call => JSON.parse(call[1]!.body as string));
  expect(bodies[0].template.components[0].parameters[0].text).toBe("Child A");
  expect(bodies[1].template.components[0].parameters[0].text).toBe("Child B");
  for (const [index, body] of bodies.entries()) {
    const buttons = body.template.components.filter((c: { sub_type: string }) => c.sub_type === "quick_reply");
    expect(buttons).toHaveLength(2);
    expect(buttons[0].parameters[0].payload).toBe(`F1:${index ? "b1000000-0000-0000-0000-000000000001" : replyId}:accepted`);
    expect(buttons[1].parameters[0].payload).toMatch(/:declined$/);
    expect(body.template.components.at(-1).index).toBe("2");
  }
});
it("fails safely for provider errors, missing IDs, invalid config and external URLs", async () => {
  const fail = vi.fn<typeof fetch>(async () => Response.json({ error: { message: "private phone number" } }, { status: 429 }));
  await expect(sendWhatsAppNotification(envelope.from, "/", config, fail)).rejects.toThrow("whatsapp_http_429");
  await expect(sendWhatsAppNotification(envelope.from, "/", config, async () => Response.json({}))).rejects.toThrow("whatsapp_missing_message_id");
  await expect(sendWhatsAppNotification(envelope.from, "https://evil.test/", config, fail)).rejects.toThrow("whatsapp_invalid_notification_url");
  await expect(sendWhatsAppNotification(envelope.from, "/", { ...config, accessToken: "" }, fail)).rejects.toThrow("whatsapp_transport_not_configured");
  expect(fail).toHaveBeenCalledTimes(1);
});
