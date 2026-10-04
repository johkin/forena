type PlatformAdminInvitationEmail = {
  to: string;
  invitationUrl: string;
  invitationId: string;
  bootstrap?: boolean;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

export async function sendPlatformAdminInvitationEmail({
  to,
  invitationUrl,
  invitationId,
  bootstrap = false,
}: PlatformAdminInvitationEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY eller RESEND_FROM_EMAIL saknas.");
  }

  const safeInvitationUrl = escapeHtml(invitationUrl);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "idempotency-key": `platform-admin-invite-${invitationId}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: bootstrap ? "Aktivera den första systemadministratören i Förena" : "Du är inbjuden som systemadministratör i Förena",
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#17211b;max-width:600px;margin:auto">
        <h1 style="font-size:24px">${bootstrap ? "Slutför installationen av Förena" : "Systemadministration i Förena"}</h1>
        <p>${bootstrap
          ? "Förena saknar ännu systemadministratör. Den här adressen är konfigurerad som initial administratör."
          : "En befintlig systemadministratör har bjudit in dig som systemadministratör."}</p>
        <p>Logga in med samma e-postadress som detta meddelande skickades till. Behörigheten aktiveras först efter att e-postadressen har verifierats av Förena.</p>
        <p style="margin:28px 0"><a href="${safeInvitationUrl}" style="background:#176b45;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Fortsätt till Förena</a></p>
        <p style="font-size:13px;color:#526158">Om knappen inte fungerar kan du kopiera den här adressen:<br><a href="${safeInvitationUrl}">${safeInvitationUrl}</a></p>
        <p style="font-size:12px;color:#6b746f">Om du inte väntade dig denna inbjudan kan du ignorera meddelandet.</p>
      </div>`,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Resend svarade ${response.status}: ${details.slice(0, 300)}`);
  }
}
