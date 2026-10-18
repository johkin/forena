# M22A: Schemalagd återtagning på Vercel

Datum: 2026-10-18. Bas: PR #99, mergad som
`2c3e3a60dae8e47f3862f8ca8ca9d4b461341e9a`. Separat branch
`test/supabase-cron-worker` från denna main. Detta avslutar
[M22A](tasks/m22a-scheduled-worker.md), inte hela M22 eller hostingbeslutet.

Senare uppföljning: [M22B](m22-isolation-results.md) förklarar 503 med avsiktligt
avstängt Data API och verifierar schemaavvisning i ett tillfälligt kontrollprov.
Nedan återges M22A:s dåvarande observationer; pg_net:s SQL-gräns kvarstår.

## Ändrat beteende

`POST /api/probes/worker` hittar högst två gamla publiceringar åt gången i
Moduliths befintliga JDBC-register och begär återtag genom Moduliths API.
Ingen ny verksamhetskö eller generell outbox införs. Arbetaren håller HTTP-
anropet aktivt tills de utvalda publiceringarna är kvitterade eller tidsbudgeten
tar slut. Instansdöd lämnar registret beständigt för nästa anrop.

Separat `PROBE_WORKER_TOKEN` får endast köra workerendpointen. Den vanliga
provtokenen får inte köra arbetaren; workertokenen får inte skapa prov eller
köra manuellt återtag. Tom workertoken stänger åtkomsten som förval.
Detta är maskinbehörighet för teknikprovet, inte Supabase-användar-JWT.

Förval: batch 2, mjuk budget 120 s, reserv 5 s och lägsta inaktivitetsålder
120 s. Senaste publicerings-/omleveranstid och senaste försöksstart beaktas.
Arbete vars deklarerade fördröjning plus reserv inte ryms lämnas till senare.
CRASH provas endast manuellt och väljs aldrig av arbetaren. BLOCK frisläpps
avsiktligt av denna syntetiska provworker.

API-resultatet listar selected, completed, unfinished och deferred samt
stopReason. `drained` betyder inga valbara poster i den här rundan; det betyder
inte att alla färska eller pågående publiceringar i databasen är klara.
Arbetaren loggar syntetiska ID:n, actor=isolated-worker och channel=worker-http.

## Verifierad körning

- Deployment `dpl_6zg9xpfoAkMEmFEkhzbqk3p6qaKd`,
  <https://forena-kotlin-1rgvif4i9-johkin.vercel.app>.
- Lokala filer publicerades före commit. [Källmanifestet](evidence/m22-scheduler-source-files.json)
  låser samtliga bygg-/runtimefiler. Containerdigest:
  `sha256:3d5326f8e0ed40d1a56b4b2b91af1d75f52781ad5365df3c29cce9455636e370`.
- JVM-loggarna anger fra1. Databasen och testklienten låg också i Frankfurt.
- Samma låsta Boot 4.1.0, Kotlin 2.4.20, Oracle JDK 26.0.2.1+1-7,
  Maven 3.9.11 och Modulith 2.1.0 används. Inga versionsbyten.
- Supabase Cron 1.6.4, pg_net 0.20.4 och Vault 0.3.1 verifierades i
  endast projektet `forena-kotlin`.

Sista användarliknande appanropet avslutades 16:14:27.798093 UTC. Två BLOCK-
händelser skapades, med 1 s respektive 60 s fördröjning. Därefter stoppades
testklienten och inga fler appanrop gjordes utom från verklig Supabase Cron.
Jobbet tilläts börja först 16:16:57.798093 UTC, efter minst 150 s inaktivitet.

| Händelse | Slutförd effekt, UTC | Registerkvittens, UTC | Slutläge |
| --- | --- | --- | --- |
| `300f15df-974b-44ae-98b4-18e8ad2c125d`, 1 s | 16:17:15.864261 | 16:17:15.875658 | 1 effekt, COMPLETED, 2 försök och 2 JVM-ID:n |
| `c8e44868-5a1f-49f1-be05-ed96e80cbdd2`, 60 s | 16:18:16.009120 | 16:18:16.018084 | 1 effekt, COMPLETED, 2 försök och 2 JVM-ID:n |

Första Cron-anropet kl. 16:17 gavs avsiktligt 1 s HTTP-timeout. pg_net
rapporterade timeout medan Vercels arbetare fortsatte och slutförde båda
publiceringarna. Detta är **inte** ett prov där JVM:en dödades. Cron fortsatte
automatiskt 16:18, 16:19, 16:20 och 16:21 med normala 180 s HTTP-gränser.
Alla fyra svarade 200 utan att återspela de redan valda/kvitterade posterna.
Effektantal och försöksantal förblev oförändrade.

