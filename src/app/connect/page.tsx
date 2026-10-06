import type { Metadata } from "next";
import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { CopyAddress } from "@/components/copy-address";
import { getSiteUrl } from "@/lib/site-url";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getMcpOAuthConfig } from "@/lib/mcp/oauth";

export const metadata: Metadata = { title: "Anslut AI | Förena" };

export default async function ConnectPage() {
  const oauthEnabled = Boolean(getMcpOAuthConfig());
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") === "https" ? "https" : "http";
  const siteUrl = getSiteUrl(host ? `${protocol}://${host}` : undefined);
  const address = new URL("/api/mcp", siteUrl).href;
  const user = isSupabaseConfigured()
    ? (await (await createClient()).auth.getUser()).data.user
    : null;

  return <AppShell accountEmail={user?.email} loginHref="/login?next=%2Fconnect">
    <main className="application-page connection-page">
      <section className="application-card connection-card">
        <p className="eyebrow">Integrationer</p>
        <h1>Anslut AI</h1>
        <p>Använd Förena från en AI-tjänst som stöder MCP. Anslutningen följer dina behörigheter i föreningen och laget.</p>
        <div className="connection-content">
          <section className="form-section" aria-labelledby="connection-address-heading">
            <h2 id="connection-address-heading">Serveradress</h2>
            <p>Den här adressen används för att ansluta till Förena.</p>
            <CopyAddress address={address} />
          </section>
          <section className="connection-note" aria-labelledby="connection-chatgpt-heading">
            <h2 id="connection-chatgpt-heading">ChatGPT</h2>
            <p>{oauthEnabled ? "Välj OAuth när du lägger till MCP-adressen i din AI-klient. Logga in i Förena och kontrollera klienten och rättigheterna innan du godkänner. Klienten måste vara registrerad av installationens administratör." : "Samtyckessidan finns, men OAuth är inte aktiverat för den här installationen. En administratör behöver konfigurera Supabase, registrera klienten och verifiera token och databasbehörigheter innan direkt anslutning kan användas."}</p>
          </section>
          <section className="form-section" aria-labelledby="connection-steps-heading">
            <h2 id="connection-steps-heading">Anslut med en MCP-klient</h2>
            <p>Den första versionen fungerar med klienter som kan skicka en åtkomsttoken.</p>
            <ol className="connection-steps">
              <li>Kopiera MCP-adressen ovan.</li>
              <li>Lägg till en MCP-server i din klient och klistra in adressen. Välj Streamable HTTP om klienten frågar efter anslutningstyp.</li>
              <li>Ange en giltig Supabase-åtkomsttoken för ditt Förena-konto som <code>Authorization: Bearer &lt;access-token&gt;</code>. Klienten behöver förnya token när den löper ut.</li>
            </ol>
            <p>Du kan läsa lagets aktiviteter och förbereda aktivitetsförslag. Förslagen sparas först när du själv skapar aktiviteten i Förena.</p>
            <p><a href="https://github.com/johkin/forena/blob/main/docs/mcp.md">Teknisk anslutningsguide och klientexempel</a></p>
          </section>
        </div>
      </section>
    </main>
  </AppShell>;
}
