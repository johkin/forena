# Kostnader och regioner

## Aktuellt underlag: M22E, en förening först

Läs [aktuell kalkyl](m22-costs.md), [last-/anslutningsrapport](m22-load-cost-results.md)
och [reproducerbara prisberäkningar](evidence/m22e-costs.json). Officiella källor
kontrollerades 2026-10-18 via tillgängligt webbverktyg/leverantörsdokumentation.
Supabase PostgreSQL/Auth och Supabase Cron behålls som huvudspår. Vercel fra1
ligger nära Supabase eu-central-1; Cloud Run-jämförelsen använder Belgien Tier 1,
inte Frankfurts Tier 2-pris. Inga kontoplaner eller regioner har bytts.

För en förening: cirka 25–30 USD/månad för prod med Supabase Pro/Micro och
Vercel Hobby om villkor/kvoter passar; cirka 45–50 med Pro. Extra ständigt
aktiv betald Micro-test tillför cirka 9,6 USD på organisationsnivå. Dev är lokal.
Detta är budget inklusive liten reserv, inte faktura/tak; mejl/AI/domän och
särskilda add-ons tillkommer. Delade avgifter/krediter räknas en gång.

## Historiskt M00-underlag: preliminärt GCP/Cloud SQL-scenario

Följande text är bevarad inventeringshistorik, **inte aktiv beställningsbudget**.
Dess overifierade prisfaktorer och tidigare nätbegränsning avser M00-tillfället;
använd M22E ovan för aktuella kontroller och antaganden.

Datum: 2026-10-18. Status: budgetunderlag, inte prisoffert eller godkänt driftbeslut.
Alla belopp är **USD per månad exklusive moms**. Ingen provisionering eller
åtkomst till produktionskonton har utförts. Faktisk trafik, avtal, fakturor,
kvoter och regionala SKU-priser har inte hämtats.

## Aktuell inriktning: Supabase PostgreSQL

Enligt ADR-008 behålls Supabase som värd för både verksamhetsdatabas och Auth.
Cloud SQL-tabellerna nedan är kvar som **jämförelsescenario**, inte aktuell
beställningsbudget. Cloud SQL-beräkning och SQL-disk/backup ska inte ingå i
huvudalternativet. Supabaseposten måste i stället dimensioneras för både
verksamhetsdata och Auth, inklusive rätt compute, backup/PITR och nättrafik.

Ingen ny verifierad totalsumma finns för detta alternativ. Det går inte att
bara subtrahera Cloud SQL från tidigare summa och anta att Supabaseposten är
oförändrad. Nästa kostnadsunderlag ska använda faktisk Supabaseplan och
resursanvändning, Cloud Run-region nära databasregionen samt trafik mellan
leverantörerna. Separata testprojekt och kontrollerade utskick kvarstår.

## Tidigare Cloud SQL-scenario och avgränsning

Planera Cloud Run för webbapp/API och arbetare, Cloud SQL PostgreSQL för
verksamhetsdata, Cloud Storage för filer och Firebase Hosting med CDN för
publika statiska resurser och samma origin till dynamiska routes. Behåll
Supabase Auth, Resend, AI Gateway och valbara Telegram/WhatsApp/Web Push.
Budgetera tre separata GCP-projekt: dev, test och prod.

Föreslå **europe-west1 (Belgien)** som första kandidat eftersom Firebase
Hostings direkta rewrite till Cloud Run förväntas stödjas där. Detta är ett
**overifierat antagande; stödet är otestat**. Förslaget får låsas
först efter kontroll av aktuell officiell regionlista och routingtest i test.
**europe-north2 (Stockholm)** är ett alternativ med separat beslut om
regionstöd, same-origin-routing och tillhörande kostnad; se nedan.

Målmodellen är inte en beskrivning av redan migrerad kod. Nuvarande dokument
beskriver Supabase SQL/RLS/RPC, Auth, Edge-arbetare, pg_cron/pg_net och
Vercel. Flytt till Cloud SQL kräver att Auth-identitet, behörighet, RLS,
privata scheman, transaktioner och RPC-beteende bevaras. Supabase Auth kan
inte antas använda Cloud SQL som sin hanterade Auth-databas. Behåll därför
budget för kvarvarande Supabase-projekt och dess underliggande resurser även
när verksamhetsdatabasen flyttas.

## Underlag och osäkerheter