Cron markerade samtliga SQL-körningar succeeded, även den vars HTTP-leverans
fick timeout. Övervakning måste därför följa både cron.job_run_details,
pg_net:s HTTP-resultat och Moduliths register. Jobbets SQL-framgång bevisar
inte affärsslutförande. [Sanerat JSON-bevis](evidence/m22-scheduled-worker.json)
kopplar ihop request-ID:n, tider, effekter och städning.

## Verifiering

Godkänt lokalt: 25 JUnit-tester, varav 16 workerfall, mot Testcontainers
PostgreSQL; strukturverifiering och riktigt Modulith-modultest; verkligt
JVM-exit 137/omstart och konkurrensprov över två JVM:er. Workerfallen täcker
behörighet, FAILED och övergivna PROCESSING, färskhetsgränser, batchordning,
budget/deferred, spärrad kvittens, samtidighet, filtrering och idempotens.

Befintlig app: 131 testfiler/1 065 tester, typecheck, lint och build godkända.
Appens källkod, UI och rotens vercel.json är oförändrade. Provider-SQL
verifierades i uttryckligen avsett testprojekt; ingen databasreset utfördes.

## Säkerhets- och skalningsbegränsningar

**pg_net:s köheaders är läsbara för direkta SQL-inloggningar.** Det verifierades
med has_table_privilege för runtime-/anon-/authenticated-roller och relacl.
Objekten ägs av supabase_admin, och postgres har inte grant option.
REVOKE-försöken lämnade åtkomsten oförändrad trots att SQL-anropet inte gav fel.
Supabase beskriver detta som en [plattformbegränsning](https://supabase.com/docs/guides/troubleshooting/revoking-access-to-pg_net-objects-has-no-effect-0bbc16).
Vault krypterar hemligheten i vila men gör inte den dekrypterade HTTP-kön privat;
se [Supabases beskrivning av köheaders](https://supabase.com/docs/guides/troubleshooting/database-roles-can-read-request-headers-queued-by-pg_net-ad6357).

Provet använde bara kontrollerade SQL-konton, kortlivad previewåtkomst och
syntetiska data. Net får inte exponeras genom Data API. Den direkta kontrollen
med publishable key gav dock 503/PGRST002 (schema-cacheproblem), så faktisk
Data API-isolering kunde inte verifieras i denna körning. Inget påstående om
godkänd API-isolering görs. Detta och SQL-kontonas tillitsgräns måste lösas
eller uttryckligen bedömas före produktionsval; det är inget produktionsgodkännande.

Modulith 2.1.0:s predicate-API kan återta PROCESSING men läser alla oavslutade
publiceringar innan filtrering. Dess options-overload använder i denna version
FAILED-urval och ersätter därför inte predicate-anropet här. SQL-urval och antal
startade leveranser är begränsade, men registrets läsning är inte minnesmässigt
batchbegränsad. Budgeten är mjuk; JDBC-/registryanrop kan förbruka tid utöver
kontrollerna. Databaspollning sker var 100 ms medan HTTP-anropet väntar.
Detta kräver separat last-/backlogprov och en verifierad begränsad registry-
integration före verksamhetspilot. Ingen intern Modulith-state uppdateras med
egen SQL och inget parallellt leveransregister införs.

Ingen global lease införs. Två workers kan välja samma gamla post innan ett nytt
försök syns; unika DB-effekter är därför nödvändiga. Externa utskick behöver
egen idempotens. Dagens prov bevisar inte exakt ett mejl.

## Reproduktion och städning

Följ [körbeskrivningen](../../backend/README.md). Providerbootstrap,
aktivering och städning ligger i scripts/probe/scheduler-*.sql.
setup skapar inget jobb. activate har en tidsgrind, utgångstid och max fem
HTTP-anrop; timeout-fel används endast i provet. Providerfunktionens SECURITY
INVOKER och återkallade PUBLIC-exekvering verifierades.
calls-tabellen är korrelation för transportbevis, inte en verksamhets-outbox.

Verifierat efter avslut: 0 jobb med provnamnet, 0 Vault-hemligheter, 0 köade
HTTP-anrop, 0 lagrade HTTP-responser, tomma provinställningar och NOLOGIN för
observationskontot. Testklienten är stoppad och previewlänken återkallad.
En tidigare felrespons ekade en åtkomstlänk; responsen raderades och länken
återkallades. Headers, cookies och felresponser sparas inte i repo eller bevis.
Ett misslyckat försök att skapa projektomfattande automationsbypass lämnade
ingen sådan nyckel; återkallelsekontrollen svarade not_found.

Kvar finns previewn, syntetiska provresultat, de tomma privata hjälptabellerna,
hjälpfunktionen och installerade pg_cron/pg_net. Inga återkommande jobb eller
planuppgraderingar är aktiva. Ordinarie Förena-produktion och dess data berörs inte.
Återstående M22-arbete: faktisk worker-JVM-krasch under schemalagd körning,
gränsen effekt/kvittens, produktionssäker scheduleråtkomst, begränsad
registryläsning, anslutnings-/kostnadsbild och slutligt hostingbeslut.
