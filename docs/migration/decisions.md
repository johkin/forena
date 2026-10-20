# Beslut och verifieringsgrindar

Status anger målbeslut för kommande implementation, inte redan införd teknik.
Källkodsverifierat nuläge finns i [inventeringen](inventory.md).

## ADR-018: Serversession och HttpOnly-cookie för nya webben

Beslut 2026-10-20, ärende [#135](https://github.com/johkin/forena/issues/135):
Kotlin äger webbinloggning, förnyelse och utloggning. Browsern får enbart ett
slumpmässigt sessions-ID i en HttpOnly/Secure-cookie. Leverantörens tokens
lagras krypterat på serversidan; ingen localStorage/sessionStorage eller
JavaScript-läsbar cookie ersätter den gamla tokenlagringen. Detta ersätter
ADR-017:s browserlagrade Bearer-modell, inte dess statiska frontend/routing.

Sessionslagringen ligger i det privata PostgreSQL-schemat, separat från
verksamhetsdata. Delade radlås skyddar refresh-tokenrotation över instanser.
Befintlig JWT-verifiering, aktuell leverantörssession och verksamhetsbehörighet
behålls. Publika sidor och uttryckliga publika API-rutter förblir öppna; en
gateway som blockerar hela frontenden införs inte. Cookie-skrivningar kräver
CSRF-skydd. Passkey använder leverantörens tvåstegs-API utan att token passerar
browsern och utan full sidomladdning.

[Implementation, livslängd, driftskrav och verifieringsgränser](web-sessions.md).
Gamla Next-appen/MCP och dess projekt migreras inte av detta beslut.

## ADR-017: Separat browser-frontend för första Kotlin-flödet

**Beslut 2026-10-19 på användarens instruktion:** bygg en separat React/Vite-app
under `frontend/`, parallellt med dagens Next-app. Första avgränsningen är
lösenordsinloggning och kallelsesvar. Återanvänd produktionskomponenter och
utseende; kopiera inte databaslogik, server actions eller hemligheter till
browsern. Ordinarie funktionsparitet flyttas flöde för flöde när Kotlin har API.

Vercel routar `/api/*` direkt till Kotlin och övrigt till statiska frontendfiler.
Frontend behöver ingen Node-server, SSR eller privat servicebinding i detta
flöde. JWT erhålls från det nya Supabase Auth-projektet och skickas som Bearer
på samma origin. Kotlin behåller JWT-/leverantörsverifiering, konto-/sessions-
kontroll och familjebehörighet enligt ADR-012/016. Ingen browserstyrd databas-
eller legacy-fallback införs. Publicering kräver API/JDBC-health och exakt
statisk frontendversion; nycklar och projektgränser verifieras som tidigare.

M18B:s fulla flytt och publika renderings-/PWA-grindar är fortfarande öppna.
Gamla Next-appen och dess separata Vercel-projekt fortsätter köras parallellt.
[Byggning, körning och gränser](../../frontend/README.md).

## ADR-016: Aktuell Auth-status genom leverantörsadapter före pilot

Implementationsval 2026-10-19 inom användarens uppdrag för målmiljö/Auth:
behåll lokal asymmetrisk JWT-verifiering och lokala konto-/sessionsspärrar.
Kontrollera också aktuell session via samma Supabase-issuers `/user` med
bearer-token och publishable key. Provideradaptern ligger bakom
`ProviderSessionVerifier`; verksamhetsschema och Liquibase förblir portabla.
Ingen Auth-tabellåtkomst, ägaröverföring, service-role eller adminnyckel krävs
av runtime. Auth-admin används endast av opt-in-provet för syntetiska konton.

Läsning kontrolleras före verksamhetsåtkomst; skrivning också efter radlås.
Kända inaktiva tokens ger 401. Teknisk osäkerhet ger 503/no-store, utan retry,
positiv sessionscache eller fallback. Detta gör Auth-tillgänglighet och latens
till ett beroende för verksamhetsanrop. Revokering efter sista kontrollen kan
inte återkalla pågående/committat arbete. Leverantörens sessionstidsgränser antas
inte få starkare garantier än de som verifieras med riktig refresh/livscykel.

Lokala tester styrker adapterbeteendet, inte driftens implementation av `/user`.
Verkligt `TargetAuthIT` för utloggning, spärr/radering och tidigare JWT måste
passera före pilot. Om det inte gör det förblir aktivering blockerad tills
en verifierad livscykelmekanism finns. Se [målmiljö och körning](target-auth-lifecycle.md).

## ADR-015: Activities-modul och tydlig Kotlin-filstruktur

**Beslut 2026-10-19 på användarens instruktion:** första verksamhets-API:ts
modul heter `activities` och äger aktiviteter samt deras kallelser och svar.
Det ersätter namnet `participation` och den preliminära uppdelningen i ADR-002
för det nu implementerade flödet. `InvitationService` är en tjänst inom modulen,
inte en egen modul. `identity` äger verifierad aktör, konto/session och familjeåtkomst.
Beroendet är `activities` → `identity`; interna repositories delas inte mellan moduler.

Tjänster har suffixet `Service`. Varje moduls interna databasmodeller ligger i
`Entities.kt` och repository-interface i `Repositories.kt`. DTO:er separeras från
tjänstelogik; deserialisering och feltyper har egna filer. Paketnamn, imports,
Springdoc-skanning och Modulith-test följer `activities`. HTTP/JSON/OpenAPI,
databasnamn och migrationer ändras inte av denna omstrukturering.

## ADR-014: Ingen inloggningssession i affärshistoriken

**Beslut 2026-10-19 på användarens uttryckliga instruktion:** kallelsesvarens
historik sparar konto-ID, tid, kanal, tidigare/nytt svar och revision, men inget
`session_id`. Detta ersätter sessionsfältet i ADR-013:s historikmodell.

Liquibase-steg 005 tar bort endast `invitation_history.session_id`; rader,
konto-ID, revisioner och övriga data bevaras. Repository-modellen och tjänstens
historikskrivning saknar fältet. Konto och inloggningssession verifieras fortsatt
för varje anrop och lokal sessionsspärr ligger kvar i autentiseringslagret.

Framtida separat teknisk audit-loggning kan läsa `session_id` från den aktuella,
verifierade JWT-tokenen i Spring Security. Ingen audit-logg eller tokenlagring
införs nu. Steg 005 och nya runtime-versionen ska aktiveras tillsammans; äldre
runtime försöker skriva den borttagna kolumnen.

## ADR-013: All svarslogik i Spring Boot-tjänsten

**Beslut 2026-10-19 på användarens uttryckliga instruktion:** all affärslogik för
verksamhets-API:ts kallelsesvar ska synas i Spring Boot. Även transaktionen ska
ägas deklarativt av en `@Service`, inte av en manuell transaktionshjälpare.
Detta ersätter trigger-/revisionskontextdelen av ADR-011/012.
Sessionsfältet i historiken nedan ersätts av ADR-014.

`InvitationService.respond` är `@Transactional`. Där finns konto/session, familj och
organisation, livscykelkontroll, normalisering av kommentar, pending-återställning,
svarstid, revisionsökning, historik och signalversion. Historiken får verifierat
konto/session som vanliga fält. Identiskt tillstånd skriver ingenting. Kommentar-
ändring bevarar svarstiden och ökar inte signalversionen. Läsmetoden använder
`@Transactional(readOnly = true)`. Controllern översätter endast HTTP och DTO:er.
Ingen produktionskod använder TransactionTemplate eller transaktionslokala
identitetsinställningar längre.

Alla skrivare låser aktivitet före kallelse med genererade repository-frågor.
Aktivitetslåset skyddar mot samtidig inställning/ändrade tider och serialiserar
skapande/ökning av aktivitetens gemensamma signalrad. Svar på olika kallelser
för samma aktivitet serialiseras därmed också; olika aktiviteter är oberoende.
`clock_timestamp()` hämtas efter låsen för korrekt tid efter låsväntan.
Svar, revision, historik och signalversion sparas via Spring Data JDBC-repositories
i samma transaktion; varje fel återställer samtliga skrivningar.

Liquibase-steg 004 tar bort `invitation_guard`, `invitation_record` och deras
funktioner `guard_response`/`record_response`. Efter samtliga steg finns inga
egna databasfunktioner, procedurer eller verksamhetstriggers i `forena`.
Tidigare steg är oförändrade för uppgradering och befintliga svar/historik/
signalversioner bevaras. Nycklar, FK, NOT NULL, UNIQUE och CHECK-constraints
behålls som dataintegritet, utan automatiska sidoeffekter.

Runtime behöver nu skriva svarstid/revision, infoga historik samt läsa/infoga/
öka signalversionen. Historiken kan inte uppdateras/raderas, kallelsens identitet
kan inte ändras och rollen får varken DDL eller schemaägarbehörighet.
`UPDATE(status)` på aktivitet krävs av PostgreSQL för `SELECT FOR UPDATE`;
repositoryt exponerar ingen aktivitets-skrivmetod. Inga klientgrants införs.
En enda native `@Query` återstår: PostgreSQLs inbyggda klocka, ingen affärsregel.

Steg 004 och den nya runtime-versionen hör ihop: stoppa äldre API-runtime före
migreringen och starta den nya efteråt. Äldre kod förutsätter triggers och ska
inte användas mot steg 004. API:t är ännu inte driftsatt; ingen molndatabasändring
görs i denna leverans. Gamla appens funktioner/triggers berörs inte.

## ADR-012: Behörighet i Kotlin, ingen RLS i verksamhets-API:t

Trigger-/revisionskontextdelen nedan ersätts av ADR-013.

**Beslut 2026-10-19 på användarens uttryckliga instruktion:** ta bort RLS för
Spring Boot-verksamhets-API:t så att åtkomstreglerna syns i Kotlin. Detta ersätter
RLS-delen av ADR-010/011 för det privata `forena`-schemat, inte gamla appens RLS.

`ActorTransactions` kontrollerar konto och lokal sessionsspärr. `FamilyAccessService`
härleder aktiva egen-/målsmanskopplingar för verifierat subjekt och organisation.
`InvitationService` avgränsar läsning till dessa personer, nekar främmande aktiviteter,
kontrollerar skrivrätt före radlås och igen efter låset. Organisation/person
följer den oföränderliga kallelsenyckeln, inte klientens body eller JWT-metadata.

Liquibase-steg `api-003-application-authorization` tar bort policyer, stänger av
RLS och tar bort `can_act_for`. Tidigare steg ändras inte. Schemat är fortsatt
privat och får inte exponeras i Data API; PUBLIC och eventuella Supabase-
klientroller saknar åtkomst. Runtime får inga utökade skrivrättigheter.

Integritets-/revisionsloggningstriggers behålls: aktivitetslåset skyddar livscykeln,
och svar/historik/signalversion förblir atomära. Den transaktionslokala identiteten
används **enbart för historik**, inte för behörighet. Den sätts först när ett
behörigt, ändrat svar faktiskt ska sparas; läsningar, nekade svar och identiska
upprepningar sätter ingen databaskontext. `clock_timestamp` används fortsatt för
tidsregler efter låsväntan. Detta är två små tekniska repository-frågor, ingen
handskriven CRUD. Att flytta även revisionsloggningen från triggers är separat.

Databasrollen är nu en betrodd backendroll med läsning över familjegränser;
direkt SQL är ingen användarbehörighetsgräns. HTTP-tester måste verifiera familj,
organisation, återkallade kopplingar och spärrade sessioner utan hjälp från RLS.

## ADR-011: Spring Data JDBC för verksamhets-API:t

RLS-/identitetsdelen nedan ersätts av ADR-012.

**Beslut 2026-10-19 på användarens instruktion:** verksamhets-API:t använder
Spring Data JDBC och smala `Repository`-interface. Detta ersätter ADR-003:s val
av handskriven CRUD med JdbcClient/JdbcTemplate för `backend/api`. Spring Boot
4.1.0:s BOM låser Spring Data JDBC/Relational till 4.1.0; ingen JPA införs.

Läsningar, existenskontroller och svarsskrivning använder genererade frågor.
Sammansatta familjenycklar mappas med `@Id`/`@Embedded`. Svar låses med
`@Lock(PESSIMISTIC_WRITE)` på en härledd fråga. `@ReadOnlyProperty` hindrar ORM-
uppdatering av identitet, svarstid och revision; databastriggers äger dessa fält.
Applikationstjänsten äger fortsatt transaktionen, familjekontroll och felöversättning.

Två PostgreSQL-specifika `@Query`-metoder behålls i `DatabaseSessionRepository`:
transaktionslokal `set_config` för verifierad identitet och `clock_timestamp`
för livscykelkontroll. De saknar härledd CRUD-motsvarighet. Det finns ingen
JdbcTemplate/JdbcClient eller handskriven CRUD i API:ts produktionskod, men detta
är **inte** ett påstående om att all SQL försvinner: Liquibase/RLS/triggers och
SQL för negativa säkerhetsprov ligger kvar. M21/M22-teknikprovets specialiserade
registry-/worker-SQL är fortsatt separat och ingår inte i denna repository-flytt.

## ADR-010: Ren start för verksamhets-API:t, inga gamla testdata

RLS-delen nedan ersätts av ADR-012; beslutet om ren databas gäller fortsatt.

**Beslut 2026-10-19 på användarens uttryckliga instruktion:** gamla Förena-
projektet innehåller bara testdata och behöver inte datamigreras. Ny backend
får ett tomt privat `forena`-schema och egen Liquibase-historik. Ingen import,
UUID-mappning eller överföring av gamla tabeller, triggers, köer eller testkonton
ingår. Supabase är fortsatt mål för PostgreSQL/Auth enligt ADR-008/009.

Detta ersätter första flödets övergång genom samma gamla verksamhetsdatabas
i ADR-007 och tidigare M05/M07-plan. Gamla frontend/kanaler ligger kvar tills
motsvarande funktioner kan aktiveras i den rena miljön. Det nya API:t får aldrig
skriva till den gamla databasen som reserv. Att gamla data inte importeras ger
ingen rätt att radera det gamla projektet eller ändra dess Auth-inställningar.

Första implementationen finns i `backend/api`, separat från M21/M22-provet.
Läsning och svar, familje-RLS, livscykellås och atomär revisionshistorik ingår.
En beständig signalversion sparas, men full signalreaktion, Auth-livscykel,
provisionering av verksamhetsdata, Next-adapter och driftaktivering återstår.
Se [första flödet](first-flow.md). Vercel-lagringsvarningen motiverar att denna
leverans byggs och provas lokalt utan nya molndeploys.

## ADR-009: Vercel + Supabase är aktuell inriktning

**Beslut 2026-10-18 (M22F):** fortsätt med Vercel för app/backend och Supabase
för PostgreSQL/Auth/Cron. Google Cloud-kopplingar, inklusive Pub/Sub, Cloud Run,
Cloud SQL, Firebase och GCP-infrastruktur, utvärderas först när ett konkret
hinder i Vercel/Supabase-lösningen har dokumenterats. Ingen parallell GCP-
utvärdering eller obligatorisk jämförelse ingår i aktiva uppgifter. M08, M12
och M18C är vilande alternativ. Tidigare GCP-formuleringar nedan gäller endast
om detta beslut senare omprövas. M22G verifierar pilotgrindarna i vald lösning;
det är inte ett automatiskt hostingbyte om en kontroll ännu saknar bevis.
M22F:s [resultat](m22-recovery-results.md) dokumenterar lokal återtagningskapacitet.
Produktionsaktivering återstår och kräver verksamhetsflöde, auth och behörigheter.

### Tidigare prov och beslutsunderlag

Efter diskussion om samordning och kostnad provas Vercel med Kotlin/JDK 26
som container i det isolerade projektet `forena-kotlin` (M21). Supabase behålls
för PostgreSQL/Auth. Detta är ett hostingprov, inte ett bevisat produktionsval.
Cloud Run och Firebase-flytt är inte förutsättningar för provet; nuvarande
Next.js/Vercel fortsätter. Utvärdera framför allt beständigt arbete efter
HTTP-response och återtagning efter abrupt instansförlust. Inget dokumenterat
Java-lifetime-hook har fastställts. Observerat beteende räcker inte som garanti.

[Resultatet från M21](vercel-probe-results.md) visar 10 s slutförande men inte
60 s inom observationsfönstret. Beständig återtagning efter verklig JVM-krasch
fungerade under aktiv request. M22 måste verifiera säker väckning från noll,
instanskonkurrens, region, kallstart och kostnad före slutligt hostingbeslut.
[M22:s första del](m22-results.md) verifierar fra1 i senare runtime-loggar och
lokal samtidig återtagning med två JVM:er. Ett aktivt HTTP-anrop slutförde även
60 s arbete efter inaktivitet i ny Vercel-JVM.
[M22A](m22-scheduler-results.md) bevisar nu verklig Supabase Cron-väckning med
1/60 s arbete, senare anrop utan dubbletter och ett kontrollerat HTTP-timeoutfall.
Det är fortfarande inget produktionsval: pg_net:s köheaders kan läsas av alla
direkta SQL-inloggningar och dess PUBLIC-grants kan inte ändras av postgres.
Data API-kontrollen gav först 503/PGRST002. [M22B](m22-isolation-results.md)
förklarar det med avsiktligt avstängt Data API och verifierar 13 HTTP-fall med
en tillfälligt exponerad syntetisk fixtur. Data API behålls avstängt i Kotlin-
testprojektet som använder JDBC; det ordinarie Förena-projektet ändras inte.
SQL-kontonas åtkomst till pg_net kvarstår oavsett API-avstängning. Före produktion
krävs bedömning av gemensam credentialtillit för SQL-konton eller schemaläggning
med credentials utanför databasen; inget av alternativen aktiveras här.
Modulith 2.1.0:s
predicate-återtag läser alla ofullständiga poster och behöver begränsas före
pilot. Ingen plattforms- eller versionsändring görs automatiskt.

[M22C](m22-crash-results.md) verifierar nu verklig JVM-död före effekt och efter
committad effekt men före Modulith-kvittens. Supabase Cron återtog båda fallen
i nya JVM:er med en slutlig effekt och kvittens. Två samtidiga moln-HTTP-workers
valde samma publicering; separata konkurrerande JVM:er verifierades lokalt.
Felinjektionen är en SQL-styrd teknikprovsmekanism, inte en produktionsfunktion.
Cron/åtkomst är avstängda och provcredentials neutraliserade, men slutlig
radrensning blockerades först av leverantörsverktygets requestState-fel och
slutfördes med nollkontroll i M22E.
[M22D](m22-registry-results.md) inför nu avgränsad worker-materialisering via
repository-SPI utan egna statusskrivningar. Manuellt teknikprovsåtertag och
shutdown-diagnostik är fortsatt obegränsade; totalbudgeten är mjuk och SQL-scan
kan växa med kön. [M22E](tasks/m22e-load-cost.md) verifierar last/anslutningar och
kostnad innan hosting-/schedulerbeslut.
[M22E:s underlag](m22-load-cost-results.md) rekommenderar nu Vercel + Supabase
med Supabase Cron för en förening först, villkorat av pg_net-tillit, planvillkor,
beta/skalning och återhämtningskapacitet. Pro behövs inte för Supabase Cron.
M22C:s exakta radrensning är verifierat avslutad. Inget produktionsval, köp eller
hostingbyte genomförs; M22F/G är grindar före pilot. Cloud Run kvarstår som
alternativ om kraven inte kan uppfyllas.

## ADR-008: Behåll Supabase PostgreSQL — aktuell planeringsinriktning

Efter diskussion om Cloud SQL:s grundkostnad planeras backendmigreringen med
Supabase som fortsatt databasvärd. Detta ersätter kravet på Cloud SQL som nästa
mål i ADR-003/007 och tidigare kostnadsscenarier. Cloud SQL-dataflytt M12 är
vilande och kräver ett nytt uttryckligt behovs- och kostnadsbeslut.

”Ren PostgreSQL” betyder att verksamhetskoden använder JDBC/SQL, vanliga
constraints/transaktioner och Liquibase för de objekt den äger. Det betyder
inte att Supabases Auth-schema ska tas över eller att alla befintliga triggers
ska raderas. Auth fortsätter via Supabases inbyggda API:er. Databasens nuvarande
RLS, auth.uid(), auth.users-kopplingar, RPC:er och cron måste översättas och
testas före avveckling. M05:s övergång behåller skydden; M20 verifierar den
slutliga verksamhetsmodellens portabilitet mot vanlig PostgreSQL.

M02 använder separata applikationsscheman och klart migreringsägarskap; Supabase
äger auth/storage och befintliga objekt har kvar sin migrationsägare tills en
uttrycklig överlämning skett. Backendkontot får inte ha superuser/BYPASSRLS.
Kontoidentitet verifieras med JWT, familj/lag/klubb/roller i applikationstjänsten.
RLS kan fortsatt vara extra skydd, utan att affärsregler kräver Supabasefunktioner.

M22G verifierar TLS/certifikat, stödd anslutningsväg och JDBC-poolning från
Vercel, regionavstånd, IP-/IPv6-behov, anslutningsgränser och trafikavgifter.
Välj direktanslutning eller pooler utifrån faktisk kompatibilitet med
transaktioner, prepared statements och transaktionslokal kontext; anta inte att
alla poolerlägen passar. Poolstorlek × maxinstanser måste rymmas i databasens
anslutningsbudget. Inget kostnadspåstående ersätter dessa prov.

Supabase har också en löpande kostnad och Auth-projektet måste behållas.
Tidigare Cloud SQL-budget är nu ett jämförelsescenario. Faktisk Supabaseplan,
projekt/compute, backup/PITR, trafik och region behöver verifieras innan vi
påstår en besparing. Ingen produktion har ändrats genom detta planeringsbeslut.


## ADR-001: Verktygskedja och repo — fastställt

**Uppdatering 2026-10-19 på användarens instruktion:** verksamhets-API:t i
`backend/api` använder Java **25**, inklusive Kotlins bytekodsmål och
`BP_JVM_VERSION` i Spring Boots imagekonfiguration. Oracle-leverantör och exakt
JDK-patch krävs inte längre för API:t. CI/release använder Temurin 25 och
release-imagen får samma JDK som paketeringen. Teknikprovets tidigare resultat
och Java 26-konfiguration behålls separat. Övriga versionsval nedan är oförändrade.

Ursprungligt teknikprovsbeslut:

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

För första verksamhets-API:t ersätts activities/participation-uppdelningen nedan
av den gemensamma `activities`-modulen enligt ADR-015. Övriga gränser är hypoteser.

Ett Maven-projekt och en backendtjänst på Vercel enligt ADR-009. Verksamhetspaket under exempelvis
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
