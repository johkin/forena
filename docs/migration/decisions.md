# Beslut och verifieringsgrindar

Status anger målbeslut för kommande implementation, inte redan införd teknik.
Källkodsverifierat nuläge finns i [inventeringen](inventory.md).

## ADR-001: Verktygskedja och repo — fastställt

Spring Boot **4.1.0**, Kotlin **2.4.20**, Java **26**. Bygg och kör med JDK 26.
Ingen automatisk nedgradering eller uppgradering. Tillgänglighet är skild från
kompatibilitet; [versionskontrollen](versions.md) måste bli godkänd i M01.
Lås Maven Wrapper med distributionschecksumma, plugins, JDK-distribution och
patch/build, containerbas med digest samt relevanta CI-actions. Samma JDK används
lokalt, i CI och container. Enforcer/toolchains ska neka fel JDK och Kotlin ska
producera JVM 26-bytecode. Dokumentera JDK 26:s underhållstid och nästa beslut
utan att ändra versionen på eget initiativ.

Behåll samma repo och npm/package-lock. Introducera `backend/`, `infra/` och
`docs/migration/` utan att först flytta `src/`. Flytt till `frontend/` får egen PR
när scripts, testimporter, deploy och cache-nycklar kan verifieras tillsammans.

## ADR-002: Modulär monolit — fastställt, gränser preliminära

Ett Maven-projekt och en Cloud Run-tjänst. Verksamhetspaket under exempelvis
`se.forena`: `organization`, `activities`, `participation`, `duties`,
`notifications`, `disciplines`. Transportadaptrar för HTTP, Telegram, AI och MCP
anropar samma applikationstjänster med verifierad användarkontext.

| Modul | Publikt ansvar | Tillåtna verksamhetsberoenden, första hypotes |
| --- | --- | --- |
| organization | Identitetskoppling, familj, medlemskap, daterad åtkomst | Inga |
| activities | Aktivitetslivscykel, tider, publicering | organization |
| participation | Kallelser, svar, närvaro | organization, activities |
| duties | Schema, platsbokning, fördelning | organization, activities |
| disciplines | Paket, förval, capability-utvärdering | Publika fakta/API från activities och participation |
| notifications | Mottagarkontroll, meddelanden, transportkvitton | organization; reagerar på typade händelser |

Modulernas rotpaket/named interfaces exponerar små API:er och fakta. Repositories,
tabeller och implementation är interna; inga korsvisa repository-anrop.
`activities` får inte samtidigt bero på `disciplines`: beräkna förval genom ett
uttryckligt orkestrerat anrop eller ett litet publicerat kontrakt, verifierat i M09.
Katalogen är en hypotes att pröva med riktiga use cases, inte sex tomma lager.
En gemensam säkerhetskärna får bära `UserContext` och kanal men inga domänregler.

Inför `ApplicationModules.verify()`, `@ApplicationModuleTest` och genererade
moduldiagram från första verkliga modulparet. Kotlin `internal` ensamt räcker
inte som modulgräns i ett gemensamt Maven-projekt: testa faktisk paketåtkomst
och otillåtna beroenden. Negativa strukturprov ska visa att cykler upptäcks.
Spring-annoteringar tillåts i applikationslagret. Rena regler testas utan transport
eller moln. Skapa portar när databas/leverantör/kanal kräver utbytbarhet, inte
ett interface och tre identiska modeller för varje klass.

## ADR-003: Databasåtkomst och samtidighet — valt för målet

Använd Spring JDBC/JdbcClient och explicita SQL-frågor, PostgreSQL 17 som första
målmajor (överensstämmer med lokal Supabase-konfiguration; driften måste verifieras).
Ingen JPA eller generell repository-hierarki. Kotlin-dataobjekt är immutabla
där möjligt; null betyder frånvaro, inte ett gömt fel. Särskilj utelämnat fält
från explicit null i exempelvis kommentarsändringar.

Applikationstjänster sätter transaktionsgränsen. Normalfall READ COMMITTED;
låsta aggregat, constraints och revisionsvillkor skyddar konflikter. Kontrollera
behörighet i samma transaktion som skrivningen. Sista arbetspassplatsen säkras
med lås/unik constraint eller villkorad uppdatering; ingen eventual consistency
för platstilldelning. Konflikter får ett explicit API-resultat.

Liquibase äger målmiljöns schema och backendens egna scheman. Under övergången
äger `supabase/migrations` befintliga Supabase-objekt. Två migreringsverktyg får
inte äga samma objekt. Använd skilda migrerings- och runtimekonton.

## ADR-004: Auth och behörigheter — fastställt

Supabase behåller användare, passkeys, magic links, lösenord och MCP OAuth.
Ingen egen WebAuthn- eller OAuth-server. Behåll auth-UUID som extern identitet;
Cloud SQL lagrar en lokal identitetsreferens och verksamhetskopplingar, ingen
FK till ett externt `auth.users`. Livscykel för borttagna/blockerade användare
behöver uttrycklig synk/aktivitetskontroll, inte enbart JWT-expiry.

Spring Security validerar signaturalgoritm, exakt issuer, exp/nbf, audience och
kanalens scopes. Asymmetrisk konfiguration använder cachad JWKS med rotation
och feltester; otillräcklig konfiguration stoppar aktivering. En giltig JWT
räcker inte som klubbbehörighet. Delegerade MCP-grants kräver rätt klient/grant,
resource/audience och scopes och får aldrig falla tillbaka till browsercookies.
Utred explicit policy för äldre symmetriska nycklar, revokering och känsliga
operationer i M03. `user_metadata` ger aldrig behörighet.

