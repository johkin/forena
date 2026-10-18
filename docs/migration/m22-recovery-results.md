# M22F: begränsad återtagning med beständig turordning

Bas: PR #104, `a3ff203`; branch `test/recovery-capacity` från aktuell main.
[Uppgift](tasks/m22f-recovery-capacity.md), [M22E](m22-load-cost-results.md),
[beslut ADR-009](decisions.md), [nästa M22G](tasks/m22g-vercel-pilot-gates.md).

## Ändrat beteende

Workern läser flera SQL-begränsade sidor om två publiceringar per HTTP-anrop.
Förval: högst 64 starter, 256 granskade kandidater, mjuk budget 120 s, reserv
5 s och stale 120 s. Den tidigare gränsen var två starter per anrop.
Samtliga fasta JDK-/Kotlin-/Boot-/Modulith-/Maven-versioner behålls.

En ensam privat markörrad lagrar `(publication_date, publication_id)` och revision.
Den uppdateras atomärt med compare-and-set före varje granskad kandidat.
Även färska försök och för långa lyssnare flyttar markören. Därmed kan en ködel
längre än scan-taket passeras över flera schemalagda anrop. Ett avslutat varv
nollställer markören; nästa varv börjar först vid nästa anrop. Felande lyssnare
startas högst en gång per varv och färska försök spärras fortsatt av stale.

Modulith äger fortfarande alla claims, statusövergångar och leveransposter.
Markören är läsprogress, ingen andra outbox eller leveranslogg. Kraschar JVM:en
mellan markör och dispatch finns publiceringen kvar och återbesöks i ett senare
varv. Ett förlorat CAS-försök avslutar anropet i stället för att skriva över
annan progress. En JVM accepterar en worker åt gången utan väntande DB-lås.
Ingen anslutning/transaktion hålls av workern medan den väntar på lyssnaren.

En misslyckad eller stillastående lyssnare får lämna plats åt senare kandidater.
Väntan per försök begränsas till fördröjning + reserv + startmarginal och återstående
requestbudget. Redan startat asyncarbete avbryts inte av att denna väntan upphör;
beständig återtagning och idempotens behövs fortsatt vid instansförlust.
`cycle-complete` betyder ett avslutat sökvarv, inte att hela kön är färdig.
API-listorna behålls, `examined` tillkommer additivt och stopReason förklarar
budget-/scan-/publiceringsgräns, konkurrens eller avbrott.

## Verifiering och mätgränser

Reproduktion från reporoten efter bygge med låst JDK:

```sh
cd backend
./mvnw --batch-mode --no-transfer-progress verify
cd ..
python3 scripts/probe/local-capacity.py --recovery-cadence --out /tmp/m22f.json
python3 scripts/probe/local-capacity.py --quick --recovery-cadence --out /tmp/m22f-ci.json
python3 scripts/probe/local-capacity.py --quick --out /tmp/m22f-regressions.json
python3 scripts/probe/local-lifecycle.py --concurrent-recovery --scheduled-crash --registry-backlog 10000
```

Fulla kadensprovet använder 60 s mellan ticks, hoppar över tick noll och växlar
mellan två lokala JVM:er. 300 permanent överbudgeterade poster ligger före
100 leveranser med noll fördröjning; 10 000 färska poster blandar lyssnare.
Fixturerna är cirka 121 s gamla vid start, strax efter stale 120 s; verklig
köålder läses i SQL. Femminuterskontrollen inkluderar både tiden redan förfluten
efter stale och hela mätintervallet med den missade ticken. Apparna har startats
före mätningen; detta är inte ett nytt kallstarts-/scale-to-zero-prov.
Provet använder budget 8 s/reserv 0,1 s, men samma sidstorlek 2 och tak 64/256
som förvalen. CI-varianten komprimerar tickintervallet till 2 s och går vidare
när föregående anrop är klart; den bevisar ordning/kapacitet, inte minutkadens.
Lokala processer/PostgreSQL på gemensam värd emulerar inte Vercel/Supabase Micro.

