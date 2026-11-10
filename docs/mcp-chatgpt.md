# Anslut ChatGPT till Förena

Guiden gäller Förenas **Kotlin/Spring-server**. ChatGPT ansluter via MCP och
hämtar uppgifter med det Förena-konto som användaren loggar in med. Förena
behöver ingen OpenAI-nyckel eller egen AI-modell för anslutningen.

Instruktionerna är kontrollerade mot koden och OpenAI:s dokumentation
2026-11-10. En verklig ChatGPT-anslutning har ännu inte provkörts. Genomför
[anslutningsprovet](#prova-anslutningen) i avsedd testmiljö innan anslutningen
används med medlemsdata.

## Vad får ChatGPT tillgång till?

Servern erbjuder 14 läsverktyg för bland annat aktiviteter, lag, kallelsesvar,
närvaro och dokument. Även svarskommentarer och medlemsuppdrag kan ingå när
kontot har behörighet. Varje anrop kontrollerar kontots aktuella åtkomst i
Förena. Godkännandet ger inga ytterligare verksamhetsbehörigheter.

Verktygen kan bara läsa. De kan inte skapa aktiviteter, svara på kallelser eller
ändra medlemmar. Förenas assistentsamtal och assistentminnen exporteras inte.
Uppgifter som hämtas lämnas till ChatGPT för att besvara frågan. Fullständig
verktygslista och resultatgränser finns i [MCP-dokumentationen](mcp.md).

## Anslut i ChatGPT

Du behöver ett Förena-konto, installationens publika MCP-adress och ett
ChatGPT-konto eller en arbetsyta som tillåter egna MCP-anslutningar. En
administratör behöver först registrera OAuth-klienten enligt nästa avsnitt.
Om Förena redan är tillgängligt som en godkänd plugin i arbetsytan kan du
installera den och gå direkt till inloggningen.

1. Öppna ChatGPT i webbläsaren och välj rätt arbetsyta. Gå till **Plugins**,
   välj **+ → Add custom MCP server** och ange namnet **Förena**.
2. Ange installationens adress under **Connection**, exempelvis
   `https://forena.example/api/mcp`. Byt exempeladressen mot er riktiga adress.
3. Välj **OAuth** och en manuellt registrerad klient. Valet kan heta
   **Advanced OAuth settings → User-Defined OAuth Client**. Kopiera den
   **Callback URL** som ChatGPT visar och lämna den till Förena-administratören.
   Returadressen ska kopieras exakt.
4. Fyll i administratörens klient-id och eventuell klienthemlighet. Med
   hemlighet ska **Token endpoint auth method** vara `client_secret_basic`.
   Utan hemlighet är metoden `none`. Se konfigurationstabellen nedan.
5. Granska ChatGPT:s varning och välj **Create as a plugin**. När
   inloggningen öppnas: logga in på Förena, granska samtycket och välj
   **Godkänn läsåtkomst**. Granska sedan verktygslistan och installera pluginen.
6. Starta en ny konversation, skriv **@** och välj **Förena**. Prova till
   exempel: ”Visa mina kommande aktiviteter i Förena.”

Menytexter kan skilja sig mellan konton. I den äldre appvyn används
**Settings → Apps → Create**, följt av **Scan Tools** och **Create**.
OpenAI beskriver aktuell navigation och åtkomstkrav i
[sin anslutningsguide](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt).
Fältnamnen för egen OAuth-klient beskrivs även i
[OpenAI:s Snowflake-exempel](https://help.openai.com/en/articles/20001249-set-up-the-snowflake-app-template-in-chatgpt).
Exemplet används här för fältnamnen; ingen Snowflake-konfiguration behövs.

Om valet för en egen OAuth-klient saknas behöver arbetsytans administratör
kontrollera vilka anslutningar kontot tillåter. Förena stöder i dag förregistrerade
klienter; automatisk klientregistrering via DCR eller CIMD är inte implementerad.

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

### Registrera klienten

Kopiera callback-adressen från den anslutning som skapas i ChatGPT innan du
konfigurerar klienten. Använd ingen gissad eller generisk ChatGPT-returadress;
OpenAI kan visa olika adresser för olika anslutningar. Se
[OpenAI:s OAuth-kontrakt](https://developers.openai.com/plugins/build/auth).

Sätt följande variabler för Kotlin-backend och starta om den:

| Variabel | Värde |
| --- | --- |
| `FORENA_WEB_ORIGIN` | Installationens publika origin, exempelvis `https://forena.example` |
| `FORENA_OAUTH_CLIENT_ID` | Ett valt klient-id, högst 100 tecken utan blanksteg, exempelvis `chatgpt-forena-test` |
| `FORENA_OAUTH_CLIENT_REDIRECT` | Exakt **Callback URL** från ChatGPT |
| `FORENA_OAUTH_CLIENT_SECRET` | Slumpad hemlighet på 32–72 UTF-8-byte för en konfidentiell klient, eller tomt för en publik klient |

Lägg klienthemligheten i driftens hemlighetshantering och ChatGPT:s avsedda
OAuth-fält. Den är inte användarens Förena-lösenord. Konfigurationen provisionerar
en klient vid uppstart; den ändrar inte en redan registrerad klients returadress
eller hemlighet. Samma klient-id med ändrade värden stoppar uppstarten. Ett nytt
klient-id skapar en ny registrering, men tar inte bort den gamla eller dess grants.
Att tömma variablerna återkallar heller inte befintliga anslutningar.

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
| Token endpoint auth method | `client_secret_basic` med hemlighet, annars `none` |

Förena erbjuder OAuth utan OpenID Connect. Lägg inte till `openid`, `profile`,
`email` eller `offline_access` som scopes. Om klienten har ett OIDC-val ska det
vara avstängt. `resource` måste skickas på både authorization- och tokenanrop.
Samma värden gäller andra MCP-klienter som stöder detta OAuth-flöde.

Access-token gäller i 15 minuter. En konfidentiell klient kan få roterande
refresh-token som gäller i åtta timmar. En publik klient saknar refresh-grant
och behöver ny auktorisering efter att access-token gått ut. ChatGPT:s faktiska
förnyelse behöver verifieras i anslutningsprovet. Publik klient kan bara väljas
om ChatGPT:s aktuella formulär tillåter `none` utan klienthemlighet.

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
`authorization_servers` och `mcp:read` i `scopes_supported`. Anrop till `/api/mcp`
utan giltig token ska däremot få HTTP 401 med `WWW-Authenticate` och en
`resource_metadata`-adress. Även initialisering och verktygslistning kräver token.

Den äldre Next/Supabase-serverns `/connect` och `FORENA_MCP_OAUTH_*`-variabler
konfigurerar inte Kotlin-servern. Spring-konfigurationen beskrivs vidare i
[autentiseringsguiden](migration/authentication.md#oauth-och-mcp).

## Prova anslutningen

Använd en testmiljö med syntetiska uppgifter. Detta manuella prov är ännu
**inte genomfört** med ChatGPT:

- Anslut, logga in och godkänn läsåtkomst. Kontrollera att ChatGPT hittar de
  14 aktuella läsverktygen från [verktygslistan](mcp.md).
- Fråga ”Visa mina kommande aktiviteter” och ”Vilka lag kan jag läsa?”. Jämför
  resultaten med samma konto i Förena. Be därefter om kallelsesvar för en aktivitet
  där kontot har relevant behörighet.
- Prova ett andra konto utan den behörigheten och ett lag utanför kontots
  åtkomst. Kontrollera att skyddade uppgifter inte lämnas ut.
- Prova igen efter 15 minuter och kontrollera förnyelse eller ny inloggning.
- Koppla från i ChatGPT och prova återanslutning. Verifiera separat att en token
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
| Fel scope eller resource | Använd bara `mcp:read` och exakt installationens `/api/mcp`-adress på båda OAuth-anropen. |
| Samtyckesförfrågan är ogiltig eller har gått ut | Starta anslutningen igen från ChatGPT. |
| HTTP 401 eller anslutningen upphör efter en stund | Anslut på nytt och kontrollera tokenförnyelsen och kontots status. Browsercookies och Supabase-token fungerar inte som Kotlin-MCP-token. |
| `Uppgifterna kunde inte hämtas.` | Kontrollera aktuell Förena-behörighet och begärt lag eller aktivitet. Detta kan vara ett verktygsfel även om HTTP-svaret är 200. |
| Verktygslista eller argument verkar inaktuella | Uppdatera anslutningens verktygsdefinitioner i ChatGPT och jämför med serverns aktuella katalog. |
| Svaret visar bara en del av uppgifterna | Kontrollera `truncated`; för paginerad laglistning ska klienten följa `nextOffset` tills det är `null`. |