Läst lokalt: [AGENTS.md](../../AGENTS.md),
[arkitektur](../architecture.md), [säkerhetsarkitektur](../security-architecture.md),
[schemalagda uppgifter](../scheduled-tasks.md), [MCP](../mcp.md),
[Telegram](../telegram.md), [WhatsApp](../whatsapp.md) och [README](../../README.md).

Nätpolicyn tillåter GitHub och råa GitHub-filer, men inte `cloud.google.com`,
`firebase.google.com`, `supabase.com` eller leverantörernas prissidor.
Googles officiella källor har därför **inte hämtats eller verifierats**;
begränsningen har inte kringgåtts. Supabase-changelog och aktuell Auth-produktstatus
är också overifierade. Providerkällan har däremot lästs via tillåten GitHub,
med låst commit nedan. Källgranskning är inte ett genomfört integrationstest.

Samtliga prisfaktorer och tabellintervall nedan är **egna kalkylantaganden**.
De är avsiktligt breda och ska ersättas med daterade regionala priser och
uppmätta volymer före inköp. Fria kvoter, introduktionskrediter,
årsbindning och organisationsrabatter räknas inte av. Beloppen utgör inte
ett garanterat tak; missbruk, felaktiga återförsök och större last kan överskrida dem.

## Miljöer och dimensionerande volymer

En månad räknas som 730 timmar; minutjobb använder 30 dygn för en enkel
volymuppskattning. GB betyder avrundad budgetenhet. Vid prisverifiering ska
GB/GiB och GB/TiB konverteras enligt respektive SKU.

| Antagande per månad | Dev | Test | Prod, inledande pilot/tidig drift |
| --- | ---: | ---: | ---: |
| Aktiva användare, syntetiska utanför prod | 10–30 | 50–200 | 1 000–5 000 |
| Dynamiska HTTP-anrop, exklusive jobb | 50 000 | 200 000 | 1–3 miljoner |
| Cloud Run aktiva instanstimmar, webb/API | 20–80 | 40–150 | 150–600 |
| SQL-form | Liten shared-core, ingen HA | 2 vCPU, cirka 8 GiB, ingen HA | 4 vCPU, cirka 16 GiB; HA separat scenario |
| SQL drifttid i basmodellen | 730 h | 730 h | 730 h |
| SQL provisionerad disk | 20 GB | 50 GB | 100–200 GB |
| Debiterbar backup/WAL-volym, uppskattning | 20–50 GB | 50–100 GB | 200–400 GB |
| Cloud Storage, genomsnittlig lagring | 10–30 GB | 30–100 GB | 100–500 GB |
| Publik statisk Hosting/CDN-trafik till klient | 5–20 GB | 20–80 GB | 100–400 GB |
| Övrig debiterbar egress, separat från Hosting | 5–20 GB | 20–80 GB | 50–300 GB |
| Logginmatning före filtrering | 2–10 GB | 5–30 GB | 20–100 GB |
| CI-byggminuter | 500–1 500 | 1 000–3 000 | 1 500–5 000 |
| Faktiska mejl inklusive Auth och reservkanal | 100–500 | 500–2 000 | 5 000–20 000 |
| AI-genereringar, webb och privat Telegram | 100–500 | 500–2 000 | 2 000–10 000 |
| WhatsApp debiterbara meddelanden, inklusive marginal | 0–100 | 0–200 | 1 000–5 000 |
| Telegram/Web Push leveransförsök | 100–1 000 | 500–5 000 | 10 000–100 000 |

Cloud Run räknas med cirka 1 vCPU och 0,5–1 GiB per aktiv instans,
requestbaserad debitering och `min-instances=0` i grundscenariot.
Instanstimmarna är sammanlagd aktiv tid efter samtidighet, inte summan av
alla requests individuella latenser. SSR, långa AI-svar och sessionförnyelser
kan öka tiden. Mät CPU, minne, samtidighet och kalla starter före dimensionering.

Två oberoende arbetare behöver i nuvarande modell köras varje minut:
`2 × 60 × 24 × 30 = 86 400` starter/månad/miljö vid ständig drift, även utan
användartrafik. Med 1–5 debiterade instanssekunder per start motsvarar det
24–120 aktiva instanstimmar, före extra batcher och återförsök. Kontrollera
eventuell minimidebitering för Cloud Run Jobs: korta minutjobb kan bli dyrare
än autentiserade anrop till en Cloud Run-tjänst. Budgetposten Jobs nedan
utgår från den senare lösningen för minutjobben och glesa riktiga Jobs för
underhåll. Ändras körformen måste kalkylen räknas om.

