# Förena Kotlin/Spring Boot

Backend för den separata React/Vite-appen. Spring Security äger autentisering,
Spring Authorization Server äger OAuth och Spring Session JDBC lagrar
webbsessioner. Spring AI hanterar MCP-protokollet genom en stateless
WebMVC-server på `/api/mcp`, med läsverktyg registrerade genom `@Tool`.
`SharedActivityTools` och `AssistantReadTools` ger samma 14 läsverktyg till MCP
och assistentens lokala callbacks genom `AssistantToolCatalog`. Dokument,
medlemsuppdrag, kallelsesvar, närvaro och historik använder samma aktuella
domänbehörigheter i båda ingångarna. Samtal, minnen och skrivkommandon ingår
inte i MCP-katalogen. MCP-servern behöver ingen AI-modell eller modellleverantör.
PostgreSQL kan köras lokalt eller hos Supabase. Den äldre Next-appen behåller
sin befintliga autentisering, implementation och separata deployment.

Se [Anslut ChatGPT eller Claude till Förena](../docs/mcp-chatgpt.md) för
anslutningssteg, automatisk klientregistrering och manuellt anslutningsprov.

## Lokal utveckling

Java 25 och Docker Compose v2 krävs. Från `backend/`:

```sh
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```

Spring startar PostgreSQL från `compose.yaml`, bootstrappar separata owner- och
runtime-roller och kör Liquibase före HTTP-start på `127.0.0.1:8080`.
Profilen behöver ingen `.env`, extern auth-provider eller mejlnyckel.
Loggsändaren visar `[LOCAL MAIL]` med engångslänkar; använd påhittade konton.
Resend-adaptern registreras inte i local-profilen.

Från reporoten körs `npm ci`. Starta sedan frontend i en annan terminal:

```sh
cd frontend
npm run dev
```

Öppna exakt `http://localhost:3000`. Vite skapar publik config automatiskt och
proxar `/api/*`, `/oauth2/*` och OAuth-metadata till 8080. Backend kräver samma
Origin samt `X-Forena-Request: 1` vid API-skrivningar. Använd inte en annan host
eller port för det ordinarie local-flödet. IDE kan starta `ForenaApplicationKt`
med aktiv Spring-profil `local` och arbetskatalog `backend/`.

### Privata lokala inställningar och IntelliJ

Gemensamma utvecklingsförval ligger i `src/main/resources/application-local.yaml`.
För egna värden och hemligheter kan du, från `backend/`, skapa en privat fil:

```sh
cp .env.local.example .env.local
```

Profilen `local` importerar automatiskt `.env.local` från arbetskatalogen med
Spring Boots `spring.config.import`. Filen är valfri och ignoreras av Git.
Den ligger utanför `src/main/resources` och följer inte med i applikationens jar.
Ingen extra dotenv-integration behövs.

Skriv en inställning per rad som `NYCKEL=värde`, utan `export` eller omgivande
citattecken. Formatet är Java properties, inte ett shellskript. Mallen innehåller
bland annat första systemadministratör, AI Gateway och en separat Telegram-testbot.
För vanliga Spring-inställningar används propertynamnet, exempelvis
`server.port=8081`. Värden i filen överstyr profilens förval; riktiga
miljövariabler och kommandoradsargument har högre prioritet.

I IntelliJ, skapa en Spring Boot-konfiguration med:

- **Main class:** `se.forena.api.ForenaApplicationKt`.
- **JRE:** Java 25 och backendmodulens classpath.
- **Active profiles:** `local` (eller programargumentet `--spring.profiles.active=local`).
- **Working directory:** repots `backend/`-katalog.

Inga hemligheter behöver läggas i IntelliJ-konfigurationen. Starta om backend
efter att filen ändrats. Importen gäller bara `local`-profilen. Telegrams
separata Node-konfigurationsskript läser inte Spring-filen; dess variabler
behöver tillföras separat när webhooken registreras.

Registrera ett nytt konto, öppna den loggade verifieringslänken i samma
browserprofil och bekräfta länken. Därefter fungerar lösenord, passkeys och
magic links. Återställningslänkar loggas på samma sätt. Nya konton saknar
verksamhetsrelationer tills dessa provisioneras uttryckligen.

Compose-volymen bevarar data mellan starter. För att uttryckligen radera bara
den lokala utvecklingsdatabasen: stoppa backend och kör `docker compose down -v`
i `backend/`. Kör aldrig databasåterställning mot en extern databas.

