import type { Metadata } from "next";
import { headers } from "next/headers";
import { AppHeader } from "@/components/app-header";
import { CopyAddress } from "@/components/copy-address";
import { getSiteUrl } from "@/lib/site-url";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Anslut AI | Förena" };

export default async function ConnectPage() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") === "https" ? "https" : "http";
  const siteUrl = getSiteUrl(host ? `${protocol}://${host}` : undefined);
  const address = new URL("/api/mcp", siteUrl).href;
  const user = isSupabaseConfigured()
    ? (await (await createClient()).auth.getUser()).data.user
    : null;

  return <main>
    <AppHeader accountEmail={user?.email} loginHref="/login?next=%2Fconnect" />
    <div className="application-page connection-page">
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
            <p>Direkt anslutning till ChatGPT är ännu inte tillgänglig. Det behövs ett inloggningsflöde där du kan godkänna anslutningen. Att lägga in serveradressen räcker därför inte ännu.</p>
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
    </div>
  </main>;
}