## Formler och preliminära prisfaktorer

Generellt: `månadskostnad = fast avgift + Σ(debiterbar volym × enhetspris)`.
Tabellernas intervall är avrundade budgetramar för ovanstående volymer,
med marginal för anropsavgifter och små fasta poster. De är inte exakta
SKU-summeringar. Nedanstående faktorer är beräkningshjälp, **inte verifierade priser**.

| Post | Formel och kalkylantagande |
| --- | --- |
| Cloud SQL beräkning | `730 × instanspris/timme`. Anta dev 0,048–0,103 USD/h, test 0,123–0,247, prod 0,247–0,438. Dev shared-core är ingen prestanda- eller tillgänglighetsreferens för prod. |
| SQL HA | Separat HA-SKU för primär och standby samt regional disk. Som budgetproxy används dubblerad prod-beräkning, inte en verifierad exakt HA-multiplikator. |
| SQL disk/backup/PITR | `provisionerade GB × 0,15–0,35 + debiterbara backup/WAL-GB × 0,08–0,15`, plus marginal. Använd HA-diskpris i HA-fallet. Diskens autogrowth är en kostnadsrisk. |
| Cloud Run webb/API | `vCPU-sekunder × p_cpu + GiB-sekunder × p_ram + anrop × p_request + eventuell tomgång`. Grov aktiv instansfaktor 0,06–0,25 USD/h för angiven resursstorlek. |
| Arbetare/Jobs | Samma resursformel, men `debiterad tid = Σ max(körtid, eventuell minimitid per körning)`. Återförsök och batchfortsättning läggs till. Budgeteras separat från webb/API. |
| Cloud Storage | `medel-GB × 0,02–0,04 + läs/skrivoperationer × respektive pris`. Versionering, soft delete och retention ökar medelvolymen. Filnedladdning ligger i egress. |
| Firebase Hosting/CDN | `lagrings-GB × p_storage + levererade GB × 0,10–0,20`, plus marginal. Anta 1–5 GB deployversioner. Ingen extra Cloud CDN-baspost i grundfallet. Dynamisk originberäkning ligger i Cloud Run. |
| Scheduler | `antal schemalagda jobb × antagen 0,10–0,50 USD/jobb/månad`. Anta 3–10 scheman, inte ett schema per förening/användare. Starter debiteras också hos måltjänsten. |
| Pub/Sub | `debiterbara publicerade + levererade byte × p_data + retention`. Anta 0,1–1/0,5–5/1–20 GB i dev/test/prod och 0,04–0,20 USD/GB som grov faktor, med marginal för avrundning och redelivery. |
| Logging/Monitoring | `inmatade GB × 0,40–0,80 + retention utöver inkluderat + debiterbara metrics/prober/larm`. Intervallen reserverar även utrymme för metrics och larm utan att anta fri kvot. |
| Secret Manager | `aktiva versioner × p_version + accesser × p_access`. Anta 10–30 versioner och 10 000–100 000 accesser; budget 1–8 USD per miljö. Hämta/cachea säkert per instans, inte i varje request. |
| Artifact Registry | `genomsnittlig imagevolym × 0,10–0,30 + eventuell skanning`. Anta 5–15/10–30/15–50 GB; retention/cleanup behövs. Imageöverföring ligger i egress. |
| CI | `debiterade runner-/byggminuter × 0,005–0,015 + artefakt/cachelagring`. Välj GitHub Actions eller Cloud Build som faktisk byggplats; samma bygge räknas inte två gånger. |
| Egress | `Σ GB per faktisk debiterad transportsträcka × 0,08–0,20`, plus marginal. Separera internet, regiongränser, databas/Auth, images och externa API:er. |

SQL är baslasten även när Cloud Run skalar till noll. Att stoppa en dev/test-
instans delar av månaden kan minska beräkningen (`timmar × pris`), men disk,
backup, återstarter och tjänstens stoppbegränsningar kvarstår och är inte
verifierade här. Ingen sådan besparing är inräknad. Ta inte bort backup eller
återställningstest för att nå en låg budget.

## Månatlig budget: GCP

