export async function sendMembershipVerificationEmail({ to, verificationUrl, idempotencyKey }: {
  to: string; verificationUrl: string; idempotencyKey: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("E-postutskick är inte konfigurerat.");
  const safeUrl = verificationUrl.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]!);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify({
      from, to: [to], subject: "Verifiera din e-post för medlemsansökan i Förena",
      text: `Bekräfta din e-postadress för att skicka medlemsansökan till föreningens kansli. Länken gäller i 24 timmar:\n${verificationUrl}\n\nOm du inte har gjort en ansökan kan du ignorera mejlet. Inget konto eller medlemskap skapas.`,
      html: `<div lang="sv" style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;max-width:600px;margin:auto"><h1 style="font-size:24px">Bekräfta din e-postadress</h1><p>Bekräfta adressen för att skicka medlemsansökan till föreningens kansli. Länken gäller i 24 timmar.</p><p><a href="${safeUrl}" style="display:inline-block;background:#176b45;color:#fff;padding:12px 18px;border-radius:8px">Verifiera e-postadress</a></p><p>Du kan även kopiera adressen:<br><a href="${safeUrl}" style="overflow-wrap:anywhere">${safeUrl}</a></p><p>Om du inte har gjort en ansökan kan du ignorera mejlet. Inget konto eller medlemskap skapas.</p></div>`,
    }),
  });
  // Never log provider bodies: they may include addresses or verification links.
  if (!response.ok) throw new Error(`E-postutskicket misslyckades (${response.status}).`);
}
