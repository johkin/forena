# M22C: Schemalagd återhämtning efter abrupt JVM-död

Datum: 2026-10-18. Bas: PR #101 mergad som
`175fc5e28737a4b2b02598ee1ffd012c6a3c1041`. Separat branch från main:
`test/scheduled-jvm-crash`. [Uppgift](tasks/m22c-scheduled-crash.md).
Endast Supabase/Vercel-projekten forena-kotlin berörs. Data API behålls avstängt.

## Ändrat provbeteende och transaktionsgräns

ProbeListener är en ApplicationModuleListener med en egen transaktion.
Modulith 2.1.0:s CompletionRegisteringMethodInterceptor har order
HIGHEST_PRECEDENCE + 10 och omsluter transaktionsinterceptorn. I dess invoke
sker MethodInvocation.proceed före markeringen av slutförd publicering.
Transaktionen för probe_effect kan därmed ha committats innan registret
kvitteras. Det verifieras också av processprovet nedan; det är inte bara ett
antagande om annoteringarnas ordning.

Ny intern ProbeFaults kan avsiktligt avsluta JVM:en med Runtime.halt(137):

- BEFORE_EFFECT: efter att ett separat beständigt försök registrerats, före
  effektens INSERT.
- AFTER_EFFECT_COMMIT: en TransactionSynchronization.afterCommit-callback,
  efter effektens commit och före återgång till Moduliths yttre kvittensrådgivare.

Båda gäller bara frisläppta syntetiska BLOCK-händelser när PROBE_ALLOW_CRASH=true.
Ingen ny HTTP-endpoint eller behörighet för workertokenen införs. Förvalet är
fortfarande false. CRASH väljs fortfarande aldrig av ProbeWorker.

Liquibase probe-002-faults lägger till en privat probe_fault-tabell. En
SQL-operatör skapar armeringen med körnings-ID och felpunkt. Runtime får SELECT
och UPDATE enbart på konsumtionskolumnerna, inte INSERT, DELETE eller ändring
av ID/felpunkt. En atomär villkorad UPDATE i REQUIRES_NEW förbrukar armeringen
innan halt. Två JVM:er får därför inte båda en lyckad claim för samma oförändrade
armering. Även callbacken måste använda REQUIRES_NEW eftersom den gamla
transaktionens resurser fortfarande kan vara bundna efter commit.

Detta är ett kontrollerat felprov, ingen säkerhetsgräns mot godtycklig SQL från
ett komprometterat runtimekonto: SQL-kontot kan ändra konsumtionskolumnerna,
inklusive återställa dem. Endast betrodda SQL-konton får användas och armeringar
tas bort efter provet. Detta utökar inte produktionsgodkännandet från M22B.

## Lokal verifiering

29 JUnit-/PostgreSQL-tester godkända, inklusive fyra nya fall för rättigheter,
fel fas/okänt ID, samtidiga claims och avstängd felinjektion som förval.
Strukturverifiering och riktigt Modulith-modultest är kvar.

`python3 scripts/probe/local-lifecycle.py --concurrent-recovery --scheduled-crash`
körde riktiga processer mot engångs-PostgreSQL. Båda felpunkterna gav JVM-exit
137, en oavslutad publicering och ny JVM vid återtag. BEFORE_EFFECT gav 0
effekter före återtag; AFTER_EFFECT_COMMIT gav 1. Upprepat återtag gav i båda
fallen exakt 1 effekt och 0 oavslutade publiceringar. Tre samtidighetsomgångar
med workeranrop till två separata JVM:er gav två HTTP 200, en effekt och slutlig
kvittens per händelse. [Sanerat lokalt bevis](evidence/m22c-local-crash.json).

Befintlig frontend: 131 testfiler/1 065 tester, typecheck, lint och build
godkända lokalt. Sex befintliga M22B-regressionstester godkända. CI behåller
alla kontroller och kör nu också de nya faktiska processkrascherna.

## Molnprovets identitet och metod

- Preview: <https://forena-kotlin-kq4zfdbo1-johkin.vercel.app>,
  deployment `dpl_3rYtTVoBmahAdq3uKunFyMmX3hCK`.
