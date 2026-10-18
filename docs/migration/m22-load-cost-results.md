# M22E: last, anslutningar och kostnad för en förening

Datum: 2026-10-18. Bas: PR #103, `a9ca451`. Separat branch `test/load-cost`.
[Uppgift](tasks/m22e-load-cost.md). Användaren valde **enstaka förening först**.
Inga versioner, backendregler, produktionsresurser eller betalplaner ändras.

## Rekommendation och återstående grindar

Fortsätt med **Vercel + Supabase PostgreSQL/Auth och Supabase Cron** inför
piloten. Minutväckning från Supabase är redan verifierad i M22A/C och kräver
inte Vercels egen cron eller Vercel Pro. Vi rekommenderar inte en tredje
infrastruktur för att spara mindre än några dollar i den här lastbilden.
Detta är en villkorad rekommendation, inte en produktionsaktivering.

Supabase Pro/Micro är kostnadsbas för hållbar pilot med automatiska dagliga
backuper. Vercel Hobby ger lägsta grundkostnad **om föreningens drift omfattas
av villkoren för personlig, icke-kommersiell användning och ryms inom kvoterna**.
Ideell verksamhet innebär inte automatiskt att det villkoret är uppfyllt.
Om Pro behövs av andra skäl är det en separat teamavgift, inte en cronavgift
som Supabase-lösningen tvingar fram. Befintliga fakturor/avtal är inte hämtade.

Före pilot återstår framför allt att:

- Dimensionera workerdränering för önskad återhämtningstid och verifiera
  anslutningsbudgeten vid skalning/utrullning. Fler JVM:er ger inte automatiskt
  jämn arbetsfördelning; dubblettförsök är observerade och måste tålas.
- Besluta om tillitsgränsen för Supabase pg_net. Alla direkta SQL-loginroller
  kan läsa köheaders. Vault och avstängt Data API ändrar inte detta. Godta
  uttryckligen den dokumenterade gränsen för betrodda konton eller välj en
  scheduler med credentials utanför databasen. Ingen sådan aktiveras här.
- Ersätta manuella probe-/kraschfunktioner med ett produktionsavgränsat API,
  och bedöma Moduliths obegränsade shutdown-diagnostik. Säkerställ databas-
  idempotens och särskild utskicksidempotens; en databaseffekt bevisar inte
  exakt ett mejl. Se [M22F](tasks/m22f-recovery-capacity.md) och
  [M22G](tasks/m22g-vercel-pilot-gates.md).

## Antaganden och mätmetod

Budgetantaganden, inte inventerad kundtrafik: en förening, 500 medlemmar,
100–500 aktiva användare/månad, 100 000 dynamiska anrop/månad, en burst om
50 kallelsesvar och högst två interna reaktioner per svar. Sikta på att återta
100 kvarvarande leveranser inom fem minuter efter att stale-gränsen passerats.
Det är ett föreslaget återhämtningsmål; någon sådan SLO är inte verifierad.
Normal HTTP-/verksamhetsprestanda måste mätas i M07, inte härledas ur proben.

`local-capacity.py` skapar själv en disponibel PostgreSQL 17.6-container och
startar två riktiga JVM:er med den byggda proben. Inga URL-/DB-argument för
externa mål accepteras. Hikari max fyra per JVM och stale 120 s behålls;
workerbudget är åtta sekunder/reserv 100 ms för korta reproducerbara prov.
Felinjektion är avstängd. Alla event-/registry-fixturer är syntetiska INSERTs;
Modulith sköter leveransövergångar. Inga egna runtime-statusuppdateringar.
Schema skapas med befintlig Liquibase, inga nya schemaändringar eller index.

Kandidat-SQL hämtas från PendingPublications-källan. EXPLAIN ANALYZE/BUFFERS
körs fem gånger per storlek, 1 000/10 000/100 000 poster. Tre fjärdedelar
matchar lyssnaren; FAILED och övergiven PROCESSING blandas. Hela fixturen är
oavslutad. Planerna representerar inte en produktionsdatabas med år av historik.

Workermatrisen använder 40 korta leveranser med en/två samtidiga anropsloopar,
samt fyra leveranser med 1,5 s lyssnarfördröjning. Ytterligare 10 000 färska
registry-poster ligger kvar. SQL-statistik, `/proc` CPU/RSS och aktiva/låsta
anslutningar samlas. Samplingsmålet är 200 ms, men Docker/psql ger extra tid;
peak-anslutningar är observerade undre gränser, inte exakta toppvärden.
Genomströmningen inkluderar harnessens HTTP/SQL-pollning och kontinuerliga
anrop. Den är **inte** kapaciteten hos ett cronjobb som kör en gång per minut.
P95 är nearest-rank på små stickprov, ingen SLA eller molnprognos.

