# Migreringsstatus

Uppdaterad 2026-10-19. Inventeringsbas: `c379a96719490bc4edbfcb0a4ee7a1947684ddce`.
Planens uppgifter finns i [uppgiftsindex](tasks/README.md).

## Första verksamhets-API:t: för granskning, ren start

Leverans på `feat/participation-api`, från main `1b60bb8b5978041f469f024f100432c72dbd44d4`.
[ADR-010](decisions.md) fastställer användarens beslut att inte importera gamla
projektets testdata. Nytt privat `forena`-schema och egna Liquibase-migrationer;
`backend/api` är en separat app från M21/M22-provet.

Ändrat beteende: API för familjens kallelser och för att svara, ändra eller
återställa svaret. Explicit familjefilter plus RLS, serverbyggd transaktions-
identitet, JWT-verifiering, konto-/sessionsspärr, livscykellås och atomär
svarshistorik/signalversion. OpenAPI och reproducerbart genererade TS-typer.
CI får ett separat obligatoriskt API-jobb; befintliga kontroller behålls.
Se [första flödet](first-flow.md) och [körinstruktionerna](../../backend/api/README.md).

Lokal verifiering för leveransen:

- API Maven `verify`: 19 tester, inga fel eller överhoppade. Riktiga ES256/RS256-
  signaturer och lokal JWKS-server, HTTP, PostgreSQL 17.6/Testcontainers med
  begränsad runtime och schemaägare, RLS, familje-/klubbgränser, rollback,
  samtidiga skrivare/inställning, historik och Modulith-struktur.
- Tom Liquibase-installation och uppgradering från det nya identitetsschemat,
  validate/återkörning, bevarade syntetiska data och negativa constraints ingår.
- Paketerad JAR: verklig bootstrap, migreringsläge två gånger utan HTTP,
  runtime utan ägarcredential, health, bearerkrav och SIGTERM verifierade lokalt.
- Befintliga Vitest: 131 filer, 1 065 tester godkända. Typkontroll, lint och
  produktionsbygge godkända lokalt. Bygget krävde egna lokala dependencies och
  subprocessrättigheter; tidigare miljöfel är lösta, inga kontroller avstängda.
- Springdoc 3.1.1 genererar OpenAPI via riktig bearer-skyddad HTTP från
  REST-controllers och typade DTO:er; required/nullable, enumvärden och typade
  felkontrakt verifieras. Export och TS-generation jämförs med Git i CI.
- Teknikprovets controllers har också data classes för status och fel med
  bevarade JSON-fält. Maven `verify`: 45 tester, inklusive HTTP-kontraktsprov.
- OpenAPI-generation utan diff och CI-jobbens beroenden verifierade.