Organisation, sektion, lag, giltighetsdatum, roller och familj kontrolleras i
backend mot databasen. Bevara RLS som ytterligare skydd där den finns. M04 tar
fram matris policy → verksamhetsregel → test → målskydd, även för definer-funktioner.
Definer-rättigheter får inte följa med slentrianmässigt.

Telegram-koppling ska bevara dagens hashade, tidsbegränsade engångsbevis och
aktuell kontokontroll. I nya monoliten överförs verifierad kontext internt;
kopiera inte dagens behov att själv signera ett tillfälligt Supabase-JWT.
Mutationer auditerar konto, kanal, mål och korrelations-ID utan token eller
privata kommentarer. Leveranslogg och revisionshistorik har separata ändamål.

## ADR-005: Händelser — fastställd riktning, M06 avgör mekanismen

Postgres är tillståndskälla. Synkrona publika modul-API:er används för omedelbart
svar och gemensam transaktion. Interna händelser används för efterföljande
reaktioner; bara uttalade integrationshändelser går till Pub/Sub. Inget Kafka
eller full event sourcing.

Pröva Modulith Event Publication Registry med JDBC före egen generell outbox.
Samma transaktion ska skriva tillstånd och beständigt leveransansvar. Registry
kan ansvara för att en extern publicerare försöker till Pub/Sub; Pub/Sub ansvarar
efter kvitterad publicering för extern leverans. Verifiera faktisk integration,
transaktionsgräns och återstart; anta inget officiellt Pub/Sub-stöd utifrån namnet.
Publiceringsglapp efter leverantörens accept kräver stabilt event-ID och idempotent
konsument. Separat deduplicering av mejlutskick är en verksamhetsegenskap.

Befintliga `notification_outbox`, `activity_domain_events`, schemalagda uppgifter
och disciplinhändelser har redan ansvar. Ersätt dem en i taget och stäng av den
gamla producenten/konsumenten när motsvarande ansvar övertas. Skriv inte samma
svarshändelse från både trigger och Kotlin. Inför inte en andra outbox för samma
transport. Utskick får inte lova exactly-once över databas och extern leverantör.

Cloud Run får skala till noll: inget nödvändigt arbete får bero på en in-memory
lyssnare efter avslutat HTTP-svar eller enbart återförsök vid appstart. M06 provar
en autentiserad Scheduler-trigger/Job som återtar beständigt arbete, timeout,
SIGTERM, flera instanser, leases, backoff, larm och återspelning. Gränser för
batchstorlek och fördröjning är mätbara acceptanskriterier.

## ADR-006: Frontend, kontrakt och release — fastställt med renderinggrind

Behåll Next.js under första backendflytten. Återanvänd UI, AppShell, mobile-first
och `/components`. Vite + Firebase Hosting är mål efter M17:s utvärdering av
publika sidor, indexering, metadata, sociala länkar, 404 och förgenerering/SSR.
Publikt innehåll får inte råka få en privat cachevariant.

OpenAPI versionshanteras tillsammans med genererad TypeScript-klient/typer.
CI kontrollerar att generationen är reproducerbar. Behåll gamla endpointkontrakt
och additiva schemaändringar tills en dokumenterad klientlivslängd gått ut;
äldre öppna flikar ingår i kontraktstest. Välj livslängd från användningsdata före
första brytande ändring. Version polling är inte ett ersättande säkerhetsskydd.

Samma origin med `/api/*` till backend är målet; Firebase rewrite-regioner,
cookies, timeout och pinning av frontend/backend ska provas i M08/M18C.
Preview ska ange både frontend-SHA och backenddigest i ett maskinellt manifest.
Bygg artefakter en gång och främja samma digest mellan miljöer. Publik runtime-
konfiguration levereras separat med egen cachepolicy; inga hemligheter i den.
Backend och frontend kan släppas separat med samordnad release för kopplade ändringar.

## ADR-007: Dataflytt och ägarskap — fastställt

Första flödet använder övergångsvis samma Supabase-Postgres som gamla kanaler;
det är en backendmigrering, inte färdig Cloud SQL-migrering. M05 måste bevisa
RLS-kontext och minsta rättigheter för JDBC innan detta kan aktiveras.
Om det inte går säkert stoppas uppgiften och en explicit PostgREST-övergångsadapter
beslutas; privilegierad JDBC-reservväg är förbjuden.

Data flyttas separat med testat snapshot/export/import och UUID-bevarande.
Klubbvis flytt är preliminär strategi, beroende på delade familjeidentiteter,
systemkataloger och kanalkopplingar i M12. En klubb får en skrivande databas åt
gången. Frys berörda skrivningar, dränera/överlämna köer, kontrollera counts,
checksummor, relationer, receipts och vattenmärken, växla routing och återöppna.
Gamla PostgREST/browser/RPC-kanaler måste stängas eller ledas via backend för
flyttade data. Särskilt redan öppna flikar får inte fortsätta skriva i källan.

Rollback före första målskrivning kan växla tillbaka efter verifiering. Efter
målskrivning krävs separat testad återföring och ny frysning eller framåträttning;
peka aldrig tillbaka på en gammal snapshot. Produktionsschema körs som eget
releasejobb, inte vid varje Cloud Run-start. Expand/contract under utrullningen.
