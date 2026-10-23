# Kotlin-backend

Det finns även ett explicit `FORENA_AUTH_MODE=native` för egen kontohantering,
Spring WebAuthn och Authorization Server. Det kräver ingen Supabase Auth-issuer
eller publishable key. [Körinstruktioner och säkerhetsgränser](../docs/migration/native-auth.md).

Repots enda Spring Boot/Kotlin-app finns direkt i `backend/`.
Det tidigare M21/M22-teknikprovet och dess skript/deployfiler är borttagna.
Historiska provresultat finns kvar i `docs/migration/` och Git-historiken.
Nytt tomt PostgreSQL-schema `forena`, ingen import av gamla Förena-projektets
testdata eller SQL-migrationshistorik. Se [ADR-010](../docs/migration/decisions.md).

## Java och containerbygge

API:t kompileras och körs med **Java 25**, utan krav på Oracle eller exakt patch.
JVM-testerna i CI använder Temurin 25. Releasen använder CI:s native-artefakt. Kotlin använder `java.version` som JVM-mål.
Spring Boots `build-image` får `BP_JVM_VERSION=25` via pluginens buildpack-miljö:

```sh
backend/mvnw -f backend/pom.xml --batch-mode --no-transfer-progress verify
backend/mvnw -f backend/pom.xml --batch-mode --no-transfer-progress spring-boot:build-image
```

Ett native-bygge använder samma mål med Maven-profilen `native`:

```sh
backend/mvnw -f backend/pom.xml --batch-mode --no-transfer-progress -Pnative spring-boot:build-image
```

Profilen aktiverar GraalVM-pluginen och Spring Boots ärvda AOT-steg. Buildpacks
hämtar GraalVM och producerar en körbar native-container; ingen separat
native-Dockerfile eller lokalt installerad GraalVM krävs. Docker krävs.
`DatabaseConfiguration` anger PostgreSQL-dialekten som en bean så att AOT inte
behöver ansluta till databasen. Bygg utan Auth-/databascredentials och med
`FORENA_MIGRATE` utelämnad. Runtime får sina anslutningar och credentials via
miljövariabler som tidigare. Spring-profiler och villkor som påverkar vilka
beans som finns avgörs däremot vid AOT-bygget.