## Lokala mätresultat

| JVM:er / lyssnare | Events | Effekt/s, aktiv dränering | HTTP p95 | Workeranrop | Försök | Observerat RSS/JVM |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 / 0 ms | 40 | 4.19 | 445 ms | 20 | 40 | 534/647 MiB |
| 2 / 0 ms | 40 | 6.06 | 407 ms | 31 | 43 | 541/681 MiB |
| 2 / 1500 ms | 4 | 0.60 | 3236 ms | 4 | 5 | 542/682 MiB |

| Registry-poster | Kandidat-SQL p95 av fem körningar |
| --- | ---: |
| 1,000 | 16.3 ms |
| 10,000 | 100.3 ms |
| 100,000 | 697.2 ms |

[Sanerad mätning](evidence/m22e-local-capacity.json) innehåller tider, plan,
SQL-anrop/resultatrader, CPU och minne samt runtimekällornas SHA256.
JVM:erna är lokala processer på samma värd; de emulerar inte två isolerade
Vercel-containrar med 1 vCPU/2 GB eller en Supabase Micro. Köåldern är
avsiktligt modellerad till fem minuter genom fixturetimestamp, inte observerad
köfördröjning i ordinarie Förena. Alla riktiga kandidater kvitterades och varje
körnings-ID fick en effekt. Extra försök observerades vid två workers.

Queryplanerna visar scan över växande kö och top-N-sort trots två resultatrader.
Parallella scans anger rader per loop; multiplicera med Actual Loops vid
bedömning. Inget index införs på grundval av en syntetisk mätpunkt. Följ upp
selektivitet, färska/blockerade poster och gammal historik i M22F. Ett index
kräver Liquibase och uppgraderingsprov i den uppgiften.

Felinjektionerna prövar tre verkliga begränsningar:

- Registrytabellen låses i fyra sekunder: workerns tvåsekunders read-timeout
  ger HTTP 500. Efter upplåsning lyckas ett nytt workeranrop utan dataförlust.
- Åtta samtidiga skrivningar väntar på samma externa advisory lock i 15 s:
  JVM:ens fyra anslutningar fylls; fyra anrop får 500 vid anslutningsväntan,
  fyra får 202. Återanvändning av samma idempotens-ID ger en effekt/kvittens.
  Anrop kan alltså blockera längre än workerns read-timeout; den är ingen
  generell skriv-/transaktionsdeadline. Poolmättnad ska inte döljas som framgång.
- En lyssnare på nio sekunder överskrider provets åttasekundersbudget och
  skjuts upp utan start. Långt arbete måste passa en framtida budget eller
  delas upp; annars kan samma post skjutas upp för alltid.

## Återhämtningskapacitet och anslutningar

Nuvarande teknikprov återtar **max två per anrop**, inte två kontinuerligt
under hela tidsbudgeten. Ett minutjobb ger därmed högst två per minut.
50 kvarvarande publiceringar behöver minst 25 minuter, 100 behöver minst 50
minuter, efter stale-väntan och utan nya fel. Två schemalagda HTTP-anrop ger
inte säkert dubbel kapacitet eftersom de kan välja samma kandidater. Normal
asyncleverans kan vara snabbare; detta gäller den beständiga återtagningsvägen.

Börja med en schemalagd dränering, med mätbar backlog/ålder och ett kapacitetstak.
M22F ska uppnå återhämtningsmålet med avgränsade SQL-batcher inom requestbudget,
färskhetskontroll och bibehållen idempotens. Ingen permanent två-instanslösning
eller längre vänteloop väljs enbart för att hålla processer varma.

Anslutningsbudget: `4 × residenta JVM:er + migration + drift/övriga tjänster`.
Räkna även pausade/varma instanser som håller sina sessioner öppna, previews
och parallella gamla/nya deploymentversioner; bara aktiva HTTP-anrop räcker inte.
Två JVM:er innebär högst åtta poolanslutningar, men utrullning med gamla/nya
instanser kan dubbla det. En planeringsreserv om 20 anslutningar på Micro 60
lämnar högst tio samtidiga JVM:er (`(60−20)/4`), eller fem om samma antal gamla
versioner tillfälligt ligger kvar. Det är en egen konservativ budget, ingen
verifierad Supabasekonfiguration eller Vercelgräns. Auth, Supabase-tjänster och
operatörer behöver också anslutningar. Poolerns 200 klientanslutningar på Micro
betyder inte 200 samtidiga backendanslutningar eller fria JVM-pooler.

