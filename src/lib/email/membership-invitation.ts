type MembershipInvitationEmail = {
  to: string;
  playerName: string;
  invitationUrl: string;
  idempotencyKey: string;
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

export async function sendMembershipInvitationEmail({
  to,
  playerName,
  invitationUrl,
  idempotencyKey,
}: MembershipInvitationEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY eller RESEND_FROM_EMAIL saknas.");
  }

  const safePlayerName = escapeHtml(playerName);
  const safeInvitationUrl = escapeHtml(invitationUrl);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Aktivera medlemskapet för ${playerName}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#17211b;max-width:600px;margin:auto">
        <h1 style="font-size:24px">Medlemsansökan är godkänd</h1>
        <p>Ansökan för <strong>${safePlayerName}</strong> har godkänts.</p>
        <p>Öppna länken nedan inom sju dagar. Om du inte redan är inloggad får du först en separat, kortlivad inloggningslänk via e-post.</p>
        <p style="margin:28px 0"><a href="${safeInvitationUrl}" style="background:#176b45;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Aktivera medlemskapet</a></p>
        <p style="font-size:13px;color:#526158">Om knappen inte fungerar kan du kopiera den här adressen:<br><a href="${safeInvitationUrl}">${safeInvitationUrl}</a></p>
      </div>`,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Resend svarade ${response.status}: ${details.slice(0, 300)}`);
  }
}