Liquibase kör korta migreringar före HTTP-start som separat owner-anslutning.
`FORENA_MIGRATE` är true som standard. `SpringLiquibase` finns alltid i AOT-
grafen och läser `shouldRun` vid processstart. Native-metadata inkluderar
hela `db/**`, eftersom changelog och SQL ligger direkt i `db/`. Rättigheter och sessionsschema
verifieras en gång före HTTP; fel stoppar starten. Tunga dataflyttar körs
separat i återupptagbara batcher enligt ADR-023.
Se [Spring Boots native-guide](https://docs.spring.io/spring-boot/how-to/native-image/developing-your-first-application.html)
och [JDBC/AOT-konfiguration](https://docs.spring.io/spring-boot/reference/data/sql.html).

CI-jobbet `native-image` kör samma buildpack-kommando efter `backend`-jobbet
vid ändrat byggunderlag eller cachemiss. En oförändrad image återanvänds inom
samma UTC-vecka, men startprovet körs alltid. Se
[byggcachens regler](../docs/migration/actions-deployment.md#återanvändning-av-oförändrade-byggen).
Det startar buildpacks native-image direkt mot en tillfällig lokal PostgreSQL och en
syntetisk JWKS-server, kontrollerar DB/Auth-health, avbrott/återhämtning,
saknad Bearer och avstängning. Det gör även autentiserade verksamhetsanrop med
en lokalt signerad token: tom översikt, aktivitet via enbart kallelse med tomma
lagroller, aktivitetsdetaljer och tomma listor efter återkallad personåtkomst.
Migreringarna körs med JVM-JAR:en två gånger och sedan mot ett tomt schema vid webbstart.
Startprovet använder imagens ordinarie entrypoint med syntetisk lokal konfiguration.
Provet kontrollerar också att runtime får sin konfiguration vid start
och använder separata owner-/runtime-anslutningar vid start. Browserinloggning
och HTTPS provas separat; verksamhetsanropen här använder Bearer över lokal HTTP.
Lokalt kan den genererade AOT-grafen också provas med
`python3 backend/scripts/local-smoke.py --aot-runtime` efter `-Pnative package`.
Det ersätter inte ett fullständigt native-image-startprov.
Efter godkänt startprov sparas imagen som Actions-artifakten
`forena-backend-image-<sha>` i tre dagar. Den kan hämtas och laddas med
`docker load`; `verify` kräver att native-jobbet lyckas.

Native-metadata under `src/main/resources/META-INF/native-image` registrerar
Hibernate Validators genererade JBoss-logger/konstruktor och meddelandeklassens
`INSTANCE`-fält uttryckligen. Det täcker båda genererade JBoss-klasserna i JAR:en.
Första CI-provet byggde imagen men stoppades vid start med `Invalid logger
interface`: den ärvda, villkorliga metadataregistreringen räckte inte för
Hibernate Validator 9.1/JBoss Logging 3.6. Nästa prov kom förbi loggern men
behövde även `Messages_$bundle`. Valideringen behålls aktiverad.

API-DTO:ernas listfält använder Jacksons statiska typning för serialisering.
JSON byggs från deklarerad `List<T>` i stället för att reflektera över konkreta
Kotlin-implementationer som `EmptyList`. Tomma listor är fortfarande `[]` och
vanliga Kotlin-listor kan användas i tjänsterna. Native-startprovet täcker också
tomma nästlade lagroller, som den tidigare medlemskapsfixturen inte exponerade.

Liquibase läser SQL-filernas attribut genom reflection. Native-metadata för
`AbstractSQLChange` och `SQLFileChange` inkluderar därför deras deklarerade
metoder, inklusive ärvda SQL-attribut som `setSplitStatements(Boolean)` samt
sökväg/encoding/relativ sökväg. Den generella Liquibase-metadatafilen täcker
inte alla dessa anrop. Changelog och SQL-resurser inkluderas fortsatt via `db/**`.
En JVM-start med AOT-grafen verifierar inte GraalVM:s reflection-begränsningar.
För ett riktigt lokalt native-prov med GraalVM installerat:

```sh
backend/mvnw -f backend/pom.xml -Pnative -DskipTests native:compile
python3 backend/scripts/local-smoke.py --runtime-executable backend/target/forena-api
```

Releaseflödet publicerar buildpacks native-image från exakt godkänd main-CI utan ompaketering.
Image-ID, byggunderlag och aktuell `verifiedCommit` verifieras; `sourceCommit`
bevarar ursprungligt bygge. Vercel får en OCI-referens låst till
digest. Ingen extraktion, extra Dockerfile eller ändrad entrypoint används.
`FORENA_DB_CA_CERTIFICATE` innehåller databasens publika PEM-CA vid deployment.
Appen validerar den och skriver en privat temporär fil för JDBC vid start;
övriga TLS-parametrar behålls.
Se [releaseflödet](../docs/migration/actions-deployment.md).
Lokalt prov 2026-10-19: `-Pnative spring-boot:build-image` passerade AOT utan
Auth-/databascredentials och utan databasanslutning. Uppackningen av standard-
buildern `paketobuildpacks/builder-noble-java-tiny:latest` fyllde Docker/VFS-
miljöns disk trots cirka 21 GiB ledigt före försöket. Bygget avbröts och Docker
återställde diskutrymmet. Det lokala försöket verifierade därför inte native-
kompilering eller start; dessa kontroller körs nu i Actions-jobbet ovan.
En uppstartsjämförelse och native-runtime mot riktig Auth/HTTPS återstår.
Lokala containerprov behöver mer diskutrymme eller effektivare Docker-lagring.
Ett byte av imagebyggare
behöver också bevara runtimekonfigurationen, databasens CA och startkontrollerna.

## Loggning

API:t använder Spring Boots vanliga textloggning till konsolen, både lokalt
och i deployment. OpenTelemetry-startern och OTLP-exporten är borttagna;
ingen collector behövs. ECS-/JSON-loggning är inte aktiverad.
Ingen särskild `local`-profil behövs för loggningen.

`local-smoke.py` kontrollerar textloggar från den paketerade runtime-processen,
både JVM och native-imagen i CI, tillsammans med de befintliga startproven.

## HTTPS till Supabase Auth

JWKS-hämtning och kontrollen mot Auth `/user` använder samma HTTP-klient.
Dess truststore kombinerar Java-standardens rötter med containerns
`/etc/ssl/certs/ca-certificates.crt` och ett eventuellt plattforms-CA-paket.
Klienten läser `SSL_CERT_FILE` och `NODE_EXTRA_CA_CERTS` direkt när
`FORENA_AUTH_CA_BUNDLE` respektive `FORENA_AUTH_EXTRA_CA_BUNDLE` saknas. Båda läses om båda finns.
Ett uttryckligt felaktigt CA-paket stoppar starten. Klienten behåller
värdnamns-/kedjeverifiering, nekar redirects och har två sekunders timeout.
TLS-konfigurationen kräver inga JVM-flaggor eller admincredentials.

Startup loggar endast antal CA-certifikat per källa. `/actuator/health`
kontrollerar både databasen och hämtning av publika Auth-nycklar med samma
TLS-klient som JWT-verifieringen. Ett fel stoppar releasepromotion; publika
health-svar visar inga URL:er, nycklar eller felorsaker. API-anrop med redan
cachad och betrodd signeringsnyckel kan fortfarande verifieras under ett
tillfälligt nyckelserveravbrott.

Implementerat:

- `GET /api/activities/{activityId}/my-invitations` – egna personer och aktiva målsmanskopplingar.
- `PUT /api/invitations/{invitationId}/respond` – svara, ändra kommentar eller återställa till `pending`.
- Svar, revision, revisionshistorik (konto/kanal) och beständig signalversion i en transaktion.
- Signerade webbsessioner, familjeavgränsning i Kotlin och livscykellås.

En avskild [Next-/browserkoppling](../docs/migration/browser-participation.md)
finns nu bakom serverkonfiguration som är avstängd som standard. Ordinarie
översikt är inte omkopplad och ingen API-deploy ingår.
[Målmiljö/Auth-arbetet](../docs/migration/target-auth-lifecycle.md)
har verifierat det privata schemat i `forena-kotlin`: separata begränsade
LOGIN-roller, JDBC med betrodd CA/hostname-verifiering, paketerad Liquibase
med oförändrad återkörning och hela `TargetAuthIT` är godkända i en tillfällig
Vercel Sandbox. Fixturer och Auth-konton är städade, Sandboxen stoppad.
Skapande av konton, familjer,
aktiviteter och kallelser är ännu inget publikt API. Testerna skapar egna
syntetiska data. Inga utskick eller fullständiga signalberäkningar görs här.

## Bygg och verifiera

Använd den låsta verktygskedjan i [versionsdokumentet](../docs/migration/versions.md)
och en lokal Docker-motor. Kör från reporoten:

```sh
backend/mvnw -f backend/pom.xml --batch-mode --no-transfer-progress verify
python3 backend/scripts/local-smoke.py
npm ci --prefix backend/contract --ignore-scripts
npm run check --prefix backend/contract
```

JUnit startar tillfälliga PostgreSQL 17-containrar och en lokal JWKS-server.
Migrering körs som riktig, begränsad schemaägare; HTTP använder en annan
runtime-roll utan ägar-/BYPASSRLS-rättigheter. Testlösenorden finns bara under
`src/test`. Testerna verifierar också tom installation, uppgradering av det
nya identitetsschemat, återkörning, FK/constraints, rollback och samtidiga skrivare.

[OpenAPI](contract/openapi.json) och [genererade TypeScript-typer](contract/generated.ts)
genereras från REST-controllers och typade DTO:er med springdoc 3.1.1.
`/v3/api-docs` kräver samma verifierade bearer-token som API:t. Swagger UI ingår
inte. Beskrivningar av felstatusar, behörighet och kommentarsregler finns i
controller-/DTO-annoteringarna; specen redigeras inte manuellt.

Maven `verify` hämtar specen från den riktiga HTTP-servern i integrationstestet
med signerad token och skriver `target/openapi.json`. Därefter kör
`npm run generate --prefix backend/contract` enbart stabil nyckelsortering
av exporten och genererar typer med låst `openapi-typescript`. Både spec och
typer versionshanteras; `npm run check` kontrollerar båda mot Git. Kör därför
Maven-verifieringen före generationen. Båda webbapparnas Kotlin-anrop använder de genererade typerna.

Alla egna REST-controllers returnerar Kotlin data classes,
även för explicita felsvar. API:ts request är också typad: en separat intern
närvaroflagga skiljer utelämnad kommentar från explicit null utan att exponeras
i JSON eller OpenAPI. Okända/ignorerade fält och numeriska enumvärden nekas.

## Repositories och transaktioner

API:ts produktionskod använder Spring Data JDBC 4.1.0 (låst av Boot-BOM) och
smala `Repository`-interface. Genererade frågor sköter konto-/sessionskontroll,
personåtkomst, personer, aktiviteter och kallelsesvar. Ingen JdbcTemplate
eller JdbcClient används i API:ts produktionskod. Se [ADR-011](../docs/migration/decisions.md).

Tjänster använder suffixet `Service`: `InvitationService`, `SessionService`,
`PersonAccessService` och `DatabaseClockService`. Inom varje moduls `internal`-
paket samlas databasmodeller i `Entities.kt` och repository-interface i
`Repositories.kt`. DTO:er ligger i separata filer från tjänsterna. Modulen
`activities` äger aktiviteter och kallelser; `identity` äger konto/session och
personåtkomst. Repositories och entities är interna inom respektive modul.
Se ADR-015 för modulnamnet och namnkonventionerna.

Personåtkomstens sammansatta nyckel mappas med `@Id` och `@Embedded`. Läsning
hämtar behöriga personer och deras kallelser i batcher, inte en personfråga per kallelse.
Namn sorteras med databasens kollation och UUID används som sekundär ordning.
`InvitationService` är en `@Service`: `respond` använder `@Transactional`, `list`
`@Transactional(readOnly = true)`. Konto/session och person-/organisationsåtkomst
kontrolleras i Kotlin enligt ADR-012/013. Främmande aktivitet ger 404, främmande
kallelse 403. Skrivbehörighet kontrolleras före och efter låsväntan.

Skrivningen låser först aktivitet, sedan kallelse med `@Lock(PESSIMISTIC_WRITE)`.
Det skyddar mot samtidiga aktivitetsändringar och serialiserar även skapande/
ökning av den gemensamma signalraden för olika kallelser på samma aktivitet.
Efter låsen kontrolleras utskick, sluttid och inställning med aktuell databastid.

Tjänsten normaliserar kommentar och beräknar pending-återställning, svarstid och
revision. Den sparar svar, historik (verifierat konto/kanal) och eventuell
signalversion genom repositories i samma transaktion. Identisk upprepning skriver
ingenting; ändrad kommentar behåller svarstid och påverkar inte signalversionen.
Varje fel rullar tillbaka allt. `@ReadOnlyProperty` skyddar kallelsens identitet.
Ingen produktionskod använder TransactionTemplate eller `set_config`.

Efter Liquibase-steg 004 finns inga egna databasfunktioner, lagrade procedurer
eller verksamhetstriggers i `forena`. `DatabaseClockRepository` hämtar
PostgreSQLs inbyggda `clock_timestamp()` med teknisk `@Query`. M07A tillför
också en avgränsad läsprojektion för aktivitetsöversikten enligt ADR-020.
Tidigare migrationer är oförändrade; steg 003 tar bort RLS och steg 004 tar bort
triggers/funktioner utan att radera svar, historik eller signalversioner.
Steg 005 tar bort enbart historikens `session_id`; konto-ID och övrig historik
bevaras. Ingen teknisk audit-logg införs nu.
SQL för schema, nycklar och constraints finns kvar. Gamla appens databaslogik ligger kvar i den äldre appen.

## Databas och körning

1. Kör [bootstrap.sql](scripts/bootstrap.sql) som administratör i den rena målmiljön.
   Scriptet skapar NOLOGIN-roller. Sätt separata starka lösenord genom miljöns
   hemlighetshantering och aktivera LOGIN inför migrering/runtime.
   I `forena-kotlin` är bootstrap redan verifierad; kör inte scriptet igen där.
   Exponera inte `forena` i Supabase Data API. Använd direkt PostgreSQL eller
   en verifierad JDBC-kompatibel pooladress med TLS i molnmiljön.
2. Stoppa eventuell äldre API-runtime före steg 004/005; den förutsätter triggers
   eller historikens tidigare sessionskolumn.
   Kör releasestegets migrering separat med ägarkontot:

   ```sh
   FORENA_MIGRATE_ONLY=true java -jar backend/target/forena-api.jar
   ```

   Processen startar ingen HTTP-server och avslutas efter migreringen. Den behöver
   `FORENA_JDBC_URL`, `FORENA_DB_PASSWORD`, `FORENA_MIGRATION_USERNAME` och
   `FORENA_MIGRATION_PASSWORD`. Ägarrollen är `forena_api_owner`; använd den aldrig
   som verksamhetens DataSource. `FORENA_DB_PASSWORD` avser runtime-kontot.
3. Starta backend med owner- och runtime-credentials; korta migreringar körs före HTTP.
   Sätt `FORENA_MIGRATE=false` endast om separat jobb redan migrerat databasen:

   ```sh
   java -jar backend/target/forena-api.jar
   ```

   Obligatoriskt: `FORENA_JDBC_URL`, `FORENA_DB_PASSWORD`, `FORENA_AUTH_ISSUER`
   och `FORENA_AUTH_JWKS_URI` samt `FORENA_AUTH_PUBLISHABLE_KEY` (`sb_publishable_…`).
   `FORENA_DB_USERNAME` är normalt `forena_api_runtime`, med projektsuffix för poolern.
   Issuer är projektets exakta `/auth/v1`-adress; JWKS är dess
   `/auth/v1/.well-known/jwks.json`. HTTPS krävs utom för lokala loopbacktester.
   Port är `PORT` eller 8080. `/actuator/health` är publik utan detaljer.

Webbfrontenden kräver också migreringarna `api-008-spring-session` samt tidigare migreringar,
`FORENA_WEB_SESSION_ENABLED=true`, kanonisk `FORENA_WEB_ORIGIN` och en
base64-kodad 32-bytes `FORENA_WEB_SESSION_KEY` i runtime-hemlighetshanteringen.
Nyckeln delas mellan instanser och ska behållas över omstarter.
[Sessions-API, CSRF, kryptering och releaseordning](../docs/migration/web-sessions.md).
Befintliga Bearer-klienter fungerar även utan aktiverade webbsessioner.

Runtime har högst fyra databasanslutningar och fem sekunders väntan på poolen.
Verifierad token ger aktören till Kotlin-kodens åtkomstkontroller och historikens
konto-ID. Sessions-ID används bara i autentiseringslagret och sparas inte i
verksamhetsdata enligt ADR-014. Framtida separat teknisk audit-loggning kan läsa
`session_id` från den aktuella verifierade tokenen. Ingen identitet sätts på
databasanslutningen. Klientens JSON, headers och `user_metadata` ger inga familjerättigheter. Inget `service_role`-konto
används.

## Autentisering och samtidighet

Enbart bearer-token för webbsessioner: RS256/ES256, exakt issuer, audience
`authenticated`, samma roll, UUID-subjekt och `session_id`, `exp`/`iat` och
`is_anonymous=false`. MCP/OAuth-grants (`client_id`, scope/scopes/grant_id),
HS256, anonyma token och cookie-fallback nekas. Supabases faktiska inställningar
ska verifieras i den nya miljön innan aktivering; inga Auth-konton ändras här.
JWKS hämtas med två sekunders anslutnings-/lästimeout och Spring/Nimbus cache;
okänd nyckel som inte kan verifieras nekas även när nyckelservern är nere.
En redan cachelagrad giltig nyckel kan fortsatt användas.

`account.enabled` och `revoked_session` kontrolleras för varje transaktion;
familjekopplingar hämtas från databasen. Lokal revokering kräver ett separat
administrationsflöde. En provideradapter kontrollerar dessutom aktuell token via
Supabase Auth `/user`, med publishable key och samma exakta issuer. Skrivningar
kontrolleras igen efter radlåsen. Kända inaktiva sessioner ger 401; Auth-fel,
timeout, 429, redirect och okända svar nekar med generiskt 503/no-store utan retry,
cache eller fallback. Runtime har ingen Auth-adminnyckel eller Auth-tabellåtkomst.
Bearer-tokenen finns bara under anropet och sparas inte i historik.

Detta är lokalt verifierat med riktig HTTP mot en kontrollerad Auth-fixtur.
Verkligt driftad Supabase-revision har klarat hela `TargetAuthIT` i målprojektet;
resultat och återstående pilotgrindar finns i målmiljödokumentet. Revokering efter sista
kontrollen stoppar inte ett redan pågående kommando. Timebox/inaktivitet och
övriga Auth-metoder behöver separata prov. Se [full körinstruktion och gränser](../docs/migration/target-auth-lifecycle.md).

Samtidiga svar serialiseras med radlås. Senast utförda olika kommando gäller;
version 0.1 har ingen `If-Match`/förväntad revision. Upprepning av exakt samma
svar och kommentar skriver ingen historik eller signalversion. En äldre,
fördröjd annorlunda begäran kan alltså ersätta ett nyare svar. Gör ingen
automatisk fallback till gamla backend efter timeout.

Det finns inga verksamhetstriggers. Runtime får uppdatera svar, kommentar,
svarstid och revision, infoga historik samt läsa/infoga/öka signalversionen.
Historiken saknar UPDATE/DELETE-grants och kallelsens identitet är skrivskyddad.
`UPDATE(status)` på aktivitet behövs för PostgreSQLs `SELECT FOR UPDATE`;
repositoryt exponerar ingen aktivitets-skrivmetod. Rollen saknar DDL/ägarrätt.
Det finns ingen RLS i `forena`: runtime-kontot kan läsa över familjegränser och
Kotlin måste alltid kontrollera åtkomsten. Kontot får aldrig lämnas till klienter,
och schemat får inte exponeras via Supabase Data API. Migrationen återkallar
åtkomst för PUBLIC samt eventuella anon/authenticated/service_role-roller.
Gamla appens Supabase-schema och RLS ändras inte.
Historiken sparar inte kommentartext eller token. `activity_signal_state` är
en beständig invalideringsversion, inte en outbox eller ett löfte om levererad
notifiering. Signalworker/Modulith-reaktion kopplas in i ett senare steg.

## Personlig översikt

Migration 011 inför `team_membership`, `team_access_assignment`,
`organization_member`, föreningstidszon och aktivitetens plats/beskrivning,
samling och svarstid. Den lägger inte till nya relationstyper i personåtkomsten.
Den gemensamma datarollens default grants gäller nya tabeller; inga runtime-
DDL-rättigheter eller klientgrants införs.

`GET /api/me/overview` ger en komplett read-only snapshot av kontots pågående/
kommande aktiviteter. Datumgiltigt medlemskap vid aktivitetens lokala datum och
egen lagåtkomst kan ge aktivitet utan kallelse. Delegerad personåtkomst ärver
inte personens separata lagåtkomst. Kallelser utökar fortfarande bara läsningen
för behöriga personer. Personer returneras separat från eventuell skickad
kallelse. Framtida kallelser döljs; nej-svar döljer inte aktiviteten.

Förenings-/lagroller är från databasen och aktiva vid dagens datum i föreningen.
Översikten har inte pilotens 90 dagar/50 poster. En gräns på 20 000 aktiviteter
stoppar större underlag med 503; räknare får inte presentera trunkerade data.
`GET /api/activities/{id}` kontrollerar samma läsrätt och ger 404 för främmande
eller okänd aktivitet. Läsrätt ger aldrig svarsrätt för andra personers kallelser.
Båda rutterna har no-store. Det äldre list-API:t nedan behålls separat.

Det riktiga browserprovet kan även köras mot en lokalt kompilerad native-binär.
Starta Vite preview på port 3000 efter `npm run frontend:build`, bygg med GraalVM
enligt ovan och kör från reporoten med en vanlig Java 25-JDK för JUnit:

```sh
FORENA_LOCAL_BROWSER_TEST=true \
FORENA_BROWSER_NATIVE_EXECUTABLE="$PWD/backend/target/forena-api" \
backend/mvnw -f backend/pom.xml -Dtest=ApiTest test
```

Testet använder endast lokal PostgreSQL, syntetiska Auth-nycklar och lokal
provider-fixture. Native-processen får separata lokala owner/runtime-konton.
`FORENA_BROWSER_EXECUTABLE` kan välja installerad Chromium. Utelämnad native-
sökväg kör samma browserprov mot JVM. Loggar finns under ignorerade `target/`.

## Mina aktiviteter och personåtkomst

`GET /api/me/activities?offset=0` läser kontots kallelsekopplade aktiviteter via
`PersonAccessService`, även för personer med aktiv delegerad åtkomst. Varje
aktivitet visas en gång med klubb/lag, titel och tider; 50 per sida och
`next_offset` vid fler resultat. Pågående/kommande ej inställda aktiviteter med
start inom 90 dagar ingår. `invitations` på varje rad innehåller bara skickade
kallelser för behöriga personer, med namn, aktuellt svar och kommentar.
Kallelserna läses i en gemensam batch för sidans högst 50 aktiviteter, utan
N+1-frågor. Framtida kallelser ger en tom lista. Svar och relationstyp utökar
inte åtkomsten. Översiktens snabbsvar använder samma svarstjänst som detaljerna;
utelämnad kommentar bevaras. Lagmedlemskap utan kallelse återstår i M07B.
Migration 009 införde lagläsning; 010 ger den nuvarande gemensamma datarollen.
Båda körs som owner vid start före API-trafik. Native-image behöver byggas om med
nya DTO:er. Gamla kallelserutternas JSON/URL:er är oförändrade, men genererade
scheman heter nu `MyInvitations` och `AccessibleInvitation`. Se ADR-020.

## Gemensamma Kotlin- och databasregler

Tabellmappningar heter nu `*Entity` (exempelvis `PersonEntity`), medan
läsprojektionen heter `ActivityOverviewRow`. Använd standardundantag för
argument/tillstånd/saknade data och befintliga Spring-undantag för Auth/transport;
HTTP översätts separat med säkra feltexter. Se AGENTS.md och ADR-022.

Migration `api-010-runtime-data-access` ger runtime gemensam DML på privata
datatabeller och förval för framtida owner-skapade tabeller/sekvenser. De äldre
kolumngrants ovan är historiska; runtime kan nu skriva även konto-, personåtkomst-
och historikdata. Kotlin äger användarbehörighet och verksamhetsregler. Runtime
har ingen DDL/ägarrätt eller åtkomst till Liquibase-tabeller. Owner kör Liquibase
vid backendstart före HTTP enligt ADR-023. Efter Liquibase kontrolleras
rollmodellen och sessionsschemat en gång, genom datasource med runtime-kontot.
Både owner- och runtime-credentials behövs i backendprocessen, med separata
konfigurationsfält. Löpande DB-health använder Spring Boots vanliga
`DataSourceHealthIndicator` för anslutningen. Se ADR-021 och migreringsstatus.

För separat rättighetskontroll i migrations-/releasejobbet, använd den paketerade
JVM-JAR:en med runtime-anslutningen och utan owner-credentials:

```sh
FORENA_MIGRATE=false FORENA_VERIFY_DATABASE_ACCESS=true \
  java -jar backend/target/forena-api.jar
```

Kommandot öppnar ingen HTTP-server och tvingar Liquibase avstängt. Exitkod 0
betyder godkänd kontroll; annan exitkod ska avbryta jobbet före aktivering.
`FORENA_VERIFY_DATABASE_ACCESS` och `FORENA_MIGRATE_ONLY` får inte båda vara true.
Verifieringsläget är testat med JVM-JAR, inte som native-CLI. Det vanliga Vercel-
releasejobbet har inga DB-credentials och kör fortfarande HTTP-health/version/
login; startmigrering och engångskontroll sker inne i backendprocessen.

För Kubernetes ska liveness vara oberoende av databasen. Readiness kan uttryckligen
inkludera `db` när trafik kräver databasåtkomst; schema-/rättighetskontroll ska inte
läggas i återkommande probes.

Owner-login konfigureras som `FORENA_MIGRATION_USERNAME` och
`FORENA_MIGRATION_PASSWORD` i backendens runtime-miljö. Använd projektsuffixet
på användarnamnet om Supabase-poolern kräver det. Ge aldrig runtime-rollen
medlemskap i owner. Liquibase-låset samordnar starter, men lång SQL eller
låsväntan kan överskrida plattformens startbudget; se ADR-023.

Auth-mejl i native-läget skickas via Resends REST-API, inte SMTP. Sätt
`RESEND_API_KEY` och `RESEND_FROM_EMAIL` i backendens hemlighetshantering.
All leverantörskod finns i `se.forena.api.email.internal`; övriga moduler
använder `EmailSender`. Auth äger mallar och krypterad outbox med stabil
idempotensnyckel, tidsbegränsade återförsök och stopp vid permanenta fel.
Se [konfiguration och driftgränser](../docs/migration/native-auth.md#mejl-och-driftgränser).

Native-inloggning använder Springs `formLogin`/`DaoAuthenticationProvider`,
WebAuthn-filter och `oneTimeTokenLogin`; logout och passkey-borttagning använder
också Springs filter. Se [genomgången](../docs/migration/spring-security.md) för
konfiguration, kvarvarande adaptrar och kontroll mot projektets Spring-version.
