function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
export async function sendClubAdminInvitationEmail({ to, invitationUrl, invitationId, clubName }: {
  to: string; invitationUrl: string; invitationId: string; clubName: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("E-postutskick är inte konfigurerat.");
  const club = escapeHtml(clubName), url = escapeHtml(invitationUrl);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", signal: AbortSignal.timeout(10_000),
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "idempotency-key": `club-admin-invite-${invitationId}` },
    body: JSON.stringify({ from, to: [to], subject: `Klubbadministratör i ${clubName} – Förena`,
      text: `Du är inbjuden som klubbadministratör i ${clubName}. Logga in med denna e-postadress och acceptera inbjudan inom sju dagar. Rollen ger möjlighet att hantera klubbens medlemsansökningar och administration. Den ger ingen systemadministration.\n\n${invitationUrl}\n\nOm du inte väntade dig inbjudan kan du ignorera mejlet.`,
      html: `<div lang="sv" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;max-width:600px;margin:auto"><h1 style="font-size:24px">Klubbadministratör i ${club}</h1><p>En systemadministratör har bjudit in dig att hantera klubbens medlemsansökningar och administration. Rollen ger ingen systemadministration.</p><p>Logga in med samma e-postadress som detta mejl skickades till och acceptera inom sju dagar.</p><p><a href="${url}" style="display:inline-block;padding:12px 18px;background:#1e3f20;color:#fff;border-radius:12px">Acceptera inbjudan</a></p><p>Du kan även kopiera adressen:<br><a href="${url}" style="overflow-wrap:anywhere">${url}</a></p><p>Om du inte väntade dig inbjudan kan du ignorera mejlet.</p></div>`,
    }),
  });
  if (!response.ok) throw new Error(`E-postutskicket misslyckades (${response.status}).`);
}