| Post | Dev | Test | Prod, enkel zon | Prod, regional SQL HA |
| --- | ---: | ---: | ---: | ---: |
| Cloud SQL beräkning | 35–75 | 90–180 | 180–320 | 360–640 |
| SQL disk, backup och PITR/WAL-reserv | 6–15 | 12–30 | 35–90 | 60–155 |
| Cloud Run webb/API | 10–35 | 15–60 | 45–180 | 45–180 |
| Cloud Run arbetare och Jobs | 2–10 | 3–15 | 5–30 | 5–30 |
| Cloud Storage, operationer | 1–5 | 3–12 | 10–45 | 10–45 |
| Firebase Hosting/CDN, lagring och trafik | 1–5 | 3–15 | 15–65 | 15–65 |
| Cloud Scheduler | 1–3 | 1–3 | 1–5 | 1–5 |
| Pub/Sub | 0–2 | 0–3 | 1–10 | 1–10 |
| Logging och Monitoring | 2–10 | 5–25 | 15–80 | 15–80 |
| Secret Manager | 1–3 | 1–4 | 2–8 | 2–8 |
| Artifact Registry | 1–4 | 2–8 | 3–15 | 3–15 |
| CI, bygg och artefakter | 5–25 | 10–45 | 15–75 | 15–75 |
| Övrig egress | 1–5 | 3–15 | 10–60 | 10–60 |
| **GCP summa** | **66–197** | **148–415** | **337–983** | **542–1 368** |

Noll som lägsta Pub/Sub-belopp betyder avrundad låg kostnad, inte verifierad
kostnadsfrihet. Kölagring i PostgreSQL/outbox finns kvar i SQL-budgeten.
Pub/Sub används endast där extern distribution behövs; det ersätter inte atomiska affärsbeslut,
deduplicering eller beständiga checkpoints. Undvik två samtidiga ägare till
samma återförsöks- eller schemaläggningskedja.

HA-kolumnen skyddar inte automatiskt mot regionbortfall och ger inget fastställt
SLO. Enkel zon är ett jämförelsescenario, inte ett godkänt produktionsval.
Innan prod ska verksamheten besluta om SLO, RTO, RPO, jour och acceptabelt
underhållsfönster. Behåll **HA-budgeten som planeringsreserv tills beslutet är
fattat**. Cross-region DR, read replica och separat Identity Vault-databas
ingår inte och kräver egna offerter. Poolstorlek gånger maximala Cloud Run-
instanser måste rymmas inom SQL:s anslutningsbudget; lasttesta återanslutning
och återförsök vid failover.

## Kvarvarande tjänster och kanaltrafik

| Post | Modell | Dev | Test | Prod |
| --- | --- | ---: | ---: | ---: |
| Supabase Auth och kvarvarande projektresurser | `andel organisationsplan + projekt/compute + max(0, MAU − verifierad inkluderad kvot) × p_MAU + tillägg/egress`. Ingen kvot är verifierad; reservera för tre separata projekt. | 30–65 | 30–90 | 40–180 |
| Resend | `plan + övervolym × p_mail`, faktisk leveransvolym inklusive Auth, verifiering och reservmejl. | 0–10 | 0–15 | 20–70 |
| AI Gateway och modeller | `Σ(inputtoken × p_in + outputtoken × p_out)/1 000 000 + sökverktyg + eventuell gatewayavgift`. | 2–20 | 5–60 | 30–350 |
| WhatsApp | `Σ debiterbara meddelanden per land/mallkategori × p_kategori + eventuell nummer/BSP-avgift`. | 0–3 | 0–5 | 10–100 |
| Telegram och Web Push, leverantörsreserv | `eventuella kanalavgifter`; körning och nättrafik ligger redan i GCP-posterna. | 0–2 | 0–2 | 0–10 |
| **Externa tjänster summa** | | **32–100** | **35–172** | **100–710** |

Resends nollalternativ avser lokalt mejlsänke/mock eller avstängda liveutskick,
inte en verifierad gratisplan. Supabase-planavgiften ska bokas en gång per
organisation och fördelas till miljöerna; tabellen är reserver per miljö,
inte ett påstående att planavgiften tas ut tre gånger. Kontrollera både
projektens compute och eventuell skyldighet att behålla databaskapacitet för Auth.
Passkeys, OAuth Server, MFA, SMS, anpassad Auth-domän och andra plantillägg
är inte prisverifierade. SMS ingår inte; lägg till separat post om det införs.

