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

Detta är **bearer-token-stöd, inte ett färdigt OAuth-anslutningsflöde**.
Servern har ännu ingen OAuth-discovery, klientregistrering, samtyckessida eller
MCP-specifik audience/scopes. En direkt ChatGPT-anslutning med OAuth är därför
nästa steg. Kopiera inte långlivade eller privilegierade nycklar för att kringgå
avsaknaden av OAuth. Befintliga access tokens kan förbli giltiga till utgångstid
efter utloggning; omedelbar sessionsåterkallning kräver ytterligare sessionskontroll.

Miljövariabler:

- `NEXT_PUBLIC_SUPABASE_URL` och `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` som i appen.
- `SITE_URL`: kanonisk app-URL, sätt uttryckligen i produktion. Requests med
  `Origin` accepterar bara denna origin. Utan `SITE_URL` används request-URL för
  lokal utveckling. Klienter utan `Origin` fungerar över vanlig bearer-auth.

Ingen service role-nyckel, AI Gateway-konfiguration eller migration behövs.
Token ska inte sparas i Git eller loggas. Verktygsanrop loggar verktygsnamn,
användar-id, utfall och latens, aldrig token, argument eller resultat.
Requests är begränsade till 64 KiB och svar får `Cache-Control: no-store`.
GET och DELETE returnerar 405; servern har ingen SSE-prenumeration eller
MCP-session att stänga. Rate limiting kan införas i driftens gateway.

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
