# M22E: aktuell kostnadsbild med Supabase som databas

Aktuell inriktning enligt ADR-009 (M22F): Vercel + Supabase. Google Cloud-
kopplingar utvärderas först vid ett dokumenterat konkret hinder. Tidigare
GCP-priser och lösningsförslag nedan är historiska alternativ, inte aktivt arbete.


Kontrollerad 2026-10-18. USD/månad exklusive moms, växelkurs ej antagen.
Budget för **en förening först**, enligt användarens besked. Detta ersätter
M00:s overifierade Cloud SQL-scenario som aktiv jämförelse, ingen beställning.
Ingen faktura, kontospecifik rabatt eller verklig debitering har hämtats.

## Praktiskt val

Huvudspåret är Vercel + Supabase + **Supabase Cron**. Vi har bevisat schemalagd
HTTP-väckning från Supabase till Vercel. Vercel Pro behövs inte för den cron-
lösningen. Godkännande av pg_net:s gemensamma credentialtillit för SQL-login-
konton är en separat produktionsgrind; se [resultatrapporten](m22-load-cost-results.md).

Planera ungefär **25–30 USD/månad för produktion** med Supabase Pro/Micro och
Vercel Hobby **om Hobby-villkoren och kvoterna passar föreningens drift**.
Med Vercel Pro blir motsvarande ungefär **45–50 USD** för en deploying seat.
Intervallen inkluderar en egen reserv 0–5 USD för liten lagring/bygg-/nätvariation,
inte mejl, AI, domän eller särskilda add-ons. De är budgetar, inte tak.
Gratis pilot med Supabase Free är ett annat tekniskt alternativ, men saknar
automatiska backuper och har paus-/storleksgränser; det är inte basen för
rekommenderad beständig föreningsdrift.