- [Källmanifest](evidence/m22c-source-files.json): samtliga 28 bygg-/runtimefiler.
- Boot 4.1.0, Kotlin 2.4.20, Oracle JDK 26.0.2.1+1-7, Maven 3.9.11 och
  Modulith 2.1.0 oförändrade. Vercels kraschlogg verifierar fra1.
- Liquibase kördes separat från runtime i en tillfällig Vercel Sandbox med
  verify-full TLS mot Frankfurt-sessionpoolern. Upgrade från probe-001 till
  probe-002-faults bevarade de 6 befintliga körningarna/effekterna/publiceringarna
  (antal kontrollerade, inte en fullständig checksummetest av all data).
- Nya tabellens initiala ägare blev det temporära migrationskontot. Ägarskapet
  överfördes av det kontot till forena_probe_migrator och verifierades via SQL.
  Kontots LOGIN och medlemskap stängdes därefter av. Dess lösenord var tidsbegränsat.
  Ingen migrationcredential placerades i Vercelfunktionens runtime.

En andra engångsklient skapade en 1 s- och en 60 s-BLOCK-händelse, med sista
fullständiga appsvar 18:46:59.654498 UTC. Klienten stoppades 18:48:04 UTC.
Cron tilläts skicka HTTP först efter 18:49:29.654498, minst 150 s efter svaret.
Efter seed gjordes inga användar-, health- eller statusanrop till appen.
Observationerna var SQL och leverantörens driftloggar.

Jobb 2, forena-kotlin-m22, kör varje minut. Befintligt invoke_worker ansvarar
för högst tio HTTP-anrop och utgångstid 19:02:57 UTC. Normal transporttimeout
180 s används; inga avsiktliga HTTP-timeouter injiceras i M22C. Efter att båda
felpunkterna förbrukats skickas två workeranrop i samma Cron-transaktion.
Detta använder samma Modulith-register, ingen ytterligare outbox.

Första kraschen: 18:50:15.900 UTC loggar JVM
2596724b-55e2-4d32-aba5-0823c17f123b BEFORE_EFFECT. Vercel bekräftar
Application exited with code 137 kl. 18:50:16.225. SQL-snapshot 18:50:53 visar
0 effekter och PROCESSING utan kvittens för den händelsen. HTTP-statusen var
500, men Cron:s SQL-körning succeeded. Det är JVM-loggen och databasen som
bevisar kraschens felpunkt, inte HTTP-felet.

Andra kraschen: händelsen med 60 s fördröjning committade effekten
18:52:14.841159. JVM c6981523-66b7-41c6-a7c2-5510b546be31 registrerade
AFTER_EFFECT_COMMIT 18:52:14.867 och Vercel bekräftade exit 137 kl.
18:52:15.190. SQL-snapshot 18:53:16 visar den committade effekten från denna
JVM men fortfarande ingen leveranskvittens. Då hade nästa Cron-återtag startat
en lyssnare i en annan JVM, 31ce873c-7d37-4062-b883-29d63afa0eb6.

| Felpunkt och händelse | Effekt efter krasch | Slutlig effekt | Registerkvittens, UTC |
| --- | --- | --- | --- |
| BEFORE_EFFECT, 145e727b-69c0-401f-a7fa-6fdfdcb9e9e0 | 0 | 1, skapad av ny JVM 18:52:31.498242 | 18:52:31.513407 |
| AFTER_EFFECT_COMMIT, 7c402fdb-7cf2-4f7d-af72-a6bd8fbcd93d | 1 | Samma ursprungliga effekt, ingen ny rad/tid/skapande JVM | 18:54:15.690501 |

Båda händelserna fick tre beständiga försöksstarter: ursprunglig publicering,
kraschande worker och återtag. Varje händelse observerades i tre olika JVM:er.
När registret återlevererade den redan sparade effekten skyddade den unika
nyckeln mot en andra effekt; lyssnaren kunde därefter returnera och kvitteras.

