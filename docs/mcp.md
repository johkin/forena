# MCP-server

Förena exponerar en MCP-server på `/api/mcp` i samma Next.js-applikation.
Transporten är stateless Streamable HTTP med JSON-svar och en ny server och
Supabase-klient för varje request. Ingen separat process, Redis eller
MCP-sessionslagring behövs. Servern använder den officiella TypeScript-SDK:n.

## Verktyg

| Verktyg | Resultat | Behörighet |
| --- | --- | --- |
| `list_teams` | Lag-id, namn och förenings-id, 25 kandidater per sida | `team.view` eller aktiv egen/barns deltagarmedlemskap |
| `get_team_overview` | Tidszon och högst fem kommande aktiviteter | Samma åtkomst som lagassistenten |
| `get_team_member_names` | Aktiva spelares och ledares visningsnamn | `team.view` |
| `get_accepted_participant_names` | Visningsnamn på dem som tackat ja | `invitation.manage`, aktivitet i lagets tillgängliga översikt |
| `prepare_activity_draft` | Validerat engångs- eller serieutkast | `activity.manage` |

`list_teams` paginerar RLS-synliga kandidater och filtrerar sedan med
applikationsbehörighet. Fortsätt med `nextOffset` tills värdet är `null`, även
om en sida saknar tillgängliga lag. Namnlistor begränsas till 500 rader och
anger `truncated` när gränsen nås.

Familjeöversikten innehåller bara egna/barnens svar. Behöriga
kallelsehanterare får antal ja, nej och obesvarade. Varken svarskommentarer,
kontaktuppgifter, personnummer, dokument eller assistentminnen returneras.
Servern återanvänder lagassistentens behörighetsfiltrerade kontext internt men
bygger ett mindre MCP-svar. Namnverktygen gör uttryckliga behörighetskontroller
före sina avgränsade läsningar. Databasfel ger verktygsfel utan SQL-detaljer.

Aktivitetsförslag använder samma validering som webbappens editor. Datum och tid
avser föreningens tidszon; serie använder ISO-veckodagar 1–7.
`prepare_activity_draft` returnerar `saved: false` och `reviewRequired: true`.
Resultatet är ett förslag att granska och föra över till appens aktivitetsformulär;
det finns ännu ingen automatisk importlänk. Inga aktiviteter, kallelser eller
meddelanden skapas. Servern anropar ingen AI-modell; MCP-klienten står för AI:n.

## Autentisering och konfiguration

Använd en giltig **Supabase access token för en inloggad användare** som
`Authorization: Bearer <access-token>`. Klienten behöver kunna skicka egna
HTTP-headers. Token kan erhållas genom Supabase-inloggning i samma projekt;
en redan autentiserad Supabase-klient har den i
`(await supabase.auth.getSession()).data.session?.access_token`.
Klienten ansvarar för tokenförnyelse genom sin ordinarie Supabase-session.
Skicka endast access token till MCP-servern, aldrig refresh token.

Servern verifierar signatur/utgångstid med `getClaims`, kräver rollen
`authenticated` och kontrollerar användaren med `getUser`. Anropet körs genom
projektets publishable key med användarens token och vanliga RLS-policyer.
Cookies, anon/service-role tokens och klientangivna användaridentiteter accepteras
inte. Browser-sessionens proxy hoppar över exakt `/api/mcp`.

OAuth-samtycke och resource discovery finns nu, men är **avstängda som standard**.
Supabase-konfiguration, klientregistrering, token-audience och granskning av RLS
måste slutföras separat; denna ändring aktiverar inget i Supabase eller produktion.
Kopiera inte långlivade eller privilegierade nycklar för att kringgå detta.
Befintliga access tokens kan förbli giltiga till utgångstid
efter utloggning; omedelbar sessionsåterkallning kräver ytterligare sessionskontroll.

Miljövariabler:

- `NEXT_PUBLIC_SUPABASE_URL` och `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` som i appen.
- `SITE_URL`: kanonisk app-URL, sätt uttryckligen i produktion. Requests med
  `Origin` accepterar bara denna origin. Utan `SITE_URL` används request-URL för
  lokal utveckling. Klienter utan `Origin` fungerar över vanlig bearer-auth.

Ingen service role-nyckel, AI Gateway-konfiguration eller migration behövs för
bearer-token-läget eller dessa sidor. Produktions-OAuth kan kräva separat
token-hook och RLS-migration enligt nedan.
Token ska inte sparas i Git eller loggas. Verktygsanrop loggar verktygsnamn,
användar-id, utfall och latens, aldrig token, argument eller resultat.
Requests är begränsade till 64 KiB och svar får `Cache-Control: no-store`.
GET och DELETE returnerar 405; servern har ingen SSE-prenumeration eller
MCP-session att stänga. Rate limiting kan införas i driftens gateway.

## OAuth: samtycke och discovery

`/oauth/consent?authorization_id=…` använder Supabase Auths OAuth-server.
Sidan kräver inloggning och visar klientnamn, klient-id, returadress och begärda
`openid`, `email`, `profile`-rättigheter. Okända klienter/rättigheter nekas.
Godkänn/avbryt är server actions (POST med Next.js origin-kontroll), aldrig GET.
Varje beslut verifierar användare och hämtar auktoriseringen på nytt innan
Supabase får approve/deny. Bara Supabase-resultatet får bestämma returadress;
efter ett beslut måste origin och sökväg matcha den verifierade klientadressen.
Redan godkända auktoriseringar kan returnera en färdig Supabase-redirect.
Utgångna länkar och fel visar ett neutralt fel utan token eller API-detaljer.
Magic-link-inloggning behåller `next` så att samtycket kan återupptas.