PR-förberedelse: API-konfigurationen har bytts från `application.properties`
till `application.yaml` med samtliga 24 värden bevarade. Ren Maven-verifiering
och prov av den paketerade appen körs även med YAML. Automatiska Vercel-byggen
är avstängda för just `feat/participation-api` i webb- och provkonfigurationen
på grund av lagringsvarningen; GitHub CI behåller samtliga obligatoriska jobb.
[PR #112](https://github.com/johkin/forena/pull/112) innehåller också springdoc-
integrationen och typade svar för alla egna REST-controllers. Okända bodyfält,
fel kommentartyper och numeriska enumvärden nekas; utelämnad kommentar och null
behåller olika betydelser. CI-status för den publicerade committen redovisas i PR:n.

Inte aktiverade: Vercel-deploy, verklig Supabase-inloggning,
passkey/OAuth/MCP, browser → Next-adapter eller full signalworker. Gamla
Supabase-migrationer är oförändrade; inget reset/pgTAP körs mot gamla projektet.
Det nya schemat verifieras med Liquibase/Testcontainers, inga molndatabaser har
ändrats. Ingen dataöverföring, gammal projektradering eller nya Vercel-byggen.

M02/M03/M05/M07 är delvis levererade; helheten får inte markeras färdig.
Nästa steg är nya syntetiska verksamhetsdata, verifierad Auth-livscykel,
full signalreaktion och därefter Next-adapter/browserprov i den rena miljön.
Extern Auth-utloggning/radering kan inte lovas slå igenom omedelbart med endast
lokal JWT-verifiering: koppla lokal spärr eller besluta tokenlivslängd före pilot.
Vercel-lagringsvarningen behöver hanteras före driftaktivering.

## M00: Nuläge, beslut och migreringsplan

Status: dokumentationsleverans färdig för granskning på
`docs/spring-migration-plan`, skapad från uppdaterad `origin/main`.
Ingen backendimplementation, produktionsändring eller dataflytt ingår.
PR-/CI-status redovisas i leveransrapporten; denna text påstår inte att CI gått.

Ändrat beteende: inget runtimebeteende. Repot får gemensamt migrationsunderlag,
självständiga uppgifter, beslut, första flödets acceptans och en kostnadsmodell.
Verifierat nuläge hålls isär från målarkitektur och obesvarade driftfrågor.

Genomförd verifiering:

- Repots enda hittade `AGENTS.md` och relevanta arkitektur-/säkerhets-/driftdokument
  lästa; aktuell main-SHA kontrollerad före branchskapande.
- Källkodsinventering: 98 SQL-migrationsfiler, 43 SQL-testfiler och 131 TS/TSX-
  testfiler. Statisk SQL-referenslista beskriver historiken, inte effektiv katalog.
- Isolerat verktygskedjeprov på JDK 26.0.2.1: Boot 4.1.0, Kotlin 2.4.20,
  Modulith 2.1.0; nio tester godkända, inga fel eller överhoppade. Se
  [exakt provomfattning](versions.md) och [reproduktion](toolchain-probe.md).
- Supabase Terraform-provider granskad i offentlig källa vid låst commit;
  passkey- och MCP OAuth-konfiguration är ännu inte verifierat providerstöd.

Dokumentkontroll godkänd: 34 Markdown-filer, 237 lokala länkar, 231 grupper
med SQL-radreferenser, 22 uppgiftsbeskrivningar inklusive beroendegraf samt
refererade befintliga filer. Kostnadssummor och whitespace kontrollerade.
Appens test/typecheck/lint/build och databasreset körs inte enbart för textändringen,
i enlighet med AGENTS.md. Dessa kontroller är **inte körda lokalt för M00**.
Det isolerade JVM-provet ersätter inte deras resultat.

Begränsningar: ingen läsning av driftkonton/produktionsdata, inga externa
JWT/passkey/OAuth-/kanalflöden eller Docker-/databasprov. Inga verifierade
aktuella Google-priser eller regionlistor på grund av nätpolicyn.
Kostnadsbilden är en antagandebaserad budget, inte en offert.

Tre separata agentuppdrag genomfördes: källkodsinventering (read-only), isolerat
verktygskedjeprov (endast temporär katalog) och kostnads-/regionunderlag (egen
fil). De var underuppdrag till denna leverans, inte egna GitHub Issues eller
långlivade migreringsbrancher. Övriga uppgifter är dokumenterade, inte delegerade.

## Reviderad databasriktning

Planerings-PR: [#97](https://github.com/johkin/forena/pull/97), mergad som `ce0d23a`.
Supabase PostgreSQL behålls enligt ADR-008. Cloud SQL är ett senare alternativ,
inte ett beroende för backend eller frontend. Befintlig säkerhet behålls tills
motsvarande backendregler är testade. M20 ger separat verifiering av portabilitet.
Inga databaser har ändrats eller provisionerats; inga nya prisuppgifter verifierats.
Tidigare budget och M00:s kontrollantal avser första planversionen.
Den reviderade planens 209 lokala länkar, 23 uppgiftsbeskrivningar och
beroendegraf har kontrollerats; Cloud SQL-uppgiften blockerar inte backendpiloten.
Inga apptester kördes lokalt för denna rena textändring.

M21:s teknikprov startades på `spike/vercel-kotlin` från `ce0d23a` på main.
Det testar delar av M01/M02/M06; inga beroende PR:er staplas på planeringsbranchen.
Maven Wrapper, låst container, 9 backendtester och CI-jobb finns nu i M21:s
separata ändring. Lokal Maven-verifiering och appens tester/typecheck/lint/build
är godkända. Publicerad Vercel-preview och Supabase-JDBC-prov är körda, se
[provrapporten](vercel-probe-results.md) med källmanifest och exakta resultat.
10 s efter HTTP-svar lyckades; 60 s blev inte klart inom 90 s. Verklig JVM-krasch
återtogs av ny instans, med en effekt efter upprepat återtag. Hostingbeslutet är
fortfarande öppet. M22 beskriver nästa leveransprov, inte en startad session.

## Nästa ordning

1. M01: grundprojekt med låsta versioner, Maven Wrapper, container och CI samt
   struktur-/modultester. M21 inför ett isolerat bygge; verksamhetsgrundprojektet återstår.
2. M04 och M17 kan inventeras oberoende. M02 och M03 följer M01.
3. M05/M06 förbereder första svarflödet. M07 flyttar hela flödet genom ny backend.
4. M22G verifierar Vercel/Supabase före pilot. M13 är backendpilot på samma
   databas. M08, M12 och M18C är vilande tills ett konkret hinder dokumenterats.

Övriga verksamhetsuppgifter i indexet är planerade. M21 är ett genomfört teknikprov,
inte implementering av verksamhetsbackend. M22 följer innan hostingvalet fastställs.
M15A/M15B separerar kanalerna och M18A/M18B/M18C separerar katalogflytt, Vite och hosting. Fler självständiga
uppgifter krävs för kvarvarande verksamhetsflöden innan pilotens cutover-grind.

## Frågor som behöver beslut före respektive aktivering

| Fråga | När krävs svaret? | Nuvarande hantering |
| --- | --- | --- |
| Region och same-origin-stöd | M22G före pilot | Vercel fra1 och Supabase eu-central-1; routing verifieras i vald lösning |
| SLO, RPO, RTO och backup/PITR | Före produktionsbudget/aktivering | Verifiera stöd och pris i vald Supabaseplan; Cloud SQL HA är endast jämförelse |
| Faktisk signeringsnyckel, audience/scopes, kontorevokering | M03 före auth-aktivering | Enbart teststub verifierad hittills |
| Befintlig domän/RP-ID och preview-origins | Före domän-/hostingbyte | Behåll befintlig identitetsleverantör och ändra inte RP-ID utan plan |
| Auth passkeys/OAuth Terraform-stöd | Före automatisering av dessa fält | Låst providerkälla granskad; faktisk publicerad release/API-roundtrip återstår |
| SSR/förgenerering och publik datafärskhet | M17 före Vite | Next.js kvar tills beslut och prov |
| Tillåten livslängd för äldre frontend/API | Före brytande API-ändring | Additiva kontrakt och kompatibilitetsadapter under övergången |
| Pilotklubb och routingfönster | M13 efter testrepetition | Ingen produktionspilot vald eller bokad |

## Mall vid nästa avslut

```text
Uppgift / PR / commit:
Ändrat beteende och berörda filer:
Verifiering (godkänt / fel / överhoppat / ej kört, exakt revision/miljö):
Begränsningar och aktiveringsstatus:
Nya beslut och följduppgifter:
Nästa beroende uppgift:
```

## M22: genomförd första del

PR #98 är mergad som `2e0af8f`. Fortsättningen på `test/vercel-durable-delivery`
utgår från denna main. [Delrapporten](m22-results.md) registrerar verifierad
fra1-runtime i Git-previewn och ett reproducerbart lokalt konkurrensprov med
två separata JVM:er. Tre omgångar gav en effekt och noll oavslutade publiceringar.
Krasch-/omstartsprovet passerade också. CI aktiverar samma två-JVM-prov.

Även verkligt långt återtag är nu godkänt: den ursprungliga PROCESSING-posten
och en ny 60-sekundershändelse efter 90 s utan apptrafik återtogs i ny JVM,
med cirka 76 s aktiva HTTP-anrop. Upprepat återtag gav en effekt och noll
oavslutade poster i båda fallen. Resultat och exakta deployment-/klienthashar
finns i delrapporten. Observationskontot har endast läsrättigheter; LOGIN är
avstängt och den tillfälliga testklienten är stoppad. Användaren har godkänt
credentialöverföring för detta och kommande isolerade test.

Vercel Cron kräver production-deployment och Hobby stödjer endast dagliga jobb.
Ingen planuppgradering eller cronaktivering har gjorts. Nästa avgränsade del
är ett workeranrop med tidsbudget och faktisk schemalagd väckning, exempelvis
med Supabase Cron. Molnkonkurrens, felpunkt efter effekt och full kostnadsbild
återstår också; M22 är inte avslutad och hostingbeslutet är öppet.

## M22A: schemalagd worker

Bas `2c3e3a6` (PR #99 mergad), branch `test/supabase-cron-worker`.
[Rapport och överlämning](m22-scheduler-results.md) samt
[uppgift](tasks/m22a-scheduled-worker.md) beskriver denna separata leverans.
Worker med egen token återtar högst två valbara publiceringar under mjuk budget
och skyddar färska försök. Lokal verifiering: 25 JUnit-tester, verklig JVM-krasch/
omstart, två-JVM-konkurrens samt 1 065 frontendtester/typecheck/lint/build.

Verklig Supabase Cron väckte fra1-previewn efter minst 150 s utan användartrafik.
1/60 s-händelser fick en effekt och registerkvittens var. Första HTTP-sändaren
fick avsiktlig timeout; JVM:en fortsatte och slutförde arbetet. Senare Cron-
anrop skapade inga dubbletter. Detta är inte ett nytt JVM-dödsprov.

Städning verifierad: inga provjobb, Vault-poster, köade requests, HTTP-responser
eller inställningar; observationskontot NOLOGIN, testklienten stoppad och
previewlänken återkallad. Kvar finns tomma privata hjälptabeller/funktion och
installerade pg_cron/pg_net, samt preview och syntetiska effekter.

Hosting är fortsatt öppet: pg_net:s HTTP-credentials är synliga för direkta
SQL-loginroller; Data API-kontrollen gav 503/PGRST002; predicate-API:t läser hela
registret före filter. Dessa gränser, faktisk schemalagd JVM-krasch, effekt/kvittens-
felpunkt, last/anslutningar och kostnader måste hanteras före verksamhetspilot.
Ordinarie Förena berörs inte.

## M22B: Data API och scheduleråtkomst

Bas `e43d752` (PR #100 mergad), branch `test/scheduler-isolation`.
[Rapport](m22-isolation-results.md), [uppgift](tasks/m22b-scheduler-isolation.md)
och [bevis](evidence/m22-isolation.json) skiljer API-exponering från SQL-grants.
Användaren bekräftade att Data API avsiktligt stängts av för JDBC. Detta
förklarar loggarnas pg_pgrst_no_exposed_schemas och 503/PGRST002; inställningen
är återställd och ska behållas. Ingen ändring av ordinarie Förena.

13 HTTP-fall verifierade med en tillfälligt exponerad syntetisk RLS-fixtur:
positiv läskontroll, nekad skrivning och 406/PGRST106 för privata GET-/POST-
scheman och scheduler-RPC. SQL-markören kunde läsas som anon/authenticated;
runtime/observer verifierades med effektiva katalogprivilegier, utan att ändra
deras SET FALSE eller NOLOGIN. Inget autentiserat användar-JWT-prov kördes.
Sex lokala Pythonregressionstester och offlinebeviskontroll godkända; CI kör
dessa också. App-/Kotlin-/Liquibasekällor är oförändrade i denna del.
Även befintliga 1 065 frontendtester/typecheck/lint/build godkända lokalt.
Ingen lokal Maven-körning eller databasreset för oförändrat applikationsschema;
CI:s befintliga DB-/Kotlin-kontroller behålls.

Städning verifierad 2026-10-18 17:08:35 UTC: fixtur borttagen, API-override
borta, 0 jobb/köposter/responser, observer NOLOGIN. Två providerbootstrap-poster
för tillfällig fixtur och borttagning finns i testets migrationshistorik.
Supabases säkerhetsrådgivare gav inga lints; pg_net:s PUBLIC-grants kvarstår.

Slutsats: JDBC och avstängt Data API räcker för nästa isolerade backendprov.
pg_net innebär fortfarande gemensam HTTP-credentialtillit för SQL-inloggningar.
Produktionsaktivering kräver ett separat val av tillitsgräns eller extern
schedulercredential; ingen ny leverantör eller plan väljs i denna uppgift.
Nästa avgränsade uppgift är [M22C](tasks/m22c-scheduled-crash.md), inte ännu körd
eller delegerad. Registry-/lastprov och kostnads-/hostingbeslut återstår i M22.

## M22C: faktisk schemalagd JVM-krasch

Bas `175fc5e` (PR #101 mergad), branch `test/scheduled-jvm-crash`.
[Rapport](m22-crash-results.md), [uppgift](tasks/m22c-scheduled-crash.md),
[molnbevis](evidence/m22c-scheduled-crash.json) och
[lokalt bevis](evidence/m22c-local-crash.json) beskriver körningarna.

Verifierat lokalt: 29 JUnit-/PostgreSQL-tester, struktur/modultest, riktiga
JVM-exit 137 före effekt och efter commit men före leveranskvittens, tre
två-JVM-workeromgångar samt 1 065 frontendtester/typecheck/lint/build.
Samma låsta verktygskedja används; Liquibase probe-002-faults inför SQL-styrda
förbrukningsmarkörer. Workertokenen får ingen ny endpoint eller ID-styrd krasch.
Runtime kan förbruka/ändra konsumtionsmarkörer via SQL men kan inte skapa en
felpunkt eller ändra dess ID/fas; detta skyddar inte mot komprometterad JDBC.

Moln: Supabase Cron väckte fra1-previewn utan användartrafik efter minst 150 s
och båda avsiktliga JVM-avsluten bekräftades av Vercel. SQL verifierade 0
respektive 1 effekter efter krasch och senare en slutlig effekt och kvittens
för båda. Två överlappande HTTP-workers valde samma publicering; en ny
lyssnarstart observerades i den rundan, inte två bevisat olika moln-JVM:er.
Senare anrop ändrade inte effekter/försök. Cron stängde av sig vid tio anrop.

Städning **delvis klar**: 0 jobb, 0 köposter, 0 oavslutade publiceringar,
preview-share återkallad, klienter stoppade, migrationskonto NOLOGIN utan
medlemskap och utgånget lösenord. Tabellägare är forena_probe_migrator.
Data API är fortsatt avstängt och kommande previewförval har crash=false.
Alla tre Vault-värden är neutraliserade och verifierade som ofarliga markörer.

Radrensning blockerad: tre städanrop returnerade Invalid or expired
requestState, inget uttryckligt säkerhetsavslag. Kvar finns 3 neutraliserade
Vault-poster, 2 förbrukade fault-rader, 10 HTTP-responser/transportkorrelationer
och 1 utgången inställning. [Exakt städ-SQL](../../scripts/probe/m22c-cleanup.sql)
är redo och ska verifieras innan dessa provnamn återanvänds. M22C:s tester är
godkända, men uppgiftens städning är inte avslutad.

Nästa självständiga uppgift är [M22D](tasks/m22d-bounded-registry.md), planerad
och inte delegerad/startad. Den kan börja lokalt när kodbasen mergats; nästa
molnprov måste först passera städgrinden. Last/anslutningar/kostnader och
produktionsmodell för scheduleråtkomst återstår i M22. Ordinarie Förena är
oförändrat och hostingvalet fortfarande öppet.


## M22D: begränsad worker-materialisering

Bas `ad9ac0b` (PR #102 mergad), branch `test/bounded-registry`.
[Rapport](m22-registry-results.md), [evidens](evidence/m22d-bounded-registry.json)
och [uppgift](tasks/m22d-bounded-registry.md).

Workern använder nu ett exakt-ID-read-scope via Moduliths publika repository-
SPI; Modulith äger fortfarande alla claims/statusskrivningar. Låsta versioner
behålls. Per batch om två: en kandidatläsning/två resultatrader och två exakta
publiceringsläsningar/två resultatrader, två deserialiseringar både med 100 och
10 000 extra registry-poster. Lokala tider 228/277 ms är observationer, inte SLA.
SQL-scan/sort är fortfarande köberoende; manuellt provåtertag och bibliotekets
shutdown-diagnostik är obegränsade. Egen read-timeout två sekunder är verifierad
mot låst tabell och återanvändning av poolen, inte en hård totaldeadline.

Verifierat: 36 JUnit-/PostgreSQL-tester, struktur/modultest, två riktiga worker-
krascher före effekt/efter commit samt tre två-JVM-workeromgångar med 10 000
färska registerposter kvar. Alla slutade med en effekt/kvittens och backloggen
orörd. Även äldre lifecyclebaslinje, 1 065 frontendtester/typecheck/lint/build,
sex Pythonregressioner och offlinebeviskontroll godkända. CI kör samma utökade
processprov. Inget nytt molnprov eller ändrat applikationsschema i denna uppgift.

M22C:s dokumenterade rensningshinder kvarstår utan ny molnverifiering; lokal
DB-container är raderad. Nästa självständiga uppgift är
[M22E](tasks/m22e-load-cost.md): last/anslutningar och kostnadsbild före hosting-
och schedulerbeslut. Hostingvalet är fortsatt öppet; ordinarie Förena oförändrat.


## M22E: last, anslutningar och kostnad för en förening

Bas `a9ca451` (PR #103 mergad), branch `test/load-cost`.
[Rapport](m22-load-cost-results.md), [kalkyl](m22-costs.md),
[lokala mätningar](evidence/m22e-local-capacity.json),
[reproducerbar budget](evidence/m22e-costs.json) och [städbevis](evidence/m22e-cleanup.json).
Användaren valde enstaka förening först; Supabase Cron är huvudspåret och
kräver inte Vercel Pro. Inga betalplaner eller produktionsresurser ändrade.

Reproducerbart prov med två riktiga JVM:er: 1 000/10 000/100 000 registry-poster,
EXPLAIN/BUFFERS, 40 korta leveranser med en/två workers, 1,5 s-lyssnare, tvåsekunders
read-timeout, fyra anslutningar fyllda av åtta konkurrerande skrivningar samt
överbudgeterad lyssnare. En slutlig databaseffekt/kvittens per genomförd körning;
extra försök med två workers är observerade. P95 och RSS är lokala små stickprov,
inte molngarantier. Ingen app-/schemaversion ändrad, ingen ny molnlast.

Mätt dränering vid täta anrop är inte cronkapacitet: batch två/minut behöver
minst 50 minuter för 100 poster efter stale-väntan. Det föreslagna pilotmålet
är fem minuter efter stale-gränsen. SQL-scan/sort, pool-/instansbudget och
fördröjda/felande poster behöver fortsatt arbete i [M22F](tasks/m22f-recovery-capacity.md).
Vercel-beta/planvillkor, två samtidiga moln-JVM:er, pg_net-tillit och driftgrindar
ligger i [M22G](tasks/m22g-vercel-pilot-gates.md). Ingen av dem är startad/delegerad.

Kostnadsinriktning: prod cirka 25–30 USD/månad med Supabase Pro/Micro och
Vercel Hobby om villkor/kvoter passar; 45–50 med ett Pro-team. Ständigt aktiv
betald test-Micro tillför cirka 9,6 USD på orgnivå; lokal dev är grundmodellen.
Avgifter/krediter delas per org/team, inte per miljö. Reserv är egen budget,
mejl/AI/domän/add-ons tillkommer. Hobby har liten CPU-marginal i lastantagandet;
kalla teststarter kan överskrida kvoten. Inget nytt abonnemang valt.

M22C:s tidigare rensningshinder är **avslutat**: exakt städ-SQL lyckades;
oberoende kontroll 2026-10-18 21:09:10 UTC visar noll provjobb, kö-/Vault-/fault-/
calls-/settings-/responseposter och oavslutade publiceringar. Historiska M22C-
rapporter/bevis har kvar sina dåvarande observationer med tydlig senare uppföljning.

Lokalt 36 JUnit-/PostgreSQL-tester inklusive struktur/modultest, full kapacitets-
matris, 1 065 frontendtester/typecheck/lint/build, sex Pythonregressioner och
offlinebeviskontroll godkända. CI kör även --quick-kapacitetsvariant och verifierar
kostnadsreproduktionen samt behåller tidigare krasch-/DB-/frontendkontroller.
Ordinarie Förena fortsätter; produktionshosting/pilot är inte aktiverade.

## M22F: begränsad dränering och beständig turordning

Bas `a3ff203` (PR #104 mergad), branch `test/recovery-capacity`.
[Rapport och överlämning](m22-recovery-results.md),
[uppgift](tasks/m22f-recovery-capacity.md),
[krasch-/konkurrensbevis](evidence/m22f-lifecycle.json) och
[timeout-/pool-/SQL-regressioner](evidence/m22f-regressions.json).

Workern läser nu flera små sidor per request, högst 64 starter/256 kandidater
inom mjuk budget. En privat, beständig CAS-markör låter senare kandidater
passera långa ködelar av uppskjutna/felande poster. Modulith äger fortfarande
claims och leveransstatus; ingen parallell outbox eller egen statusskrivning.
Liquibase probe-003-worker-cursor körs separat före ny runtime. Testerna täcker
tom databas, föregående schema med data, förnyad migrering och begränsade grants.

44 JUnit-/PostgreSQL-tester inklusive struktur/modultest godkända, liksom
båda riktiga worker-krascherna och tre två-JVM-omgångar med 10 000 färska
poster kvar. Även timeout, fyra mättade poolanslutningar/åtta skrivningar,
för lång/felande/stillastående lyssnare, 1 065 frontendtester/typecheck/lint/build,
sex Pythonregressioner, offlinebevis och oförändrad kostnadsreproduktion godkända.
Minutprovet klarade 100 korta leveranser på 186,03 s från start, cirka
187,62 s efter stale-gränsen, trots missad tick och 300 blockerande poster.
[Sanerat minutbevis](evidence/m22f-cadence.json) och rapport anger mätgränser.
Supabase CLI saknas lokalt; dess reset/test db är inte körda lokalt.

Aktuellt användarbeslut: Vercel + Supabase är arbetsinriktningen. Google Cloud-
kopplingar utvärderas först vid dokumenterat konkret hinder i denna lösning.
M08/M12/M18C är vilande, inte pilotberoenden. Tidigare statusavsnitts öppna
hostingval och GCP-ordning beskriver historiska skeden och ersätts av ADR-009.
Inga molnjobb, betalplaner, produktionsdata eller befintlig frontend ändrade.
Nästa beroende uppgift är M22G:s isolerade Vercel/Supabase-prov och driftgrindar
på mergad M22F-kod; ingen separat session eller GitHub Issue har startats.
