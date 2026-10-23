# Autentisering i React/Kotlin-appen

Spring Boot äger konton, lösenord, passkeys, mejllänkar, webbsessioner och OAuth.
Detta är den nya appens enda ordinarie autentisering och kräver inget lägesval.
Supabase får fortsatt vara PostgreSQL-leverantör. Den äldre Next-appen har
separat Supabase Auth och är inte omkopplad.

Efter ADR-025 använder inloggning, WebAuthn och logout Springs färdiga filter
och providers. Egna controllers för dessa flöden är borttagna. Smala
sessionsadaptrar bevarar säker lagring; React/Vite följer nu Springs standardformat
för formulär och WebAuthn. Borttagning av passkey returnerar 204. Se [Spring-genomgången](spring-security.md).

## Ansvar och flöden

Spring Security står för lösenordskodning (delegating encoder med BCrypt),
WebAuthn-verifiering genom `Webauthn4JRelyingPartyOperations`, JDBC-lagrade
engångstoken och OAuth Authorization Server. Spring-filter sköter inloggningsflödena; egna controllers hanterar
kontoregistrering, verifiering och återställning.
Ingen egen verifiering av signaturer, attestation eller OAuth-koder införs.

Webben använder enbart Spring Session JDBC. Ett konto-ID och en sessionsversion
lagras som strängattribut; lösenord, leverantörstoken och serialiserade
SecurityContext-objekt lagras inte i webbsessionen. Varje anrop laddar aktuell
lokal kontostatus. Absolut livstid, inaktivitet, krypterat cookie-ID och
HttpOnly/Secure/SameSite=Lax följer tidigare sessionskonfiguration.

- `/register`: nytt lokalt konto, verifiering via mejl före första inloggning.
  Verifieringslänken binds till samma browserprofil som registreringen.
  Upprepad registrering av ett obekräftat konto ersätter det föreslagna lösenordet
  och gör äldre verifieringslänkar ogiltiga. Befintliga bekräftade konton ändras inte.
- `/login`: lösenord, passkey eller engångslänk. Magic link kräver samma
  browserprofil och en uttrycklig POST-bekräftelse på `/auth/callback`.
- `/password/forgot` och `/auth/reset`: återställning via tidsbegränsad länk.
  Nytt lösenord ökar kontots sessionsversion och avslutar tidigare webb- och
  OAuth-åtkomst. Även övriga gamla engångslänkar blir ogiltiga. Samtidiga
  återställningar använder villkorad uppdatering av sessionsversionen.
- `/account/security`: registrera, lista och ta bort egna passkeys.
  User verification krävs vid både registrering och inloggning.
- `/oauth/consent`: samma inloggade konto godkänner en MCP-klients läsåtkomst.

Registrering och länkbegäran lämnar neutrala bekräftelser. API-skrivningar kräver
kanonisk Origin och `X-Forena-Request: 1`. Befintliga klient-/e-post-/globalbudgetar
begränsar publika inloggningsförsök och OAuth-token-/introspektions-/revokeringsanrop. OAuth-consent använder dessutom Spring CSRF.
Även GET/POST `/oauth2/authorize` begränsas före sessionsladdning och CSRF,
så att cookie-lösa anrop inte kan skapa obegränsat med JDBC-sessioner.
Authorization-anrop har en separat klientbudget men delar den globala budgeten
med övrig autentisering. Gränserna lagras i PostgreSQL och gäller över flera
instanser och omstarter; en begränsning enbart i minnet skulle kunna kringgås.
Avvisade anrop ger 429 med `Retry-After` utan att skapa session; ett fel i
begränsningens databasanslutning ger 503. En godtycklig cookie ger inget undantag.
Kontroller för personåtkomst och föreningsroller ligger oförändrat i Kotlin.
Nya konton får inga sådana relationer automatiskt.

## OAuth och MCP

Authorization Server körs i samma backend. Klienter, godkännanden och grants
lagras med Spring Securitys JDBC-repositories. Appen använder opaka
access-token med 15 minuters livstid. Token verifieras lokalt mot aktuell grant,
konto och sessionsversion; separat signeringsnyckel eller JWKS behövs inte.
Token lagras som känsliga credentials i de privata frameworktabellerna.

En klient provisioneras uttryckligen från konfiguration. Exakt redirect-URI,
PKCE och användarens godkännande krävs. Ingen öppen dynamisk klientregistrering
aktiveras. En konfidentiell klient har en slumpad klienthemlighet på 32–72 byte och kan använda roterande refresh-token;
en publik klient autentiserar utan klienthemlighet och behöver ny auktorisering
när access-token går ut. Webbinloggningen kan då återanvändas.

Resursen är exakt `${FORENA_WEB_ORIGIN}/api/mcp`, scope `mcp:read`.
Klienten skickar `resource` på både authorization- och tokenanrop.
Spring sköter kodutbyte, introspektion och återkallning. Webb-API:t accepterar
inte MCP-token, och MCP accepterar inte browsercookies som autentisering.