Publik RFC 9728-metadata finns på båda adresserna:

- `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-protected-resource/api/mcp`

De annonserar exakt `SITE_URL/api/mcp` som resource och Supabase
`NEXT_PUBLIC_SUPABASE_URL/auth/v1` som authorization server. Anonyma MCP-POST
får `WWW-Authenticate` med `resource_metadata`. Proxy uppdaterar inga cookies
för dessa discovery-adresser. Metadata kommer aldrig från inkommande Host.
Om OAuth är avstängt eller konfigurationen är ogiltig svarar discovery 503,
samtyckessidan visar inaktivt läge och MCP använder sin tidigare Bearer-challenge.

### Installationssteg (administratör)

1. Aktivera Supabase OAuth Server (beta) i Auth-inställningarna. Ställ Site URL
   till Förena-adressen och Authorization URL Path till `/oauth/consent`.
   Lokal `supabase/config.toml` har redan sökvägen men lämnar funktionen avstängd.
2. Registrera klienten manuellt i Supabase. Använd den exakta callback-URL som
   AI-klienten visar; inga jokertecken. Behåll dynamisk registrering avstängd.
   Konfigurera klient-id och eventuellt klienthemlighet i AI-klienten, aldrig
   i Förena-sidan eller ett `NEXT_PUBLIC_`-fält.
3. Sätt servervariablerna `SITE_URL` (en HTTPS-origin utan sökväg),
   `FORENA_MCP_OAUTH_CLIENT_IDS` (kommaseparerad tillåtelselista) och till sist
   `FORENA_MCP_OAUTH_ENABLED=true`. Lokal HTTP accepteras bara för localhost/
   127.0.0.1 i icke-produktionsläge. Supabase-URL måste också vara en origin.
4. **Konfigurera och verifiera resource-audience innan aktivering.** MCP kräver
   att signerade OAuth-token har ett tillåtet `client_id` och `aud` som innehåller
   exakt `SITE_URL/api/mcp`. Supabases standardaudience `authenticated` räcker
   därför inte. En separat Custom Access Token Hook/issuer-konfiguration behöver
   ge rätt audience och bevara det som Auth/PostgREST behöver. Hooken ingår inte
   här. Om ert Supabase-flöde inte kan binda rätt audience till begärd resource,
   lämna funktionen avstängd. Vanliga användartoken utan `client_id` fungerar
   fortsatt i det manuella läget; OAuth-token utan korrekt audience nekas.
5. **Granska RLS för OAuth-klienter.** En OAuth-token kan användas direkt mot
   Supabase och får annars samma databasbehörigheter som användaren. Förena-MCP:s
   verktygsfilter begränsar inte direkt databasåtkomst. Inför vid behov restriktiva
   policyer baserade på signerad `client_id`, inklusive skydd mot skrivningar och
   kontaktdata. `openid/email/profile` är identitetsrättigheter, inte egna
   MCP-läs-/skrivscopes och inte en ersättning för RLS. Inga sådana policyer
   läggs till automatiskt i denna ändring.
6. För `openid` behöver Supabase asymmetriska signeringsnycklar (ES256/RS256).
   Testa klientens discovery, Authorization Code + PKCE, godkänn/avbryt,
   tokenförnyelse, fel audience, okänd klient och lagisolering i en testmiljö
   med syntetiska data innan anslutningen används med medlemsdata.

Supabase äger authorization-server-metadata, authorize/token-endpoints och JWKS.
Förena annonserar inte sig själv som issuer och skapar inte en konkurrerande
`oauth-authorization-server`-fil. Supabase discovery finns normalt på
`https://<project>.supabase.co/.well-known/oauth-authorization-server/auth/v1`.
Kontrollera installationens faktiska metadata och klientstöd före driftsättning.
Samtyckessidan ensam gör inte installationen färdig för ChatGPT.

Officiella referenser:

- [Supabase OAuth Server](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- [Supabase token security och RLS](https://supabase.com/docs/guides/auth/oauth-server/token-security)
- [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)

## Anslutningssida i appen

Den publika sidan `/connect` visar serveradressen och instruktioner, inklusive
den aktuella begränsningen för ChatGPT. Den nås från **Anslut AI** i den
gemensamma menyn och från profilens Integrationer-avsnitt. Kopieringsikonen
kopierar endast den publika MCP-adressen, aldrig någon token. Vid nekad
urklippsåtkomst markeras adressen för manuell kopiering. `SITE_URL` används
när den är satt; annars visas adressen för den aktuella sajten.

## Anslutningsexempel

En klient med TypeScript-SDK:n kan ansluta så här:

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({ name: "forena-client", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(
  new URL(`${process.env.FORENA_URL}/api/mcp`),
  { requestInit: { headers: {
    Authorization: `Bearer ${process.env.FORENA_ACCESS_TOKEN}`,
  } } },
);
await client.connect(transport);
const teams = await client.callTool({ name: "list_teams", arguments: {} });
console.log(teams);
await client.close();
```

Använd lokalt `FORENA_URL=http://localhost:3000`, en syntetisk testanvändare och
en access token från den lokala Supabase-instansen. Testa sedan
`get_team_overview` med ett lag-id från `list_teams`.

Automatiska tester verifierar riktig MCP-initialisering, tool discovery,
verktygsanrop, tokenhantering, origin/body-gränser, nekad åtkomst, lagisolering,
minimerade svar och serievalidering. Databaspolicyn täcks separat av befintliga
Supabase-isolationstester. Ett end-to-end-test med verklig Auth/PostgREST och en
extern MCP-klient behövs även i avsedd testmiljö före användning med medlemsdata.