Cron köade två HTTP-anrop kl. 18:53 (request-ID 28 och 29). Båda valde samma
publicering och väntade på samma slutkvittens; SQL visar bara en ny
lyssnarstart för denna runda. Detta verifierar överlappande workeranrop i
molnet, inte konkurrens mellan två bevisat olika moln-JVM:er för just rundan.
Separata JVM:er konkurrerade i det lokala treomgångsprovet.
Anrop 30/31 kl. 18:54 returnerade tomma resultat efter slutförandet, utan fler
effekter eller försöksstarter. pg_net:s sparade created-tid är inte ett
tillförlitligt mått på HTTP-sluttid; använd driftloggar och SQL-snapshots.

## Städning: åtkomst återkallad, radrensning kvarstår

Cron stängde av sig själv efter tio anrop, verifierat 18:56:41 UTC. Previewns
share-grant är återkallad och den tidsbegränsade länken har också löpt ut.
Seedklienten är stoppad. Den första migrationsklienten nådde sin 15-minuters-
gräns medan ett verktygsanrop fördröjdes; leverantören bekräftade sandbox_stopped.
Inga nya appanrop behövdes för att observera eller slutföra provet.

Previewförvalets PROBE_ALLOW_CRASH är återställt till false för kommande
deployments. Den befintliga provdeploymentens miljö är oföränderlig; dess
åtkomst är återkallad och alla armeringar är förbrukade. Normalt förval i kod
är false. Det tillfälliga migrationskontot finns kvar som NOLOGIN utan
medlemskap, med utgånget lösenord; nya tabellen ägs av forena_probe_migrator.

DELETE-städningen misslyckades två gånger i execute_sql och en gång via
apply_migration med `McpServerError: Invalid or expired requestState`.
Detta är ett tekniskt fel från verktyget; inget uttryckligt säkerhetsavslag
eller skäl för ett sådant returnerades. Ingen av radrensningarna verifierades
som utförd och den misslyckade städmigreringen räknas inte som applicerad.

För att inte lämna riktiga provcredentials i Vault neutraliserades alla tre
värden via den dokumenterade vault.update_secret-funktionen. SQL-kontroll
20:21:21 UTC bekräftade att alla tre är ersatta med en ofarlig fast markör.
Själva värdena loggades inte. Kvar för radrensning: 3 neutraliserade Vault-
poster, 2 förbrukade fault-rader, 10 HTTP-responser, 10 transportkorrelationer
och 1 utgången inställningsrad. Kön är tom och inga publiceringar är oavslutade.

Den snävt avgränsade [städ-SQL-filen](../../scripts/probe/m22c-cleanup.sql) kan
köras i testprojektets SQL Editor eller efter att verktygsfelet åtgärdats.
Radrensningen måste verifieras innan nästa molnprov som återanvänder dessa
tabeller/hemlighetsnamn. Testresultatet är godkänt, men hela uppgiftens städning
ska **inte** markeras som avslutad än. Ordinarie Förena är oförändrat.

## Begränsningar och fortsatt arbete

Provet injicerar Runtime.halt(137), inte OOM eller en observerad extern SIGKILL.
Vercel beskriver koden som SIGKILL i sin logg; det ändrar inte injektionsmetoden.
Resultatet kan visa återtag efter abrupt processdöd men ger ingen garanti för
nödvändigt bakgrundsarbete efter ett avslutat HTTP-svar.

Unik probe_effect.id skyddar databaseffekten. Detta bevisar inte exakt ett mejl
eller annat externt utskick. Globala workerleases införs inte. Moduliths
obundna predicate-läsning, mjuka tidsbudget, anslutningsbudget och kostnader
återstår i M22. pg_net:s credentialtillit till SQL-konton kvarstår enligt
[M22B](m22-isolation-results.md). Inget hosting- eller produktionsval görs här.


## Senare städning, verifierad i M22E

2026-10-18 lyckades den oförändrade `scripts/probe/m22c-cleanup.sql` via
Supabase execute_sql. Oberoende läskontroll 21:09:10.194344 UTC visar noll
provjobb, köposter, Vault-poster, faults, calls, settings, responser 25–34 och
oavslutade publiceringar. Tidigare requestState-fel och dåvarande restposter
ovan är historiska observationer; radrensningen är nu avslutad.
[Städbevis](evidence/m22e-cleanup.json). Befintliga syntetiska effekter och
körningar behölls. Ingen ny molnlast eller ny schemaläggning kördes i M22E.