AI-exempel för prod: anta 4 000 inputtoken och 800 outputtoken per generering,
0,5–3 USD/miljon inputtoken och 2–12 USD/miljon outputtoken. Då blir modell-
kostnaden vid 2 000–10 000 genereringar ungefär 7–216 USD. Lägg på
verktygsanrop, agentens flera modellsteg, återförsök och marginal till tabellens
30–350 USD. Dessa modellpriser är scenariotal. Webbsökning enligt README
debiteras separat. Utgå från samtliga modellsteg, inte bara antal chattfrågor.
Nuvarande Vercel OIDC kan inte antas fungera oförändrat på Cloud Run:
verifiera stödd Gateway-autentisering utanför Vercel och dess kostnad innan flytt.

Leveransordningen enligt arkitektur/Telegram är Telegram → WhatsApp → push →
e-post för aktiverade kanaler. Budgetera faktisk kanalvolym, inte fyra fulla
utskick för varje händelse. Ett barn per meddelande, partiell leverans,
direkta svarsbekräftelser, återförsök och dubbletter kan däremot öka volymen.
Som WhatsApp-känslighetsanalys används 0,01–0,02 USD per debiterbart meddelande
för 1 000–5 000 meddelanden, alltså 10–100 USD. Detta är **inte verifierad
svensk Meta-prissättning** eller verifierad mallkategori; högre kategoriavgift
eller BSP-abonnemang kräver höjd budget. Telegrams vanliga bottrafik och Web
Push antas sakna separat styckavgift i grundfallet; aktuella villkor, gränser
och eventuell betald broadcast måste kontrolleras. Telegrams privata AI-frågor
belastar AI-posten; gruppfrågor ska inte öppnas genom migrationen.

## Samlad ram och kostnader utanför grundscenariot

| Scenario | Månadskostnad USD exkl. moms |
| --- | ---: |
| Dev, GCP och externa tjänster | 98–297 |
| Test, GCP och externa tjänster | 183–587 |
| Prod enkel zon, GCP och externa tjänster | 437–1 693 |
| Prod SQL HA, GCP och externa tjänster | 642–2 078 |
| Alla tre miljöer, prod enkel zon | 718–2 577 |
| Alla tre miljöer, prod SQL HA | 923–2 962 |
| Alla tre med prod HA och 25 % osäkerhetsreserv, avrundat | 1 155–3 705 |

Intervallen är samvariation mellan låga respektive höga antaganden, inte
statistiska konfidensintervall. Budgetlarm per projekt och leverantör bör
läggas vid 50/80/100 % av beslutad ram. Budgetlarm är inte kostnadstak;
komplettera med maxinstanser, AI-budget, utskickstak och begränsade återförsök.

Följande tillkommer endast om valt eller nödvändigt och ingår **inte** i summorna:

- Varm Cloud Run-instans: reservera cirka 10–100 USD/miljö/månad beroende
  på tomgångsmodell och resurser. Verifiera SKU innan beslut.
- VPC-connector, Cloud NAT, statisk utgående IP och extra nätkomponenter:
  preliminär reserv 30–150 USD/miljö/månad plus trafik. Välj stödd anslutning
  till privat SQL efter jämförelse med Direct VPC egress och mät nätvägen.
- Alternativ same-origin-ingress för Stockholm: reserv 25–100 USD/månad
  i fasta/routingrelaterade poster plus bearbetning, CDN och egress; se regiongate.
- KMS/fältnivåkryptering, längre auditretention, supportavtal, domänavgifter,
  dedikerad WAF och regionöverskridande katastrofberedskap kräver egna poster.
  Nyckelhantering för personnummer är ett krav före riktiga data, inte en
  valfri besparing; dess ännu okända kostnad blockerar slutlig budget.
- Migreringsarbete, säkerhetsgranskning, incidentberedskap och personalkostnad
  saknar uppskattning och ingår inte. Under parallell drift tillkommer gamla
  Vercel/Supabase-resurser och kopiering/validering. Räkna `antal överlappande
  månader × faktiskt kvarvarande månadsbelopp + överföringskostnad`; besparing
  får bokas först när resurser verkligen avvecklats.

Egress får bara summeras efter kartläggning av transportsträckorna. Hosting-
trafiken i tabellen avser publika statiska resurser. Cloud Run-svar genom rewrite,
filer från Storage, extern Auth, AI och imagehämtning behöver egna mätvärden
och aktuell debiteringsregel. Samma byte på samma debiteringssträcka ska inte
räknas både i Hosting och övrig egress. Om flera led faktiskt debiteras ska
samtliga tas med. Cacheträffar minskar originlast men tar inte bort CDN-trafiken.

