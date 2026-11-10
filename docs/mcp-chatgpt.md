# Anslut ChatGPT eller Claude till Förena

Guiden gäller Förenas **Kotlin/Spring-server**. AI-klienten ansluter via MCP och
hämtar uppgifter med det Förena-konto som användaren loggar in med. Förena
behöver ingen OpenAI-nyckel eller egen AI-modell för anslutningen.

Instruktionerna är kontrollerade mot koden och leverantörernas dokumentation
2026-11-10. Verkliga ChatGPT- och Claude-anslutningar har ännu inte provkörts. Genomför
[anslutningsprovet](#prova-anslutningen) i avsedd testmiljö innan anslutningen
används med medlemsdata.

## Vad får AI-klienten tillgång till?

Servern erbjuder 14 läsverktyg för bland annat aktiviteter, lag, kallelsesvar,
närvaro och dokument. Även svarskommentarer och medlemsuppdrag kan ingå när
kontot har behörighet. Varje anrop kontrollerar kontots aktuella åtkomst i
Förena. Godkännandet ger inga ytterligare verksamhetsbehörigheter.

Verktygen kan bara läsa. De kan inte skapa aktiviteter, svara på kallelser eller
ändra medlemmar. Förenas assistentsamtal och assistentminnen exporteras inte.
Uppgifter som hämtas lämnas till den anslutna AI-tjänsten för att besvara frågan. Fullständig
verktygslista och resultatgränser finns i [MCP-dokumentationen](mcp.md).

## Anslut i ChatGPT

Du behöver ett Förena-konto, installationens publika MCP-adress och ett
ChatGPT-konto eller en arbetsyta som tillåter egna MCP-anslutningar. Klienten
registrerar sig automatiskt genom Dynamic Client Registration, DCR. Klienten
hanterar callback, klient-id och eventuell klienthemlighet automatiskt.
Om Förena redan är tillgängligt som en godkänd plugin i arbetsytan kan du
installera den och gå direkt till inloggningen.

1. Öppna ChatGPT i webbläsaren och välj rätt arbetsyta. Gå till **Plugins**,
   välj **+ → Add custom MCP server** och ange namnet **Förena**.
2. Ange installationens adress under **Connection**, exempelvis
   `https://forena.example/api/mcp`. Byt exempeladressen mot er riktiga adress.
3. Välj **OAuth**. Om formuläret visar ett val för klientregistrering, välj
   **DCR** eller automatisk registrering. Förena annonserar registreringsadressen
   genom OAuth-discovery. CIMD stöds ännu inte.
4. Granska ChatGPT:s varning och välj **Create as a plugin**. När
   inloggningen öppnas: logga in på Förena, granska samtycket och välj
   **Godkänn läsåtkomst**. Granska sedan verktygslistan och installera pluginen.
5. Starta en ny konversation, skriv **@** och välj **Förena**. Prova till
   exempel: ”Visa mina kommande aktiviteter i Förena.”

Menytexter kan skilja sig mellan konton. I den äldre appvyn används
**Settings → Apps → Create**, följt av **Scan Tools** och **Create**.
OpenAI beskriver aktuell navigation och åtkomstkrav i
[sin anslutningsguide](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt).
OAuth och DCR beskrivs i [OpenAI:s autentiseringsguide](https://developers.openai.com/plugins/build/auth).

Om automatisk registrering inte finns i klienten kan administratören använda
[en förregistrerad klient](#alternativ-förregistrerad-klient).

## Anslut i Claude och andra klienter

I Claude öppnar du **Customize → Connectors** och lägger till en egen anslutning
med samma MCP-adress. Välj OAuth-inloggning och **Register automatically** under
**OAuth client**. Följ inloggningen till Förena och godkänn läsåtkomsten. I en
Team- eller Enterprise-arbetsyta behöver en behörig administratör först lägga
till anslutningen. Se [Anthropics guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

Samma server kan användas av andra klienter som stöder Streamable HTTP och
OAuth med DCR eller förregistrering. Varje klient får en separat OAuth-identitet;
användarens Förena-konto bestämmer dataåtkomsten. En egen app som använder
[Claude API:s MCP-connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector#authentication)
behöver själv sköta OAuth-inloggning och tokenförnyelse.

## För Förena-administratören

### Publik adress och routing

Använd en publik HTTPS-installation av Kotlin-appen. Webb, OAuth och MCP använder
samma origin, exempelvis `https://forena.example`. `FORENA_WEB_ORIGIN` anger
denna adress; annars används `SITE_URL`. Ange ingen sökväg eller avslutande
snedstreck. MCP-adressen blir origin följt av `/api/mcp`.

Kontrollera att `/api/*`, `/oauth2/*` och `/.well-known/*` når backend, medan
`/login` och `/oauth/consent` når React-appen. ChatGPT kan inte nå datorns
`localhost` genom en vanlig publik anslutning. En lokal testinstallation behöver
en separat lösning för extern åtkomst och samma kanoniska origin i konfigurationen.

### Automatisk klientregistrering

Spring Security hanterar RFC 7591 på `POST /oauth2/register`. OAuth-metadata
annonserar `registration_endpoint`; klienten skickar sina callback-adresser
och får klient-id och eventuell klienthemlighet direkt. Registrering kräver
ingen inloggning och ger i sig ingen åtkomst till medlemsdata. Användaren måste
fortfarande logga in och godkänna OAuth-åtkomsten.

Registreringen tillåter endast `mcp:read`, Authorization Code och auth-metoderna
`none`, `client_secret_basic` eller `client_secret_post`. Utelämnat scope blir
`mcp:read`. PKCE med `S256` och samtycke krävs alltid. Klienter med hemlighet kan
även registrera `refresh_token`. För en publik klient tas begärd refresh-grant bort
och svaret visar de grants som faktiskt registrerats.

Callback-adresser valideras vid registrering och auktorisering. Fjärr-HTTPS
matchas exakt. Lokal HTTP tillåts för `localhost`, `127.0.0.1` och `[::1]`.
Springs loopbackundantag tillåter ändrad port för IP-litteralerna med både HTTP
och HTTPS; host, schema, sökväg och övriga URI-delar måste fortfarande matcha.
För `localhost` är även porten exakt. Använd vid behov en fast callback-port
i CLI-klienter.

Endpointen har en gräns på 16 KiB JSON och högst tio callback-adresser med
sammanlagt högst 1 000 tecken inklusive lagringens separatorer. Råa kommatecken
och ogiltiga portnummer nekas; registrerade URI-strängar normaliseras inte.
Registrering begränsas av samma PostgreSQL-baserade klient-/globalbudget som
övrig autentisering, med egen klientnyckel. Den laddar eller skapar ingen
webbsession. Klientregistret gallras inte automatiskt: övervaka antalet
registreringar och hantera borttagning separat utan att radera aktiva grants.
Klientens uppgivna namn är inte en verifierad leverantörsidentitet.

Övriga anslutningsvärden hämtas normalt från discovery:

| Inställning | Värde för exempelinstallationen |
| --- | --- |
| Transport och MCP-adress | Streamable HTTP, `https://forena.example/api/mcp` |
| OAuth-flöde | Authorization Code med PKCE `S256` |
| Scope | `mcp:read` |
| Resource | Exakt `https://forena.example/api/mcp`, utan avslutande snedstreck |
| Authorization server / issuer | `https://forena.example` |
| Authorization endpoint | `https://forena.example/oauth2/authorize` |
| Token endpoint | `https://forena.example/oauth2/token` |
| Registration endpoint | `https://forena.example/oauth2/register` |
| Token endpoint auth method | DCR: `client_secret_basic`, `client_secret_post` eller `none` enligt registreringen |

Förena erbjuder OAuth utan OpenID Connect. Lägg inte till `openid`, `profile`,
`email` eller `offline_access` som scopes. Om klienten har ett OIDC-val ska det
vara avstängt. `resource` måste skickas på både authorization- och tokenanrop.
Samma värden gäller andra MCP-klienter som stöder detta OAuth-flöde.

Access-token gäller i 15 minuter. En konfidentiell klient kan få roterande
refresh-token som gäller i åtta timmar. En publik klient saknar refresh-grant
och behöver ny auktorisering efter att access-token gått ut. ChatGPT:s faktiska
förnyelse behöver verifieras i anslutningsprovet för respektive klient.

### Alternativ: förregistrerad klient

Klienter utan DCR-stöd kan fortfarande registreras av administratören. Kopiera
exakt den callback-adress som klienten visar och sätt följande variabler för
Kotlin-backend innan den startas om:

| Variabel | Värde |
| --- | --- |
| `FORENA_OAUTH_CLIENT_ID` | Ett valt klient-id, högst 100 tecken utan blanksteg |
| `FORENA_OAUTH_CLIENT_REDIRECT` | Klientens exakta callback-adress |
| `FORENA_OAUTH_CLIENT_SECRET` | Slumpad hemlighet på 32–72 UTF-8-byte, eller tomt för en publik klient |

Förregistrerade klienter använder `client_secret_basic` med hemlighet, annars
`none`. Ange värdena i klientens avsedda OAuth-fält och lägg hemligheten i driftens
hemlighetshantering. Samma klient-id med ändrad callback eller hemlighet stoppar
uppstarten. Ett nytt klient-id skapar en ny registrering, men tar inte bort den
gamla eller dess grants. Tomma variabler återkallar inte befintliga anslutningar.
Variablerna behövs inte för DCR-klienter.

### Kontrollera discovery

Byt ut exempeladressen och kontrollera de publika dokumenten:

```sh
curl --fail --silent --show-error --max-time 10 \
  https://forena.example/.well-known/oauth-authorization-server
curl --fail --silent --show-error --max-time 10 \
  https://forena.example/.well-known/oauth-protected-resource/api/mcp
```

Förvänta JSON med rätt issuer respektive resource, inte en inloggningssida eller
frontend-HTML. Resource-dokumentet ska ange installationens origin som
`authorization_servers` och `mcp:read` i `scopes_supported`. Authorization-serverns
metadata ska ange `registration_endpoint` som `<origin>/oauth2/register`.
Anrop till `/api/mcp`
utan giltig token ska däremot få HTTP 401 med `WWW-Authenticate` och en
`resource_metadata`-adress. Även initialisering och verktygslistning kräver token.

Den äldre Next/Supabase-serverns `/connect` och `FORENA_MCP_OAUTH_*`-variabler
konfigurerar inte Kotlin-servern. Spring-konfigurationen beskrivs vidare i
[autentiseringsguiden](migration/authentication.md#oauth-och-mcp).

## Prova anslutningen

Använd en testmiljö med syntetiska uppgifter. Detta manuella prov är ännu
**inte genomfört** med ChatGPT eller Claude:

- Anslut med automatisk registrering utan manuella klientvariabler eller callback.
  Logga in och godkänn läsåtkomst. Kontrollera att klienten hittar de
  14 aktuella läsverktygen från [verktygslistan](mcp.md).
- Fråga ”Visa mina kommande aktiviteter” och ”Vilka lag kan jag läsa?”. Jämför
  resultaten med samma konto i Förena. Be därefter om kallelsesvar för en aktivitet
  där kontot har relevant behörighet.
- Prova ett andra konto utan den behörigheten och ett lag utanför kontots
  åtkomst. Kontrollera att skyddade uppgifter inte lämnas ut.
- Prova igen efter 15 minuter och kontrollera förnyelse eller ny inloggning.
- Koppla från i klienten och prova återanslutning. Verifiera separat att en token
  som återkallats via OAuth inte kan användas mot MCP. Utloggning från webbappen
  är inte en återkallning av alla MCP-anslutningar. Förena har ännu ingen
  användarmeny för att lista och återkalla OAuth-klienter.

Automatiska OAuth- och MCP-tester verifierar serverns flöden, men ersätter inte
detta prov med den faktiska klienten.

## Felsökning

| Problem | Kontrollera eller gör så här |
| --- | --- |
| Meny för egen MCP-server saknas | Kontrollera ChatGPT-plan och arbetsytans behörighet att skapa egna MCP-anslutningar. |
| Servern kan inte nås | Kontrollera publik HTTPS, routing och att discovery ger JSON. En webbinloggning som fungerar lokalt visar inte att ChatGPT når servern. |
| `invalid_client` eller fel returadress | Jämför klient-id, hemlighet, auth-metod och exakt callback med den registrerade klienten. |
| Registreringen misslyckas | Välj DCR, kontrollera att discovery annonserar `/oauth2/register` och att klienten begär enbart `mcp:read` och tillåtna grants/auth-metoder. CIMD stöds inte. |
| HTTP 429 vid registrering | Respektera `Retry-After`; samma klient ska återanvända sin registrering. |
| Fel scope eller resource | Använd bara `mcp:read` och exakt installationens `/api/mcp`-adress på båda OAuth-anropen. |
| Samtyckesförfrågan är ogiltig eller har gått ut | Starta anslutningen igen från ChatGPT. |
| HTTP 401 eller anslutningen upphör efter en stund | Anslut på nytt och kontrollera tokenförnyelsen och kontots status. Browsercookies och Supabase-token fungerar inte som Kotlin-MCP-token. |
| `Uppgifterna kunde inte hämtas.` | Kontrollera aktuell Förena-behörighet och begärt lag eller aktivitet. Detta kan vara ett verktygsfel även om HTTP-svaret är 200. |
| Verktygslista eller argument verkar inaktuella | Uppdatera anslutningens verktygsdefinitioner i ChatGPT och jämför med serverns aktuella katalog. |
| Svaret visar bara en del av uppgifterna | Kontrollera `truncated`; för paginerad laglistning ska klienten följa `nextOffset` tills det är `null`. |
