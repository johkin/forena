# Förena Kotlin/Spring Boot

Backend för den separata React/Vite-appen. Spring Security äger autentisering,
Spring Authorization Server äger OAuth/MCP och Spring Session JDBC lagrar
webbsessioner. PostgreSQL kan köras lokalt eller hos Supabase. Den äldre
Next-appen behåller sin befintliga autentisering och separata deployment.

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
accepterar aldrig MCP-token. OAuth kräver exakt redirect, resource, PKCE och consent.

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

Ordinarie webbstart kräver `FORENA_WEB_ORIGIN`, en separat base64-kodad
32-byte-nyckel i `FORENA_WEB_SESSION_KEY`, `RESEND_API_KEY` och
`RESEND_FROM_EMAIL`. Inga auth-lägen väljs. Valfritt RP-ID sätts med
`FORENA_PASSKEY_RP_ID`; standard är originens host. OAuth-klient provisioneras
med `FORENA_OAUTH_CLIENT_ID`, `FORENA_OAUTH_CLIENT_REDIRECT` och valfri
`FORENA_OAUTH_CLIENT_SECRET`. Se [körguiden](../docs/migration/authentication.md).

Inga konton importeras automatiskt och e-postlikhet kopplar inga identiteter.
Liquibase-historik och historiska databasnamn bevaras.

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