## Regioner och beslutsgater

| Fråga | europe-west1, förstahandskandidat | europe-north2, Stockholm |
| --- | --- | --- |
| Cloud Run och SQL | Samlokalisera webb/API, arbetare och SQL; aktuell produkt-, edition- och HA-tillgänglighet ej verifierad. | Samma mål, men Cloud Run/Jobs, SQL PostgreSQL, vald maskintyp och HA måste verifieras för exakt region. |
| Firebase Hosting rewrite | Förväntat stöd är skälet till förslaget; officiell lista ej läst i denna miljö. | Direkt rewrite-stöd är okänt. Behandla det som en blockerande gate, inte som säkert stöd eller säkert förbud. |
| Same-origin | Firebase Hosting → Cloud Run för dynamiska routes, under förutsättning att stöd och beteende verifieras. | Om direkt rewrite saknas: utred extern Application Load Balancer/serverless NEG och stödd statisk origin/CDN under en gemensam domän, eller explicit proxy i stödd region. Båda kräver arkitekturbeslut och test. |
| Kostnad | Grundtabellen, utan garanterad regional prisnivå. | Grundtabellen är endast jämförelsebas; lägg till routingreserv 25–100 USD/månad och räkna regionala SKU:er, bearbetade GB och eventuell interregiontrafik på nytt. |
| Dataplacering | EU-region för regionala resurser; Hosting-CDN och externa tjänster är separata frågor. | Svensk origin innebär inte automatiskt svensk lagring/behandling hos CDN, Auth, Resend, AI eller kanaler. |

En separat `api`-subdomän uppfyller inte kravet på samma origin. En proxy i
europe-west1 framför Stockholm ger extra hopp, driftansvar och potentiell
interregionkostnad; budgetera `proxyinstanstid + antal anrop + överförda GB ×
regionalt nätpris`. Att dela samma origin via en ny lastbalanserare kan kräva
annan statisk hostinglösning än Firebase Hosting. Anta inte att Firebase
Hosting direkt kan användas som valfri lastbalanserarbackend. Om denna väg
väljs ersätts berörda Hosting/CDN-poster så att budgeten inte dubbelräknar.

Regionbeslutet kräver följande underlag före Terraform-plan för målmiljön:

1. Kontrollera aktuell Firebase Hosting-lista för **direkta Cloud Run rewrites**
   mot officiell källa; spara datum, exakt region och begränsningar. Förväxla
   inte Hosting med Firebase App Hosting eller en generell Cloud Run-regionlista.
2. Kontrollera Cloud Run/Jobs, SQL edition/maskintyp/HA/PITR, Storage,
   Artifact Registry och regionala loggbuckets i vald region. Fastställ separat
   vilka Scheduler/Pub/Sub-egenskaper och lagringspolicyer som faktiskt är regionala.
3. Kör testdeploy med syntetiska data: SSR, server actions/POST, Auth-cookieförnyelse,
   callback, OAuth consent/discovery, MCP, AI-streaming och signerade webhooks.
   Verifiera timeout, body/headergränser, cacheförbud och kanonisk `SITE_URL`.
4. Verifiera databehandlingsavtal och platser för databas, backup, loggar,
   hemligheter, Supabase Auth och externa leverantörer. Privat API/RSC och
   medlemsdata får inte cachas i CDN; bara godkända publika resurser.
5. Hämta daterad regional prisberäkning inklusive alternativ ingress och
   SQL HA; besluta SLO/RTO/RPO och dokumentera vald väg. Varken Stockholm
   eller Belgien är slutligt godkända genom detta dokument.

## Separation av projekt, testdata och utskick

Varje miljö ska ha egen SQL-instans, buckets, servicekonton/IAM, Pub/Sub-köer,
Scheduler, secrets, budget och behörighetsgräns. Separera också Firebase-
koppling/hosting, Supabase Auth-projekt, OAuth-klienter/callbacks och tillåtna
origins. Ett gemensamt faktureringskonto är möjligt men ersätter inte separation.
Terraform-state ska vara åtkomststyrd och miljöseparerad; inga hemligheter
eller statefiler ska versionshanteras.