**Godkänt lokalt:** 100 effekter, 100 försök och 100 kvittenser på 186,03 s
från provstart. Initial äldsta giltiga köålder var 121,59 s. En konservativ
beräknad övre gräns efter stale är därför `121,59 − 120 + 186,03 = 187,62 s`,
under femminutersmålet även med missad tick. De 300 överbudgeterade posterna
har noll försök och ligger kvar; de behöver delas upp eller annan arbetsbudget.
Målet avser dessa korta giltiga leveranser, inte godtyckligt långsamma lyssnare.

| Tick / JVM | Tid från start | Granskade / uppskjutna | Klara i anropet | Avslut |
| --- | ---: | ---: | ---: | --- |
| 0 | 0 s | – | 0 | Avsiktligt missad |
| 1 / JVM 1 | 60 s | 256 / 256 | 0 | scan-limit, HTTP 4,31 s |
| 2 / JVM 2 | 120 s | 99 / 44 | 55 | budget, HTTP 8,15 s |
| 3 / JVM 1 | 180 s | 45 / 0 | 45 | cycle-complete, HTTP 5,77 s |

[Minutbevis](evidence/m22f-cadence.json) innehåller köålder per tick, SQL-statistik,
CPU/RSS och källhashar. 202 kandidatfrågor gav 401 resultatrader, högst två per
sida enligt frågan/testerna: en förhämtad rad lästes igen efter budgetavslut.
100 exakta registryläsningar gav 100 rader/deserialiseringar; statuspollning
200 frågor/200 rader. Kandidat-SQL tog totalt 4,91 s på databasen. Fulla scan/
sort-kostnaden är alltså kvar trots begränsad materialisering.

600 resurssamplingar: JVM-CPU 3,79 + 3,79 s, högsta observerade RSS cirka
701/687 MiB, högsta observerade anslutningar 2/3 av tillåtna 4 per JVM och
noll observerade låsväntare. Sampling är ett undre mått på toppar, inte ett
bevisat anslutningsmaximum; Hikari-konfigurationen ger taket. Samplingsmålet
200 ms blir längre med Docker/psql. Andra lokala prov kördes under delar av
uppstart/väntan; detta är inte en dedikerad prestandavärd eller moln-SLA.
CI-varianten med 2 s tick slutförde 100 på 22,42 s; CI behåller alla tidigare
kontroller och kör denna separat som regression.

Övrig verifiering, samma runtimekällor och JAR enligt bevisens SHA-256:

- Maven verify: **44 tester**, noll fel/överhoppade. Modulith-struktur/modultest,
  övergräns för sid-/scan-/publiceringstak, lika tidsstämplar/UUID-ordning,
  färska försök, permanent lång ködel, felande/stillastående lyssnare,
  CAS-konflikt och runtimegrants. Liquibase: tom DB till senaste, uppgradering
  från probe-002 med bevarade exakta rader och upprepad körning utan ändring.
- [Riktiga processprov](evidence/m22f-lifecycle.json): exit 137 före effekt och
  efter committad effekt men före kvittens; senare annan JVM och upprepat
  återtag ger en slutlig effekt/noll pending. Tre två-JVM-workeromgångar ger
  samma slutresultat. 10 000 färska registry-poster är kvar orörda.
- [Regressionsmatris](evidence/m22f-regressions.json): EXPLAIN på 1 000/10 000,
  en/två workers och 1,5 s lyssnare; en slutlig effekt per ID. Låst registry
  ger 500 efter 2,05 s och lyckat återförsök. Åtta skrivare fyller poolens fyra
  anslutningar: fyra 202/fyra 500, sedan en effekt/kvittens. Niosekunderslyssnare
  mot åttasekundersbudget skjuts upp utan start. Kontinuerlig dräneringsmatris
  behåller uttryckligen max två starter för jämförbarhet med M22E.
- 1 065 frontendtester, typecheck, lint och build godkända. Sex Pythonregressioner,
  offlinekontroll av tidigare isoleringsbevis, kostnadsreproduktion utan diff,
  Python-kompilering, dokumentlänkar och git diff --check godkända.
