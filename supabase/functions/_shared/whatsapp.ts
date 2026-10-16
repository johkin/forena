export type WhatsAppConfiguration = {
  accessToken?: string;
  phoneNumberId?: string;
  apiVersion?: string;
  templateName?: string;
  templateLanguage?: string;
  invitationTemplateName?: string;
};

export type WhatsAppInvitation = { id: string; message: { person: string; team: string; activity: string; when: string; location: string; gathering: string; due: string; url: string }; providerMessageId: string | null };

// Generic notices contain only a link. Invitation snapshots use a separate
// approved template with one person's details and two opaque reply references.
// Both URL buttons use the installation's canonical origin followed by '/'.
export async function sendWhatsAppNotification(
  recipient: string,
  url: string,
  config: WhatsAppConfiguration,
  transport: typeof fetch = fetch,
  invitation?: WhatsAppInvitation,
): Promise<string> {
  const template = invitation ? config.invitationTemplateName : config.templateName;
  if (!config.accessToken || !/^\d+$/.test(config.phoneNumberId ?? "")
    || !/^v\d+\.\d+$/.test(config.apiVersion ?? "")
    || !/^[a-z0-9_]+$/.test(template ?? "")
    || !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(config.templateLanguage ?? "")) {
    throw new Error("whatsapp_transport_not_configured");
  }
  if (!/^[1-9]\d{6,14}$/.test(recipient)) throw new Error("whatsapp_invalid_recipient");
  if (url !== "/" && !/^\/activities\/[a-f0-9-]{36}$/i.test(url)) throw new Error("whatsapp_invalid_notification_url");
  if (invitation && !/^[a-f0-9-]{36}$/i.test(invitation.id)) throw new Error("whatsapp_invalid_reply_id");
  const buttons = invitation ? ["accepted", "declined"].map((answer, index) => ({
    type: "button", sub_type: "quick_reply", index: String(index),
    parameters: [{ type: "payload", payload: `F1:${invitation.id}:${answer}` }],
  })) : [];
  const bodyComponents = invitation ? [{ type: "body", parameters: ["person", "team", "activity", "when", "location", "gathering", "due"].map(key => ({
    type: "text", text: String(invitation.message[key as keyof WhatsAppInvitation["message"]] || "Se Förena").replace(/\s+/g, " ").trim().slice(0, 150),
  })) }] : [];
  const response = await transport(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.accessToken}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      messaging_product: "whatsapp", recipient_type: "individual", to: recipient, type: "template",
      template: { name: template, language: { code: config.templateLanguage }, components: [
        ...bodyComponents, ...buttons,
        { type: "button", sub_type: "url", index: invitation ? "2" : "0", parameters: [{ type: "text", text: url === "/" ? "?notification=1" : url.slice(1) }] },
      ] },
    }),
  });
  // Provider bodies can echo phone numbers or content. Persist only safe codes.
  if (!response.ok) throw new Error(`whatsapp_http_${response.status}`);
  const body = await response.json() as { messages?: { id?: string }[] };
  const id = body.messages?.[0]?.id;
  if (typeof id !== "string" || !id || id.length > 200) throw new Error("whatsapp_missing_message_id");
  return id;
}