## Första systemadministratören och verksamhetsstrukturen

Sätt `FORENA_INITIAL_SYSTEM_ADMIN_EMAIL` till det avsedda första kontots adress.
Registrera och verifiera kontot, logga in och öppna `/administration`. Bekräfta
**Aktivera systemadministration**. Bootstrap kan endast användas en gång och
endast av det verifierade, konfigurerade kontot; därefter kan variabeln tas bort.

Skapa klubb med första sektion, tilldela klubbadmin, skapa lag och tilldela
lagadmin. Systemrollen ger ingen automatisk verksamhetsbehörighet. Det egna
kontot kan tilldelas klubbrollen uttryckligen. Administratörer tilldelas i denna
version till befintliga verifierade konton; inga mejlinbjudningar skickas.

Lagadmin skapar/redigerar/ställer in aktiviteter via `/activities/manage`.
Kallelseval och schemaposter sparas. M06/M10:s schemalagda bearbetning och
e-postkedja kan aktiveras för uttryckliga testmottagare; den är avstängd som standard.
Se [hela kedjan, behörigheter och verifiering](../docs/migration/activity-management.md).
Se även [kallelseleveransens körguide](../docs/migration/invitation-delivery.md).

## Arkitektur och säkerhet

Se [autentisering](../docs/migration/authentication.md),
[Spring-komponenter](../docs/migration/spring-security.md),
[säkerhetsarkitektur](../docs/security-architecture.md) och
[arkitektur](../docs/architecture.md).

Controllers använder typade DTO:er. Tjänster äger transaktioner och kontrollerar
konto, session, personåtkomst och verksamhetsregler även efter väntan på radlås.
Det finns ingen affärslogik i databasfunktioner, triggers eller RLS i `forena`.
Runtime saknar DDL, owner-medlemskap och åtkomst till Liquibase-metadata.

Lösenord, WebAuthn, engångstoken och logout använder Springs filter/providers.
Webbsessionen innehåller endast strängar; ingen Java-deserialisering tillåts.
Cookie-ID är krypterat, HttpOnly, SameSite=Lax och Secure utanför loopback.
Browserbindning, engångskonsumtion, kontospärr, generation vid lösenordsreset,
revokering och gemensam databasbaserad anropsbegränsning bevaras.
API-kontobindning hindrar gamla flikar från att skriva under ett annat konto.
MCP accepterar endast opaka OAuth-token, aldrig browsercookies; verksamhets-API:t
accepterar aldrig MCP-token. OAuth kräver registrerad redirect, exakt resource,
PKCE och consent. Fjärr-HTTPS-redirect matchas exakt; Springs portundantag för
loopback-IP gäller för lokala klienter med HTTP/HTTPS.
Access-token gäller i 15 minuter. Både publika PKCE-klienter med `none` och
klienter med hemlighet kan använda refresh-grant. Varje lyckad förnyelse ger en
ny refresh-token som gäller i 24 timmar; återanvändning av en konsumerad token
återkallar hela OAuth-granten. Klienten måste spara den senaste tokenen och
samordna samtidiga förnyelser. Befintliga MCP-anslutningar som saknar
refresh-token behöver auktoriseras igen efter uppdateringen, med samma klient-id.

`EmailSender` är leverantörsoberoende. `email.internal` innehåller Resends
Spring HTTP Service Client, registrerad med `@ImportHttpServices`;
`identity.authentication` äger mallar och krypterad outbox. Local använder logg.

## Egen databas och runtime-inställningar

Bootstrap för en ny, uttryckligen avsedd databas finns i `scripts/bootstrap.sql`.
Använd separata `FORENA_MIGRATION_USERNAME`/`FORENA_MIGRATION_PASSWORD` och
`FORENA_DB_USERNAME`/`FORENA_DB_PASSWORD`. `FORENA_JDBC_URL` pekar på databasen;
extern TLS ska använda `sslmode=verify-full` och betrodd CA.
`FORENA_DB_CA_CERTIFICATE` kan tillföra databascertifikatet. Supabase-CA:n
ligger kvar i `certs/supabase-ca.crt`.

Ordinarie start kör Liquibase som owner före HTTP och verifierar runtime-grants.
`FORENA_MIGRATE=false` stänger av migrering när schemat redan har provisionerats.
`FORENA_MIGRATE_ONLY=true java -jar target/forena-api.jar` migrerar utan HTTP,
auth- eller mejlcredentials. `FORENA_VERIFY_DATABASE_ACCESS=true` verifierar
runtime-grants utan HTTP eller migration. Använd endast en av dessa engångsåtgärder.