Dev/test använder enbart syntetiska personer och filer; inga prodbackuper,
medlemsregister eller riktiga skyddade uppgifter. Dev har lokalt mejlsänke/mock.
Testutskick kräver explicit mottagarlista som kontrolleras på serversidan
även för Auth-mail och reservkanaler. Använd separata Resend-nycklar/
avsändardomäner, Telegram-botar/token/webhooks, WhatsApp-testnummer/testapp
och pushnycklar/prenumerationer. En Telegram-bot kan bara ha en webhook;
test får inte skriva över produktionens. Stäng av livekanaler som förval och
använd låga miljöspecifika utskicks- och AI-tak. Testa negativa fall där
syntetiska testhändelser försöker nå produktionsmottagare.

Säkerhetsloggar ska innehålla nödvändig auditmetadata men inte personnummer,
promptar, mejlinnehåll, tokens eller Telegram-URL:er med bothemlighet.
Separera kortlivade driftloggar från beslutad auditretention. Logging-
exkludering får inte tysta obligatorisk audit. Retention för outbox och
kanalsnapshots följer nuvarande regler tills separat beslut fattats.

## Supabase Terraform: verifierad källa och kvarstående granskning

Granskat offentligt repo: `supabase/terraform-provider-supabase`, HEAD upplöst
med `git ls-remote` till **c08106ad3c6e3ba74393e574c6e93834d9d9f47c** den
2026-10-18. Källarkivet för denna commit lästes i minnet; inga providerfiler
skrevs till arbetsytan. `main`-dokumentation lästes först; slutsatserna om
implementation knyts till den låsta committen. Ingen Terraform `init`,
`plan`, `import` eller `apply`, API-skrivning eller hemlighetshämtning gjordes.

| Del | Verifierat i providerkällan | Inte verifierat / beslutsgate |
| --- | --- | --- |
| Projekt och Auth-inställningar | `supabase_project` och `supabase_settings` registreras. `supabase_settings.auth` är normaliserad JSON-sträng. `updateAuthConfig` avkodar till `api.UpdateAuthConfigBody` och anropar `V1UpdateAuthServiceConfigWithResponse`; läsning använder motsvarande GET och typkonvertering. | Detta är inte obegränsad vidarebefordran av valfri JSON. Exakta tillåtna fält beror på den importerade API-typen och aktuell Management API. Okända fält får inte antas fungera. |
| Beroendeversion | `go.mod` anger `github.com/supabase/cli/pkg v1.2.3` för API-klienten. | Den genererade typens fulla fältlista och körning mot aktuell Auth-tjänst granskades inte. Källcommit är inte bevis att samma kod finns i en publicerad providerrelease. |
| Social OAuth-inloggning | Källan bevarar bland annat `ExternalGoogleSecret`, andra externa providers hemligheter och Apple-klientrelaterade värden vid konvertering/läsning. | Komplett OAuth-konfiguration, klient-id, redirect-listor, externa konsolinställningar och roundtrip mot vald providerrelease är inte testade. |
| Supabase som OAuth-server för MCP | Generisk Auth-konfiguration finns. Ingen separat OAuth-klient/server-resurs syns i registrerade resurser i granskad commit. | Aktivering av OAuth Server, consent path, dynamisk registrering, klientregistrering och resource-audience är inte verifierat Terraform-stöd. Social OAuth eller third-party JWT-stöd bevisar inte detta. |
| Passkeys/WebAuthn | Ingen särskild passkey/WebAuthn-resurs registreras. Sökning i providerns egna Go-filer hittade inga uttryckliga passkey/WebAuthn-fält. | Frånvaron bevisar inte att stödet saknas i beroendet/API:t. Stöd för enablement, RP ID, origins, användarregistrering, återställning och step-up är **inte verifierat**. |
| Third-party Auth | `supabase_third_party_auth` har exakt ett av `oidc_issuer_url`, `jwks_url`, `custom_jwks`; sista fältet avser publika verifieringsnycklar. | Denna resurs är inte bevis för passkeys, social OAuth-klientregistrering eller Supabase OAuth Server. Privata/symmetriska nycklar hör inte hemma där. |
| Drift och hemligheter | Inställningsdokumentationen och implementationen bevarar flera write-only/hemliga värden från tidigare state när API:t returnerar hash. | `plan` kan därmed missa ändringar gjorda utanför Terraform. Auth-JSON/state kan bära hemligheter; känslighetsmarkering är inte kryptering. Driftkontroll, stateåtkomst och separat rotation måste beslutas. |