Metadata finns på `/.well-known/oauth-authorization-server` och
`/.well-known/oauth-protected-resource/api/mcp`. MCP-endpointen erbjuder ett
avgränsat read-only-verktyg, `list_my_activities`, med högst 50 aktiviteter
utan kontaktuppgifter, personnamn eller svarskommentarer. Det är ett separat
MCP-prov, inte full flytt av gamla Next-serverns verktyg. Vercels routing måste
skicka `/oauth2/*` och metadata till backend; `/oauth/consent` går till SPA:n.

## Lokal konfiguration

För lokal JVM-utveckling finns Spring-profilen `local` med färdiga värden:

```sh
cd backend
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```

Java 25 och Docker Compose v2 krävs. Spring startar en separat PostgreSQL-container,
kör Liquibase och använder autentisering utan `.env`, Supabase Auth eller Resend.
Mejlen skrivs till backendloggen med `[LOCAL MAIL]`, inklusive engångslänkar;
använd bara påhittade konton. `local` registrerar aldrig Resend-adaptern.
Profilens publika sessionsnyckel och lösenord gäller bara lokal utveckling.
Databasen är tom från början och bevaras i Compose-volymen mellan starter.
Se [backendens körinstruktioner](../../backend/README.md#lokal-utveckling)
för React-start, portar, IDE och återställning av lokala data.

### Egen databas och riktiga mejl utan local-profil

Använd en avsedd testdatabas. Befintlig Liquibase-bootstrap och separata
owner-/runtime-konton gäller. Migration 012 skapar lokala konton och Spring
Securitys tabeller i privata `forena`. Ingen koppling till `auth.users` behövs.

Backend behöver följande utöver ordinarie JDBC-/migrationskonfiguration:

```dotenv
FORENA_WEB_SESSION_ENABLED=true
FORENA_WEB_ORIGIN=http://localhost:3000
FORENA_WEB_SESSION_SECURE=false
# Sätt en base64-kodad 32-byte-nyckel i hemlighetshanteringen:
FORENA_WEB_SESSION_KEY=
FORENA_PASSKEY_RP_ID=localhost
# Resend-nyckel och verifierad avsändare, endast i backendens hemlighetshantering:
RESEND_API_KEY=
RESEND_FROM_EMAIL=Förena <auth@example.test>
# Valfritt OAuth-prov; välj en exakt redirect för den egna testklienten:
FORENA_OAUTH_CLIENT_ID=
FORENA_OAUTH_CLIENT_REDIRECT=
FORENA_OAUTH_CLIENT_SECRET=
```

Backend skickar via Resends REST-API på `https://api.resend.com/emails`.
SMTP används inte längre och `FORENA_SMTP_*`/`FORENA_AUTH_MAIL_FROM` ska ersättas
med variablerna ovan. Start utan `local` kräver Resend-nyckel och avsändare. Använd en verifierad avsändardomän,
SPF/DKIM/DMARC och avstängd klickspårning för auth-mejlen. Sätt inte riktiga
nycklar i exempel, frontend eller tester. Testerna fångar transporten lokalt utan
att skicka riktiga mejl.

Frontend startas med `cd frontend && npm run dev` och byggs med
`npm run build` i samma katalog. Båda skapar publik konfiguration automatiskt:
versions-ID och valfritt provaktivitets-ID, inga credentials. Vite använder
`http://localhost:3000` och proxar API/OAuth till backend på 8080. Origin och
RP-ID kontrolleras strikt av backend; använd exakt localhost, inte en annan host.

## Mejl och driftgränser

Verifiering, magic link och lösenordsåterställning använder separata texter i
samma utskickstjänst. Engångslänkar gäller i tio minuter. En beständig outbox
skrivs i samma transaktion som token; länken är krypterad med runtime-nyckeln.
En schemalagd worker tar radlås med SKIP LOCKED och försöker högst fem gånger.
Nätverksfel, 408, 429, 5xx och samtidiga idempotenta anrop får återförsök med
exponentiell väntan, minst det numeriska `Retry-After` som Resend anger.
Övriga permanenta HTTP-fel stoppar utskicket och raderar länken. Även lyckad
API-accept och utgången giltighet raderar länken. `delivered_at` betyder att
leverantören har accepterat utskicket, inte bevisad inkorgsleverans.

All Resend-specifik Kotlin-kod ligger i `email.internal`: konfiguration,
autentisering, HTTPS-anrop, timeout och översättning av leverantörssvar.
Modulens publika gräns är `EmailSender`, `EmailMessage` och `EmailDeliveryResult`;
`identity.authentication` äger fortsatt auth-mallar och den krypterade outboxen.
Modulith verifierar modulgränsen. Ingen ny Gradle-/Maven-submodul behövs.

Varje outboxrad använder samma `native-auth/<outbox-uuid>` (befintlig beständig idempotensnyckel) som idempotensnyckel
vid alla försök, även efter omstart. Resends 24-timmarsfönster överstiger
länkens tio minuters livstid och minskar risken för dubbletter när ett accepterat
anrop följs av timeout eller processkrasch. Det är ingen generell exactly-once-
garanti. Avsändare och mall ska hållas stabila medan kön töms, eftersom ändrad
payload för samma nyckel avvisas av Resend. Providerkroppar, API-nycklar,
transportundantag och engångslänkar loggas inte utanför `local`. Den lokala
loggadaptern markerar utskicket accepterat så att samma outboxflöde kan provas.
Webhooks för faktisk leverans,
studs och klagomål ingår ännu inte i appen.

API-kontrakt: [Skicka mejl](https://resend.com/docs/api-reference/emails/send-email),
[idempotens](https://resend.com/docs/dashboard/emails/idempotency-keys) och
[felkoder](https://resend.com/docs/api-reference/errors).

Workern kör bara när backendprocessen kör. Drift med skalning till noll behöver
ett verifierat sätt att hålla workern aktiv eller väcka/köra den. Mejlleverans,
SPF/DKIM/DMARC och faktisk plattformsrouting måste provas före driftaktivering.

Befintliga Supabase-konton och lösenord importeras inte. E-postlikhet ger ingen
identitetskoppling. Flytt av konton kräver separat identifierad och testad migrering
med bevarade verksamhetskopplingar. Administration för kontospärr/borttagning,
e-postbyte, säkerhetsnotiser, fler OAuth-klienter och full MCP-funktionsparitet
behöver färdigställas före en full produktionsersättning. Lokala spärrar genom
`account.enabled` verkställs redan för både webb och MCP.

## Bygg- och testgränser

`AuthTest` använder riktig HTTP, Spring Security, Authorization Server och lokal
PostgreSQL. `ApiTest` loggar in riktiga lokala konton och verifierar verksamhetens
behörigheter, transaktioner och återkallning. Mejltransporten fångas i testprocessen.
Resend REST, Retry-After, idempotens och permanenta fel provas separat.

Ett enda OpenAPI-kontrakt exporteras till `backend/target/openapi.json` och
`backend/contract/openapi.json`; TypeScript genereras från detta.

Kör det riktiga browserprovet med Vite preview på port 3002:

```sh
npm run frontend:build
npm run preview --workspace @forena/frontend -- --port 3002
# I en annan terminal:
FORENA_AUTH_BROWSER_TEST=true backend/mvnw -f backend/pom.xml -Dtest=AuthTest test
```

Chromium väljs med `FORENA_BROWSER_EXECUTABLE`, annars Playwrights installerade
Chromium. Provet använder virtuella WebAuthn-credentials, verklig Spring-verifiering,
browserbundna mejllänkar och OAuth/PKCE/consent/refresh/MCP/revokering. Testbryggan
finns bara i testprocessen. Inga riktiga mejl eller produktionskonton används.

`backend/scripts/local-smoke.py` kör samma verkliga auth-livscykel på paketerad
JVM-JAR, med `--aot-runtime`, `--runtime-executable` eller `--runtime-image`.
Provet behåller kontroll av migrationer före HTTP, separata owner-/runtime-roller,
begränsade grants, återkallning, sessionscookie, anropsbegränsning och logout.
CI kräver även GraalVM-buildpack och prov av den resulterande containern.
Ett äldre Supabase-bygge får inte återanvändas: byggfingeravtryck och verifiering
för aktuell commit måste stämma innan releaseverktygen godtar en image.

`native` i Mavenprofilen `-Pnative`, AOT och native-image betecknar GraalVM,
inte ett auth-läge. Liquibase-historiken, tabellen `native_user` och mejlköns
idempotensprefix bevaras; namnbyte i databasen skulle kräva en separat migration.
Aktuell verifiering och begränsningar redovisas i [status](status.md).
Ingen produktionsaktivering eller kontomigrering ingår.


### GraalVM-reflection för autentisering

Spring Securitys WebAuthn-filter använder egna Jackson-mappers. AOT hittar inte
alla deras reflektiva modell-/builderanrop via MVC. Den avgränsade metadatan i
`backend/src/main/resources/META-INF/native-image/se.forena/authentication/`
kommer från en verklig browserkörning med GraalVM-agenten. Den kompletterar
Springs befintliga hints; varken verifiering, behörighet eller Jacksons typgränser
ändras. Alla tre stödda COSE-nyckelfamiljer (EC2, RSA, EdDSA) bevaras även om en
virtuell authenticator bara väljer en av dem.

Vid uppgradering av Spring/WebAuthn: bygg JVM-JAR och frontend, välj GraalVM i
JAVA_HOME, kör `local-smoke.py --browser --trace-native-metadata <lokal katalog>`
och filtrera agentresultatet med
`python3 backend/scripts/auth-native-metadata.py <katalog>/reachability-metadata.json`.
Granska diffen och bygg/prova sedan den faktiska binären eller containern med
`local-smoke.py --runtime-executable <binär> --browser` respektive
`--runtime-image <image> --browser`. Metadatafilens existens ersätter inte provet.

JDBC-grants innehåller även Springs godkända samlingsimplementationer som typ-ID:n.
Deras klassnamn bevaras för native-image; Jacksons befintliga typvalidering och
allowlist ändras inte. Detta behövs även när samma klasser redan är kompilerade
för vanliga metodanrop. Browserprovet kräver både kodutbyte, refresh och revokering.