- Supabase CLI finns inte lokalt: `supabase db reset`/`supabase test db` är
  **inte körda lokalt**. Den ändrade privata Liquibase-migrationen och grants
  verifierades mot disponibel PostgreSQL med Testcontainers. CI:s befintliga
  Supabase-säkerhetstest behålls; det ersätter inte ett lokalt CLI-resultat.

Alla disponibla processer/DB-containrar från proven är stoppade och raderade.
Inga cloudcredentials behövdes. Ingen lokal eller extern produktions-DB återställdes.

SQL-resultat och deserialisering är begränsade per sida/exakt-ID. PostgreSQL
kan fortfarande behöva scanna/sortera många rader; inget eget index tillförs.
SQL:s läs-timeout är två sekunder, Hikari har separat anslutningsväntan och
bibliotekets claims/effektskrivningar har inte samma timeout. Budgeten är mjuk,
inte ett löfte om hård HTTP-deadline. Ogiltig serialiserad fixturedata som ger
SQL-castfel är inte bevisat automatiskt förbikopplad; vanlig producent validerar
probekommandot. Manuellt probeåtertag och shutdown-diagnostik är fortsatt
obegränsade och hör till M22G:s produktionsavgränsning.

## Pool, instanser och release

Behåll Hikari max fyra, en worker per JVM och en schemalagd väckning per minut.
Föreslagen pilotbudget: högst två residenta JVM:er i normal drift, högst fyra
med gamla och nya versioner under utrullning, alltså högst 16 runtimeanslutningar.
På M22E:s antagna Micro-gräns 60 reserveras ytterligare 20 för Auth/Supabase,
drift och det separata migreringsjobbet: 16 + 20 = 36, med 24 kvar som marginal.
Det är ett planeringsförslag, ingen införd Vercel-instansgräns eller verifierad
ledig kapacitet på kontot. Previews måste räknas in eller använda separat DB.
M22G måste verifiera att faktisk autoskalning/residenta sessioner kan hållas
inom budgeten; två överlappande HTTP-anrop bevisar inte två moln-JVM:er.

Lyssnartransaktioner och REQUIRES_NEW-kvittens använder samma fyranslutningspool;
det är inte fyra för HTTP plus extra fria anslutningar för lyssnare. Full pool
kan fortfarande ge timeout/fel. Läsmarkören kräver ingen extra kvarhållen session.
Behåll Session pooler; transaktionspooler kräver ett eget kompatibilitetsprov.

Kör `probe-003-worker-cursor` som separat Liquibase-releasejobb före ny runtime.
Uppgraderingen tillför bara markören och dess begränsade grants. Runtime får
SELECT och UPDATE av progresskolumner, inte INSERT/DELETE eller byte av singleton.
Äldre runtime kan köras mot det utökade schemat; den använder inte markören och
omfattas inte av det nya JVM-låset/CAS-samordningen. Moduliths claims och unik
effekt skyddar fortsatt idempotens vid sådan utrullning, inte exakt ett försök.

## Beslut och överlämning

Vercel + Supabase är vald arbetsinriktning enligt användarens beslut. Ingen
Google Cloud-koppling utvärderas före ett dokumenterat konkret hinder i denna
lösning. GCP-uppgifter och tidigare prisjämförelser är vilande historiska
alternativ. Ingen molnlast, planuppgradering, produktion eller befintlig frontend
ändras i M22F. Teknikproven är ännu inte verksamhetsbackend.

M22G verifierar kapacitet med denna kod på isolerad Vercel/Supabase, aktuella
plan-/betavillkor, skalningsbudget, tillitsbeslut för pg_net och produktionsgränser
för probe-/manuell-/shutdownfunktioner. Registrera faktisk kallstart, köålder,
missade ticks och larm oberoende av användartrafik. Externa utskick behöver egen
idempotens; en unik databaseffekt bevisar inte exakt ett mejl.