[Hobby](https://vercel.com/docs/plans/hobby) gäller personlig, icke-kommersiell
användning; ideell förening innebär inte automatiskt personlig användning.
Betalplan byts inte i denna uppgift. Befintliga abonnemang kan göra
**marginalkostnaden** lägre än den fullständiga projektkalkylen.

## Priser kontrollerade hos leverantörerna

| Post | Verifierat pris eller kvot | Källa |
| --- | --- | --- |
| Vercel Hobby | 0 USD; 4 CPU-h, 360 GB-h, 1 miljon invokationer/månad | [Hobby](https://vercel.com/docs/plans/hobby) |
| Vercel Pro | 20 USD/team/månad, en deploying seat och 20 USD usage-credit; extra deploying seat 20 USD | [Pro](https://vercel.com/docs/plans/pro-plan) |
| Vercel fra1 Functions | CPU 0,184 USD/h, minne 0,0152 USD/GB-h; invokationer 0,60 USD/miljon före Pro-credit | [Fluid-pris](https://vercel.com/docs/functions/usage-and-pricing) |
| Vercel egen Cron | Hobby dagligen, Pro/Enterprise minutintervall; ingen separat cronavgift, Functions debiteras | [Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing) |
| VCR images | 0,10 USD/GB; separat lagringspost | [VCR](https://vercel.com/docs/container-registry/limits-and-pricing) |
| Supabase Pro | 25 USD/organisation/månad; 10 USD gemensam compute-credit | [Compute](https://supabase.com/docs/guides/platform/manage-your-usage/compute) |
| Supabase Micro | 0,01344 USD/h, cirka 9,81 USD vid 730 h; Pro-credit täcker en Micro | [Compute](https://supabase.com/docs/guides/platform/manage-your-usage/compute) |
| Supabase Pro inkluderat | 8 GB DB/projekt, 100 GB filer, 100 000 MAU, 250 GB egress; daglig backup 7 dagar | [Prislista](https://supabase.com/pricing) |
| Supabase överskjutande | DB 0,125 USD/GB, filer 0,0213 USD/GB, okachad egress 0,09 USD/GB | [Prislista](https://supabase.com/pricing) |
| Cloud Run request-baserat, Tier 1 | 0,000024 USD/vCPU-s, 0,0000025 USD/GiB-s, 0,40 USD/miljon requests | [Run](https://cloud.google.com/run/pricing) |
| Cloud Scheduler | 0,10 USD/jobb/månad, tre gratis per billing account; även pausade jobb räknas | [Scheduler](https://cloud.google.com/scheduler/pricing) |
| GCP Logging/Secrets | Logging 0,50 USD/GiB efter 50 GiB/projekt; Secrets 0,06 USD/aktiv version efter sex gratis, accesskvot separat | [Logging](https://cloud.google.com/products/observability/pricing), [Secrets](https://cloud.google.com/secret-manager/pricing) |

Supabase Cron är en Postgres-extension med SQL-/HTTP-jobb; i denna modell
räknas ingen separat per-tick-avgift. DB-resurser, HTTP-trafik och Vercel-
invokationer är fortfarande verklig förbrukning. [Cron-dokumentation](https://supabase.com/docs/guides/cron).
Kontrollerade källor är officiella, men deras priser kan ändras efter datumet.

## Miljöer och delade avgifter

| Miljö | Antagen användning | Supabase | Vercel + Supabase Cron | Budget, utan gemensam Pro-teamavgift |
| --- | --- | --- | --- | ---: |
| Dev | Lokal Postgres/JVM, syntetiska data; ev. 10 000 previewanrop/månad, ingen permanent cron | Lokal, alternativt isolerat Free om kvot finns | Lokal/Hobby om villkor passar | 0–2 USD |
| Test | Isolerat projekt, 20 000 anrop, två dygn minutprov/månad; hålls betalt aktivt i konservativ budget | Extra Micro i samma Pro-org | Skyddad preview, tidsbegränsade provjobb och kontrollerade integrationer | cirka 10–12 USD extra |
| Produktion | En förening, 100 000 anrop/månad, ett minutjobb i 30 dygn | Pro + Micro | Hobby om tillåtet, annars Pro | cirka 25–30 USD |

Vercel Pro-teamavgiften **20 USD räknas en gång**, inte per miljö eller per
frontend/backend. Usage-credit 20 USD delas av teamets användning; andra
projekt kan redan förbruka den. Supabase Pro 25 USD och compute-credit 10 USD
räknas också bara en gång per organisation. Två Micros 730 h blir
`25 + max(0, 2 × 730 × 0,01344 − 10) = 34,62 USD` för databassidan.
Med lokal dev och ständigt aktiv betald test är grundkostnaden därför
**34,62 USD** med berättigad Hobby, eller **54,62 USD** med ett Vercel Pro-team,
före reserver och tillägg. Dev/test/prod är logiskt separerade även när
team-/orgavgiften delas; dela inte deras verksamhetsdata eller utskick.

Free-projekt är högst två aktiva och kan pausas efter inaktivitet. Ett testprojekt
i en betald organisation antas inte bli gratis bara för att det heter test.
Att lägga test i en annan Free-organisation är ett separat val, inte redan gjort.
Ett betalt extra utvecklingsprojekt tillför ytterligare cirka 9,81 USD/månad.

## Beräknad användning, inte uppmätta fakturor

`cost-model.py` producerar [alla indata och summor](evidence/m22e-costs.json).
Månaden är 30 dygn för ticks och 730 h för en ständigt aktiv DB. API-antagandet
är 100 ms aktiv CPU och 200 ms sammanlagd instansaktiv tid per anrop; detta
är en budgetfaktor, inte prestandamätning av kallelsesvar. Funktionen tilldelas
2 GB/GiB och 1 vCPU i jämförelsen. Lokal RSS är inte debiterbart minne.

| Fall | Function-anrop/månad | Vercel fra1 brutto Functions | Cloud Run Tier 1 brutto före fri kvot |
| --- | ---: | ---: | ---: |
| Dev om preview används | 10 000 | 0.07 USD | 0.06 USD |
| Kontrollerad testmånad | 22 880 | 0.16 USD | 0.14 USD |
| En förening, inklusive 43 200 minutväckningar | 143 200 | 0.86 USD | 0.89 USD |
| Tio gånger API-trafiken | 1 043 200 | 7.52 USD | 6.47 USD |
| Kallstart varje minut, känslighetsfall | 143 200 | 15.07 USD | 19.43 USD |
| 60 s I/O-lyssnare varje minut, känslighetsfall | 143 200 | 22.75 USD | 76.06 USD |

Det vanliga minutjobbet antas använda 10 ms CPU och 200 ms aktiv instanstid.
Kallstartsfallet antar i stället 4 s CPU/15 s totalt per tick. Långlyssnarfallet
lägger på 60 s väntan per tick; så hög arbetsmängd är **inte** en prognos för
en förening. Det visar att väntetid fortfarande kostar minne på Vercel och
både aktiv vCPU och minne med Cloud Runs request-baserade debitering.

Kalkylen summerar aktiv tid konservativt utan samtidighetsrabatt. I Vercel
pausar resursdebiteringen mellan färdiga requests enligt prisguiden; två möjliga
instanser betyder inte två fasta serverhyror. Två samtidigt arbetande instanser
bidrar däremot båda. Pro-credit räknas av en gång från hela teamets berättigade
användning. Hobby använder kvoter i stället för betald överförbrukning; tiofaldig
trafik överskrider här anropskvoten och kan inte budgeteras som gratis Hobby.

Med dessa API-antaganden använder dev/test/prod tillsammans cirka **3,74 CPU-h**
redan före extra kalla starter och övriga projekt. Hobby har bara 4 CPU-h;
marginalen är alltså liten. Om testpreviewn kallstartar varje minut i två dygn
med antagna fyra CPU-sekunder per start tillkommer cirka 3,19 CPU-h jämfört
med varm-tick-antagandet. Då överskrids kvoten. Det går att fortsätta med få,
tidsbegränsade testanrop, men räkna inte återkommande fulla testdygn som gratis.
Det kan motivera Pro av kvotskäl; Supabase Cron i sig kräver det fortfarande inte.

Cloud Run-frikvoten är 180 000 vCPU-s, 360 000 GiB-s och två miljoner requests,
delad per billing account. Den räknas inte av i bruttotabellen; andra projekt
kan redan ha använt den. Cloud Scheduler kan också rymmas i sin fria kvot.
Förväxla inte en kostnad nära noll med att inget billing account behövs.

## Vad ingår utöver Functions och vad jämförs?

Vercels frontend/CDN ligger kvar i **båda** hostingalternativen. Om dess
team behöver Pro kvarstår den avgiften även när Kotlin flyttas till Cloud Run.
Som jämförelse blir Cloud Runs bruttotillägg i modellen ungefär 0,89 USD för
prod och 0,14 USD för test, plus högst 0,10 USD per definierat Scheduler-jobb
före fri kvot. Med samma Supabasebas blir prod cirka `25 + 0,89 + 0,10 = 25,99`
USD och extra betald test cirka `9,62 + 0,14 + 0,10 = 9,86` USD, före gemensam
frontendavgift, lagring, nät, bygg, Secrets och loggar. Lokal dev är noll;
remote-dev-fallet i tabellen cirka 0,06 USD för själva Run-beräkningen. Fria
GCP-kvoter kan reducera dessa små poster, men ändrar inte DB-/frontendavgifter.

Det är missvisande att jämföra 45 USD för hela Vercel/Supabase-paketet med
bara Cloud Runs marginalkostnad. För en förening är den rena backendskillnaden
liten i denna modell; ett tredje kontrollplan innebär fortfarande CI-, IAM-,
hemlighets- och driftarbete.

Vercel fra1 och Supabase eu-central-1 hålls i Frankfurt. Cloud Run-alternativet
är Belgien (Tier 1) nära Frankfurt. Frankfurts europe-west3 är Tier 2 enligt
[regionlistan](https://cloud.google.com/run/docs/locations); ett sådant val kräver
ny regional priskontroll. Ingen Cloud SQL, Firebaseflytt, Pub/Sub eller ny
extern kö behövs för dessa prov och inget sådant beställs.

Planeringsreserven 0–5 USD/miljö är en egen budgetpost, inte verifierade
SKU-summor. Räkna separat på:

- Container-/deploymentlagring och retention. Exempel: 2 GB VCR ger cirka
  0,20 USD enligt listpriset. Artifact Registry, bygg och deploymentstorage
  ingår inte automatiskt i Cloud Run/Functions-beloppen. Håll få versioner
  med en beslutad retention; städa inte ut rollback-artefakter godtyckligt.
- Trafik: anta initialt högst 10 GB CDN, 2 GB DB-egress och 1 GB filer i prod.
  Supabases inkluderade kvoter täcker dessa antaganden om de inte förbrukats
  av annan trafik. Cloud Run → extern tjänst och CDN/originförflyttning kan
  ge separata kostnader; faktisk regional nät-SKU/anslutningskostnad är inte
  fastställd här och måste räknas om vid Cloud Run-val.
- Loggar: anta högst 1 GiB/månad, standardloggar utan köpta add-ons. Längre
  revision/retention, exporter och egna metrics räknas separat. Vercel Hobby
  har kort logghistorik; en produktionsmodell för larm/revision återstår.
- Bygg: anta 100 standardbyggen/månad à 2 min, utan Turbo/build-add-ons.
  GitHub Actions/offentligt repos villkor och eventuella köpta Vercelbyggen
  måste kontrolleras i faktisk organisation; detta är ingen fakturaprognos.
- Resend/mejl (inklusive Auth), AI, domän, Telegram/övriga integrationer,
  PITR och extra deploying seats tillkommer. Supabase Pro:s dagliga backup
  är inte PITR. De är oförändrade gemensamma poster, inte en besparing av
  att flytta backend mellan leverantörer.

## Nästa beslut

Behåll Supabase Cron som huvudspår. Avgör Hobby-behörighet och önskad backup/
återhämtning med verkligt konto innan köp. Åtgärda den mätta batch-/anslutnings-
begränsningen i M22F och verifiera Vercel-/schedulergrindarna i M22G före pilot.
Cloud Run är ett kvarvarande alternativ om beta-, skalnings- eller tillitskraven
inte kan uppfyllas till rimlig kostnad. Inga abonnemang har uppgraderats här.

## Uppföljning M22F

[M22F](m22-recovery-results.md) ändrar gränsen från två starter per anrop till
flera sidor om två, högst 64 starter/256 kandidater inom mjuk tidsbudget.
Den tidigare uppskattningen 50 minuter per 100 gäller M22E:s gamla worker.
Minutprovets belastning är syntetisk återtagning, inte 100 nya leveranser varje
minut hela månaden. Kostnadsmodellen ovan har inte mätts om till en fakturaprognos;
CPU för kösökning, kalla starter, fel och ytterligare återförsök måste följas i
M22G. Inga priser, abonnemang eller kvoter har ändrats. Google Cloud-jämförelsen
är historiskt underlag och föranleder ingen ny utvärdering utan konkret hinder.
