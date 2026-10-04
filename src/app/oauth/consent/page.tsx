import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { OAuthConsentButtons } from "@/components/oauth-consent-buttons";
import { authorizationId, loadConsent } from "@/lib/mcp/consent";
import { getMcpOAuthConfig } from "@/lib/mcp/oauth";
import { createClient } from "@/lib/supabase/server";
import { submitConsent } from "./actions";

export const metadata: Metadata = { title: "Godkänn AI-anslutning | Förena", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string | string[]; error?: string }> }) {
  const params = await searchParams;
  const id = authorizationId(params.authorization_id);
  const enabled = Boolean(getMcpOAuthConfig());
  const result = enabled && id && !params.error ? await loadConsent(await createClient(), id) : { kind: "error" as const };
  if (result.kind === "login") redirect(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${id}`)}`);
  if (result.kind === "redirect") redirect(result.target);
  const labels: Record<string, string> = { openid: "Identifiera ditt konto", email: "Läsa din e-postadress", profile: "Läsa din profil" };
  return <main>
    <AppHeader accountEmail={result.kind === "consent" ? result.email : undefined} />
    <div className="application-page connection-page"><section className="application-card connection-card">
      <p className="eyebrow">Integrationer</p><h1>Godkänn AI-anslutning</h1>
      {result.kind === "consent" ? <div className="connection-content">
        <p><strong>{result.details.client.name || "OAuth-klienten"}</strong> vill ansluta till Förena med ditt konto ({result.email}).</p>
        <p>Klient-id: <code>{result.details.client.id}</code></p>
        <p>Du återvänder till: <code>{result.details.redirect_uri}</code></p>
        <section className="form-section"><h2>Begärda rättigheter</h2>
          {result.scopes.length ? <ul>{result.scopes.map((scope) => <li key={scope}>{labels[scope]} (<code>{scope}</code>)</li>)}</ul> : <p>Inga profilrättigheter begärs.</p>}
        </section>
        <p>MCP-verktygen kan läsa laginformation och förbereda aktivitetsförslag inom dina behörigheter. Förslag sparas inte automatiskt.</p>
        <p className="connection-note">OAuth-token kan också ge åtkomst till Förena-data via Supabase enligt installationens databasregler. Profilrättigheterna ovan begränsar inte i sig den åtkomsten. Godkänn bara en klient du litar på.</p>
        <form action={submitConsent}>
          <input type="hidden" name="authorization_id" value={id ?? ""} />
          <OAuthConsentButtons />
        </form>
      </div> : <>
        <p role="alert">{enabled ? "Anslutningen kunde inte verifieras. Länken kan ha gått ut, redan använts eller begära rättigheter som inte stöds. Starta om anslutningen från din AI-klient." : "OAuth-anslutning är inte aktiverad för den här installationen."}</p>
        <p><a href="/connect">Till anslutningsguiden</a></p>
      </>}
    </section></div>
  </main>;
}