Före implementation ska ansvarig låsa en **publicerad providerversion och
checksumma**, granska dess faktiska `UpdateAuthConfigBody` och dokumentera
exakta fält för passkeys respektive OAuth Server. Gör därefter en avgränsad
roundtrip i separat testprojekt med syntetiskt konto: skapa/ändra/läs tillbaka,
granska diff och verifiera verklig inloggning, callback, fel origin och
behörighet. Om API/provider saknar stöd ska en uttryckligt dokumenterad manuell
inställning med driftkontroll användas tills stödet finns; hitta inte på
Terraform-fält eller markera funktionen som automatiserad.

MCP-dokumentets krav gäller fortsatt: exakt klientlista och resource-audience,
RLS-granskning, PKCE och samtycke; lämna OAuth avstängt tills flödet är verifierat.
Vid Cloud SQL krävs även verifierat identitets-/RLS-flöde där; kvarvarande
Supabase Auth innebär inte att `auth.uid()` och Auth-tabellkopplingar följer med
automatiskt. Ingen hemlighet eller verklig konfiguration ingår i detta dokument.

## Källor och verifieringsstatus

**Verifierat genom läsning av offentlig GitHub-källa**, commit ovan:

- [Resursregistrering](https://github.com/supabase/terraform-provider-supabase/blob/c08106ad3c6e3ba74393e574c6e93834d9d9f47c/internal/provider/provider.go).
- [Settings: schema, typad Auth-uppdatering och statehantering](https://github.com/supabase/terraform-provider-supabase/blob/c08106ad3c6e3ba74393e574c6e93834d9d9f47c/internal/provider/settings_resource.go).
- [Third-party Auth: OIDC/JWKS](https://github.com/supabase/terraform-provider-supabase/blob/c08106ad3c6e3ba74393e574c6e93834d9d9f47c/internal/provider/third_party_auth_resource.go).
- [Låst API-klientberoende i go.mod](https://github.com/supabase/terraform-provider-supabase/blob/c08106ad3c6e3ba74393e574c6e93834d9d9f47c/go.mod).
- [Settings-dokumentation](https://github.com/supabase/terraform-provider-supabase/blob/c08106ad3c6e3ba74393e574c6e93834d9d9f47c/docs/resources/settings.md)
  och [projektresurs](https://github.com/supabase/terraform-provider-supabase/blob/c08106ad3c6e3ba74393e574c6e93834d9d9f47c/docs/resources/project.md)
  som kompletterande schemaöversikt; motsvarande `main`-sidor lästes initialt.

**Officiella kontrollpunkter, ej hämtade/verifierade i denna miljö**:

- Firebase Hosting/Cloud Run-regioner och rewrite:
  <https://firebase.google.com/docs/hosting/cloud-run> och
  <https://firebase.google.com/docs/hosting/full-config>.
- Cloud Run/Jobs-regioner och priser:
  <https://cloud.google.com/run/docs/locations>,
  <https://cloud.google.com/run/pricing>.
- Cloud SQL regioner, HA och pris:
  <https://cloud.google.com/sql/docs/postgres/locations>,
  <https://cloud.google.com/sql/docs/postgres/high-availability>,
  <https://cloud.google.com/sql/pricing>.
- Hosting och Storage:
  <https://firebase.google.com/pricing>,
  <https://cloud.google.com/storage/pricing>.
- Scheduler, Pub/Sub och observability:
  <https://cloud.google.com/scheduler/pricing>,
  <https://cloud.google.com/pubsub/pricing>,
  <https://cloud.google.com/stackdriver/pricing>.
- Secrets, registry, CI och nät:
  <https://cloud.google.com/secret-manager/pricing>,
  <https://cloud.google.com/artifact-registry/pricing>,
  <https://cloud.google.com/build/pricing>,
  <https://cloud.google.com/vpc/network-pricing>,
  <https://cloud.google.com/load-balancing/pricing>.
- Kvarvarande leverantörer:
  <https://supabase.com/pricing>, <https://supabase.com/changelog>,
  <https://resend.com/pricing>, <https://vercel.com/docs/ai-gateway/pricing>,
  <https://business.whatsapp.com/products/platform-pricing>,
  <https://core.telegram.org/bots/faq>.

Lokala länkar, tabellsummor och dokumentdiff kontrolleras som dokumentations-
validering. Inga aktuella molnpriser, regionfunktioner, SLO-egenskaper eller
liveflöden ska betraktas som verifierade av den kontrollen.
