# Första verksamhets-API:t

Separat Spring Boot/Kotlin-app; teknikprovet i `backend/` är fortsatt isolerat.
Nytt tomt PostgreSQL-schema `forena`, ingen import av gamla Förena-projektets
testdata eller SQL-migrationshistorik. Se [ADR-010](../../docs/migration/decisions.md).

Implementerat:

- `GET /api/activities/{activityId}/my-invitations` – egna personer och aktiva målsmanskopplingar.
- `PUT /api/invitations/{invitationId}/respond` – svara, ändra kommentar eller återställa till `pending`.
- Svar, revision, revisionshistorik (konto/session/kanal) och beständig signalversion i en transaktion.
- Signerade webbsessioner, familjeavgränsning i Kotlin och livscykellås.

Ingen Next-adapter eller molndeploy ingår. Skapande av konton, familjer,
aktiviteter och kallelser är ännu inget publikt API. Testerna skapar egna
syntetiska data. Inga utskick eller fullständiga signalberäkningar görs här.

## Bygg och verifiera

Använd den låsta verktygskedjan i [versionsdokumentet](../../docs/migration/versions.md)
och en lokal Docker-motor. Kör från reporoten:

```sh
backend/mvnw -f backend/api/pom.xml --batch-mode --no-transfer-progress verify
python3 backend/api/scripts/local-smoke.py
npm ci --prefix backend/api/contract --ignore-scripts
npm run check --prefix backend/api/contract
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
`npm run generate --prefix backend/api/contract` enbart stabil nyckelsortering
av exporten och genererar typer med låst `openapi-typescript`. Både spec och
typer versionshanteras; `npm run check` kontrollerar båda mot Git. Kör därför
Maven-verifieringen före generationen. Frontend använder typerna ännu inte.

Alla egna REST-controllers i API:t och teknikprovet returnerar Kotlin data classes,
även för explicita felsvar. API:ts request är också typad: en separat intern
närvaroflagga skiljer utelämnad kommentar från explicit null utan att exponeras
i JSON eller OpenAPI. Okända/ignorerade fält och numeriska enumvärden nekas.

## Repositories och transaktioner

API:ts produktionskod använder Spring Data JDBC 4.1.0 (låst av Boot-BOM) och
smala `Repository`-interface. Genererade frågor sköter konto-/sessionskontroll,
familjekopplingar, personer, aktiviteter och kallelsesvar. Ingen JdbcTemplate
eller JdbcClient används i API:ts produktionskod. Se [ADR-011](../../docs/migration/decisions.md).

Familjekopplingens sammansatta nyckel mappas med `@Id` och `@Embedded`. Läsning
hämtar familjen och dess kallelser i batcher, inte en personfråga per kallelse.
Namn sorteras med databasens kollation och UUID används som sekundär ordning.
`Invitations` är en `@Service`: `respond` använder `@Transactional`, `list`
`@Transactional(readOnly = true)`. Konto/session och familje-/organisationsåtkomst
kontrolleras i Kotlin enligt ADR-012/013. Främmande aktivitet ger 404, främmande
kallelse 403. Skrivbehörighet kontrolleras före och efter låsväntan.

Skrivningen låser först aktivitet, sedan kallelse med `@Lock(PESSIMISTIC_WRITE)`.
Det skyddar mot samtidiga aktivitetsändringar och serialiserar även skapande/
ökning av den gemensamma signalraden för olika kallelser på samma aktivitet.
Efter låsen kontrolleras utskick, sluttid och inställning med aktuell databastid.

Tjänsten normaliserar kommentar och beräknar pending-återställning, svarstid och
revision. Den sparar svar, historik (verifierat konto/session/kanal) och eventuell
signalversion genom repositories i samma transaktion. Identisk upprepning skriver
ingenting; ändrad kommentar behåller svarstid och påverkar inte signalversionen.
Varje fel rullar tillbaka allt. `@ReadOnlyProperty` skyddar kallelsens identitet.
Ingen produktionskod använder TransactionTemplate eller `set_config`.

Efter Liquibase-steg 004 finns inga egna databasfunktioner, lagrade procedurer
eller verksamhetstriggers i `forena`. Endast en teknisk `@Query` återstår:
`DatabaseClockRepository` hämtar PostgreSQLs inbyggda `clock_timestamp()`.
Tidigare migrationer är oförändrade; steg 003 tar bort RLS och steg 004 tar bort
triggers/funktioner utan att radera svar, historik eller signalversioner.
SQL för schema, nycklar och constraints finns kvar. Teknikprovets worker-/registry-
frågor i `backend/src` och gamla appens databaslogik ingår inte i denna ändring.

## Databas och körning

1. Kör [bootstrap.sql](scripts/bootstrap.sql) som administratör i en **ny databas**.
   Sätt separata starka lösenord för rollerna genom miljöns hemlighetshantering.
   Exponera inte `forena` i Supabase Data API. Använd direkt PostgreSQL eller
   en verifierad JDBC-kompatibel pooladress med TLS i molnmiljön.
2. Stoppa eventuell äldre API-runtime före steg 004; den förutsätter triggers.
   Kör releasestegets migrering separat med ägarkontot:

   ```sh
   FORENA_MIGRATE=true java -jar backend/api/target/forena-api.jar
   ```

   Processen startar ingen HTTP-server och avslutas efter migreringen. Den behöver
   `FORENA_JDBC_URL`, `FORENA_DB_PASSWORD`, `FORENA_MIGRATION_USERNAME` och
   `FORENA_MIGRATION_PASSWORD`. Ägarrollen är `forena_api_owner`; lämna aldrig
   ägarcredentialen till runtime. `FORENA_DB_PASSWORD` avser runtime-kontot.
3. Starta runtime med `FORENA_MIGRATE` avstängd/utelämnad:

   ```sh
   java -jar backend/api/target/forena-api.jar
   ```

   Obligatoriskt: `FORENA_JDBC_URL`, `FORENA_DB_PASSWORD`, `FORENA_AUTH_ISSUER`
   och `FORENA_AUTH_JWKS_URI`. `FORENA_DB_USERNAME` är normalt `forena_api_runtime`.
   Issuer är projektets exakta `/auth/v1`-adress; JWKS är dess
   `/auth/v1/.well-known/jwks.json`. HTTPS krävs utom för lokala loopbacktester.
   Port är `PORT` eller 8080. `/actuator/health` är publik utan detaljer.

Runtime har högst fyra databasanslutningar och fem sekunders väntan på poolen.
Verifierad token ger aktören till Kotlin-kodens åtkomstkontroller och historikens
konto/session. Ingen identitet sätts på databasanslutningen. Klientens JSON,
headers och `user_metadata` ger inga familjerättigheter. Inget `service_role`-konto
används.

## Autentisering och samtidighet

Enbart bearer-token för webbsessioner: RS256/ES256, exakt issuer, audience
`authenticated`, samma roll, UUID-subjekt och `session_id`, `exp`/`iat` och
`is_anonymous=false`. MCP/OAuth-grants (`client_id`, scope/scopes/grant_id),
HS256, anonyma token och cookie-fallback nekas. Supabases faktiska inställningar
ska verifieras i den nya miljön innan aktivering; inga molnkonton ändras här.
JWKS hämtas med två sekunders anslutnings-/lästimeout och Spring/Nimbus cache;
okänd nyckel som inte kan verifieras nekas även när nyckelservern är nere.
En redan cachelagrad giltig nyckel kan fortsatt användas.

`account.enabled` och `revoked_session` kontrolleras för varje transaktion;
familjekopplingar hämtas från databasen. Lokal revokering kräver ett separat
administrationsflöde. Utloggning eller radering enbart hos Auth-leverantören
upptäcks inte omedelbart av lokal JWT-verifiering: en redan utfärdad token kan
gälla till `exp` om kontot/sessionen inte också spärras lokalt. Detta måste
hanteras vid Auth-integrationen innan pilot, inte döljas som full M03-acceptans.

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