Ordinarie webbstart kräver `SITE_URL` (eller `FORENA_WEB_ORIGIN` som överstyrning),
en separat base64-kodad 32-byte-nyckel i `FORENA_WEB_SESSION_KEY`, `RESEND_API_KEY` och
`RESEND_FROM_EMAIL`. Inga auth-lägen väljs. Valfritt RP-ID sätts med
`FORENA_PASSKEY_RP_ID`; standard är originens host. OAuth-discovery annonserar
dynamisk klientregistrering på `POST /oauth2/register`, så kompatibla MCP-klienter
behöver ingen manuell callback-konfiguration. Förregistrerade klienter kan även
provisioneras med `FORENA_OAUTH_CLIENT_ID`, `FORENA_OAUTH_CLIENT_REDIRECT` och
valfri `FORENA_OAUTH_CLIENT_SECRET`. Se [körguiden](../docs/migration/authentication.md).

Inga konton importeras automatiskt och e-postlikhet kopplar inga identiteter.
Liquibase-historik och historiska databasnamn bevaras.

## OpenAPI och Swagger UI

Öppna `/api/swagger-ui.html` på webbappens origin
(lokalt `http://localhost:3000/api/swagger-ui.html`). Springdoc serverar UI och
alla dess resurser under `/api/swagger-ui/`; både Vite och produktionsproxyn
kan därför använda sin befintliga `/api`-routing.

Specifikationen finns på `/api/v3/api-docs` (JSON) och `/api/v3/api-docs.yaml`.
UI-konfigurationen finns på `/api/v3/api-docs/swagger-config`. Dokumentationen är
publik och kan läsas utan inloggning. Verksamhets-API:ts behörighetskrav gäller
fortsatt. `/v3/api-docs` används inte längre. `v3` är en sökvägskonvention för OpenAPI, inte verksamhets-API:ts version.

Swagger UI använder browserns sessionscookie för anrop på samma origin.
Skrivningar kräver fortsatt korrekt Origin samt `X-Forena-Request: 1` och
`X-Forena-Account` enligt API:ts transportregler. UI:t tillför inte dessa headers
automatiskt. Extern validator och Swagger Petstore-exempel är avstängda.

`./mvnw verify` exporterar specen till `target/openapi.json`.
`contract/` innehåller den versionshanterade exporten och genererade TypeScript-typer.

Springdoc 3.1.1 läser Spring-konverterarnas interna register via reflection.
Native-bygget registrerar därför fältet `GenericConversionService$Converters.converters`
samt Kotlin-reflections dynamiskt laddade `EnumEntriesKt.enumEntries(Enum[])`
i `src/main/resources/META-INF/native-image/se.forena/openapi/reachability-metadata.json`,
tillsammans med Springdocs sorterings-/typmixins och Jacksons `JsonParser.NumberType`.
Autentiseringsfiltrens typade dokumentationsmodeller registreras genom Springs
`BindingReflectionHintsRegistrar`, eftersom de saknar MVC-handlers.
`ApiDocumentation` registrerar dessutom de nyare Swagger-schemaklasser som
saknas i springdoc-versionens egna native-hints.
`local-smoke.py` jämför hela den publika specen med kontraktet i JVM-, AOT- och
native-körning och hämtar även UI-resurser och YAML. Deployflödet jämför specen
på den förberedda Vercel-deploymenten före publicering.

## Verifiering

```sh
./mvnw verify
python3 scripts/local-smoke.py
cd contract && npm ci && npm run check
```

`ApiTest` använder riktiga lokala konton för verksamhetens HTTP-/behörighetstester.
`AuthTest` täcker registrering, verifiering, lösenord, browserbindning, reset,
sessionsskydd, OAuth, MCP, spärr och återkallning. Mejltransporten fångas lokalt.
OpenAPI exporteras från den riktiga servern och TypeScript genereras i `contract/`.

Browserprovet och de separata JVM/AOT/GraalVM-proven beskrivs i
[auth-guiden](../docs/migration/authentication.md#bygg--och-testgränser).
`-Pnative` och native-image betyder GraalVM. Tidigare Supabase-auth-prov
verifierar inte denna kod; aktuell status redovisas i PR och migreringsstatus.