Behåll det verifierade sessionpoolerläget i detta steg. Transaktionspooler kan
minska kopplingen mellan klientsessioner och DB-anslutningar men behöver eget
JDBC-/prepared-statement-/transaktionsprov innan byte.
[Supabases anslutningsguide](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Plattform, region och två instanser

Container Runtime är fortfarande beta och tillgängligt på alla planer enligt
[officiell dokumentation](https://vercel.com/docs/functions/runtimes/container),
kontrollerad 2026-10-18. Den skalar automatiskt med trafik och går ned efter
inaktivitet, normalt fem minuter i production och 30 s i preview. Nedskalning
ger SIGTERM med 30 s frist; det är inte garanti för fristående bakgrundsarbete.
Därför behålls beständig registrering och requestbunden återtagning.

Flera instanser stöds genom autoskalning. [Skalningsguiden](https://vercel.com/docs/functions/concurrency-scaling)
fastställer inte i de undersökta källorna en replicas=2-konfiguration för vår
Kotlin-container. M22C visar flera JVM:er över tid, och separata samtidiga JVM:er
har verifierats lokalt. M22E kör inget nytt Vercel-lastprov och bevisar inte
exakt två samtidigt aktiva molninstanser. M22G ska visa två olika JVM-ID:n i
överlappande leveranser utan att likställa två HTTP-anrop med två instanser.

Behåll Vercel fra1 nära befintlig Supabase eu-central-1 (Frankfurt). Cloud Run
jämförs nedan med europe-west1 (Belgien), närliggande Tier 1; europe-west3 i
Frankfurt är Tier 2 och får inte tilldelas Tier 1-priset. Inget region-/hosting-
byte görs. Cloud Run → Supabase-nät/TLS/latens är fortfarande M08-verifiering.
Spring-eventbussen är lokal, leveransregistret gemensamt. Fan-out till alla
instanser/anslutna klienter behöver separat transport om det användningsfallet
uppstår; Pub/Sub är inte ett krav för dessa databasreaktioner.

## Kostnader och reproduktion

Se [aktuell kalkyl](m22-costs.md), [beräkningsdata](evidence/m22e-costs.json) och
[kostnadsindexet](costs-and-regions.md). Underlag från officiella sidor är daterat;
lastantaganden och budgetposter är tydligt separerade från mätning och faktura.

```sh
# Bygg först med låst JDK enligt backend/README.md
cd backend
./mvnw --batch-mode --no-transfer-progress verify
cd ..
python3 scripts/probe/local-capacity.py --out /tmp/m22e-capacity.json
python3 scripts/probe/cost-model.py --out /tmp/m22e-costs.json
diff -u docs/migration/evidence/m22e-costs.json /tmp/m22e-costs.json
```

CI kör --quick (1 000/10 000 och 16 korta events; samma två-JVM-/felfall),
behåller resultatet som artifact och kör tidigare JVM-krasch-/backlogtester.
Den större lokala körningen är separat evidens, inte en CI-körning.

## Städning och leveransstatus

M22C:s exakta städ-SQL lyckades nu via Supabase execute_sql. Oberoende läskontroll
2026-10-18 21:09:10.194344 UTC gav noll jobb, köposter, Vault-poster, faults,
calls, settings, responser 25–34 och oavslutade publiceringar. Historiska M22C-
bevis behålls; [städbevis](evidence/m22e-cleanup.json) dokumenterar övergången.
Inga nya molnjobb, credentials eller lastanrop skapades i M22E. Lokala JVM:er och
disponibla containrar stängs/raderas i harnessens finally.

Verifierat lokalt: 36 JUnit-/Testcontainers-tester, struktur-/modultest,
full kapacitetsmatris och lokal --quick-variant, 1 065 frontendtester/typecheck/lint/build, sex
Pythonregressioner och offlinebeviskontroll. Kostnadsmodellens genererade JSON
är reproducerad; länkar och källhashar kontrollerade. Den tidigare krasch-
harnessens CI-steg behålls oförändrat. Ingen lokal Supabase-reset behövs för
oförändrat schema; repots separata DB-säkerhetsjobb behålls i CI.

Nästa koduppgift är M22F. M22G förbereder drift-/skalningsgrindarna och ska
använda mergad M22F-kod för slutlig återhämtningsverifiering. Dessa är dokumenterade
uppgifter, inte påstått delegerade eller startade sessioner.
