# Isolerat Vercel/Kotlin-prov

Detta är M21:s teknikprov, inte Förena-backend för riktiga användare. Använd
endast projekten `forena-kotlin` och syntetiska körningar. Ingen mejl-, push-,
Telegram-, AI- eller MCP-integration aktiveras. Frontendens testsida serveras av
samma JVM; detta bevisar inte ännu separat React-/Next.js-Services-routing.

## Verktyg och byggning

- Oracle JDK **26.0.2.1+1-7**, Kotlin **2.4.20**, Spring Boot **4.1.0**.
- Maven Wrapper **3.9.11**, wrapper **3.3.4**, Modulith **2.1.0**.
- JDK-arkiv och Maven-distribution verifieras med SHA-256; Dockerbasen är låst
  med digest. Samma JDK används lokalt, i CI, byggcontainer och runtime.
- JDK 26:s livslängd och Oracles licensvillkor måste bedömas före produktionsval.

Från reporoten:

```sh
scripts/probe/install-jdk.sh /tmp/forena-jdk
export JAVA_HOME=/tmp/forena-jdk
export PATH="$JAVA_HOME/bin:$PATH"
cd backend
./mvnw --batch-mode --no-transfer-progress verify
cd ..
python3 scripts/probe/local-lifecycle.py
python3 scripts/probe/local-lifecycle.py --concurrent-recovery
```

Docker krävs för PostgreSQL-tester och processprovet. I en miljö med skrivskyddad
hemkatalog kan `MAVEN_USER_HOME` sättas till en skrivbar arbetskatalog.
Använd miljöns normala proxy/CA-inställningar; stäng inte av TLS-verifiering.

```sh
docker build -f backend/Dockerfile.vercel -t forena-kotlin-probe:spike backend
```

Den hanterade Codex-miljön behöver dessutom BuildKit-secret `proxy_ca` enligt
molnmiljöns instruktioner. Byggcertifikatet kopieras inte till runtime-image.

## Databasägarskap och isolering

Endast det privata schemat `forena_probe` används; det ska inte exponeras i
Supabases Data API. Bootstrap skapar `forena_probe_migrator` som schemaägare
samt `forena_probe_runtime` med DML-behörighet och utan superuser/BYPASSRLS.
Bootstrap och lösenord hanteras separat från applikationens Liquibase-changelog.
Auth, Storage och befintliga Förena-scheman ändras inte.

Liquibase körs som ett **separat steg**, med migreringskontot och
`PROBE_MIGRATE=true`; processen avslutas efter uppdateringen. Kör en gång till
för att verifiera att inga changesets återappliceras. Normala deployments får
inte migreringskontots lösenord och `PROBE_MIGRATE` är false som förval.
Moduliths schema-init är avstängd; v2-tabellen från Modulith 2.1.0:s publicerade
PostgreSQL-DDL ingår i Liquibase. Runtime får inte läsa Liquibase-metadata.

Konfiguration via miljövariabler, aldrig incheckade credentials:

| Variabel | Innehåll |
| --- | --- |
| `PROBE_JDBC_URL` | JDBC-URL till testprojektet; session pooler rekommenderas när IPv6 saknas. `sslmode=verify-full` och korrekt certifikatförtroende krävs. |
| `PROBE_DB_USERNAME` / `PROBE_DB_PASSWORD` | Begränsat runtimekonto; poolern kan kräva `.projektref` efter användarnamnet. |
| `PROBE_TOKEN` | Separat slumpmässig hemlighet, minst 32 tecken, för alla prov-API:er. Detta är inte Supabase-användarautentisering. |
| `PROBE_MIGRATE` | Endast true för det separata migreringssteget. |
| `PROBE_MIGRATION_USERNAME` / `PROBE_MIGRATION_PASSWORD` | Endast i migreringsjobbet. |
| `PROBE_ALLOW_CRASH` | False som förval. Endast true i det isolerade provet för avsiktlig JVM-terminering. |
| `PORT` | Vercel-containern använder port 80; lokal app 8080. |

Databaspoolen har högst fyra anslutningar per instans. Rollens anslutningsgräns
är 16 i Supabase-provet. Det är ett begränsat experiment, inte lastdimensionering.

## TLS-certifikat

`certs/supabase-ca.crt` är det offentliga **Supabase Root 2021 CA**, hämtat över
verifierad HTTPS från Supabases distributionsbucket:
`https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`.
SHA-256-certifikatfingeravtryck: `807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA`.
Giltigt till 2031-04-26. Det innehåller ingen privat nyckel. Runtime-URL använder
`sslmode=verify-full&sslrootcert=/app/supabase-ca.crt`; provklienten anger samma
CA. Rotation och utgång måste hanteras före produktionsbruk. En tidigare körning
med enbart JVM:s standardrötter nekades korrekt med PKIX-fel; TLS stängdes inte av.

## Prov-API och säkerhetsgräns

`POST /api/probes` tar `id` (UUID/idempotensnyckel), `delayMs` (0–90000) och
`mode`: NORMAL, BLOCK eller CRASH. Alla API-anrop kräver `Authorization: Bearer`.
API:t sparar testkommandot och Moduliths leveranspost i samma transaktion och
returnerar 202. Lyssnaren fördröjs avsiktligt och sparar en unik effekt per ID.
BLOCK misslyckas tills körningen frisläpps. CRASH avslutar JVM med kod 137 före
kvittens, och är avstängt om inte `PROBE_ALLOW_CRASH=true`.

`POST /api/probes/{id}/recover` frisläpper körningen och begär omleverans från
Modulith. Anropet väntar högst 100 sekunder på effekten; det räcker inte att
starta en ny asynkron tråd och returnera. Samma effekt kan inte sparas två gånger.
`GET /api/probes/{id}` är till för felsökning, inte observationspollning under
livscykelprovet. Hälsokontroll och den syntetiska testsidan är publika bakom
Vercels ordinarie Deployment Protection.

Den statiska testsidan är ingen produktkomponent. Den ändrar inte Förena-UI
eller dess komponentsida. Token lagras inte i localStorage eller webbläsarcookies.

## Vad testerna faktiskt bevisar

- Riktig HTTP-response har mottagits innan kvittensmarkören skrivs direkt i DB.
- Effekten kan observeras efter markören utan fler HTTP-anrop till appen.
- Rollback tar bort både verksamhetspost och beständig händelse.
- Samtidiga omförsök med samma idempotensnyckel publicerar en gång.
- Blockerad lyssnare kan återtas, återspelning ger en sparad effekt.
- Lokal abrupt processdöd lämnar en oavslutad post; en ny JVM återtar den.
- Två separata JVM-processer kan begära återtag samtidigt: tre omgångar ska
  ge en sparad effekt per händelse och inga kvarvarande oavslutade publiceringar.
  Lyssnaren kan köras flera gånger; externa utskick behöver egen idempotens.
- Modulgränser verifieras och ett riktigt `@ApplicationModuleTest` körs.

`cloud-lifecycle.py` kör motsvarande molnobservation med 10 och 60 sekunders
fördröjning samt valfritt kraschprov. Installera `psycopg[binary]==3.3.6` i den separata
testklienten och ge den testprojektets runtimecredentials via miljön. Sätt
`PROBE_BASE_URL`, `PROBE_PROJECT_REF`, `PROBE_PGHOST`, `PROBE_PGUSER`,
`PROBE_DB_PASSWORD`, `PROBE_TOKEN` och `PROBE_SSL_ROOT_CERT` (Supabases CA-fil).
För skyddad preview används en uttryckligen godkänd temporär `PROBE_ACCESS_URL`
som sätter åtkomstcookie, eller vid behov befintlig `PROBE_BYPASS`.
Sätt `PROBE_TEST_CRASH=true` endast när kraschläget är avsiktligt aktiverat.

`cloud-recovery.py` är det separata M22-provet för 60 s återtag under aktiv
request efter 90 s utan apptrafik. Det använder samma klientberoenden och
miljövariabler som ovan samt `PROBE_ACCESS_URL`. DB-kontot ska endast ha SELECT
på probe_run, probe_attempt, probe_effect och event_publication; skriptet
kontrollerar att det inte kan skriva effekter eller skapa tabeller.
`PROBE_EXISTING_RUN_ID` kan ange en redan oavslutad syntetisk körning att
återta först. Klienten verifierar omleverans och unik effekt direkt i DB.
Detta aktiverar ingen scheduler och bevisar inte automatisk väckning.
Skriptet accepterar bara `forena-kotlin-*.vercel.app` och testprojektets ref.

**Vercel Sandbox är endast bygg-/testklient.** Dess JVM-resultat är inte bevis
för Function-containerns livscykel. Ett grönt post-response-prov visar observerat
beteende, inte ett leverantörslöfte. Vi har inte hittat ett dokumenterat Java-
motsvarande `waitUntil`. Bakgrundsarbete behöver därför beständig återtagning
även om några fristående trådar observeras fungera.

De faktiska molnresultaten (inklusive det misslyckade 60-sekundersprovet) finns
i [M21:s rapport](../docs/migration/vercel-probe-results.md).

## Deployment och avslut

`backend/vercel.json` definierar en container-Service och samma-origin-routing.
Deploya endast backendkatalogen till projektet `forena-kotlin`, som preview.
Vercel Services är beta. Ordinarie projekt `forena` och repots root-vercel.json
ska inte ändras. Konfigurationsändringar gäller bara testprojektet.

Efter provet stoppas den tillfälliga testklienten. Inga återkommande cronjobb
skapas automatiskt. Dokumentera deployment-ID, källrevision/hash, region,
versionskontroll, mättider, observerade begränsningar och kostnadsunderlag.
Återkalla provcredentials och avaktivera kraschläge när provmiljön avvecklas.
Ta inte bort projekten utan separat instruktion.

## Schemalagd worker (M22A)

Uppföljning: [M22B-rapporten](../docs/migration/m22-isolation-results.md)
förklarar Data API:s 503 med avsiktlig avstängning och verifierar pg_net-gränsen.
JDBC kräver inte Data API; behåll det avstängt i Kotlin-testprojektet.

`POST /api/probes/worker` kräver separat `PROBE_WORKER_TOKEN` (minst 32 tecken,
skild från `PROBE_TOKEN`). Tomt värde stänger workeråtkomsten. Workertokenen
får inte skapa prov eller köra manuellt återtag. Den vanliga provtokenen får
inte köra workerendpointen.

Spring-properties styr batch och mjuk tidsbudget: `probe.worker.batch-size=2`,
`probe.worker.budget=PT120S`, `probe.worker.stale-after=PT120S` och
`probe.worker.reserve=PT5S`. Testerna använder kortare tider. Arbetaren väljer
högst batchstorleken, ignorerar färska försök/CRASH och väntar på Moduliths
kvittens. För BLOCK är frisläppningen avsiktlig felinjektion i teknikprovet.

Kör endast i forena-kotlin:

1. Bygg/verifiera backend och deploya en skyddad preview med separat worker-
   och provtoken. Förbered `scripts/probe/scheduler-setup.sql` i testprojektet.
2. Ordna tidsbegränsad åtkomst enbart till denna preview. `scheduler-seed.py`
   använder `PROBE_BASE_URL`, `PROBE_ACCESS_URL`, `PROBE_TOKEN` och
   `PROBE_WORKER_TOKEN`, kontrollerar token-gränserna och skapar syntetiska
   BLOCK-händelser med 1/60 s fördröjning. Inga fler appanrop ska därefter göras
   av testklienten. Stoppa klienten när fixtures/preview-cookie överlämnats.
3. Valfri `PROBE_PUBLISHABLE_KEY` kontrollerar att Data API avvisar schema net.
   Ett 503/PGRST002 är ett blockerande verifieringsresultat för den kontrollen,
   inte ett godkänt isoleringsbevis. Det uppstod i detta teknikprov och redovisas
   separat; seed kördes därefter utan den valfria kontrollen.
4. `--headers-out /vercel/private-headers.json` kan skriva previewns Cookie-
   header till en privat scratchfil med 0600. Läs/överför den via säker kanal
   till Vault och radera scratchfilen; skriv aldrig dess innehåll till loggar.
   En share-URL direkt på pg_net:s POST fungerade inte i denna körning.
5. Provisionera tre temporära Vault-poster: `forena_kotlin_m22_worker_url`
   (previewns rena /api/probes/worker-URL), `forena_kotlin_m22_worker_token`
   och `forena_kotlin_m22_worker_headers` (JSON med preview-Cookie). Behåll
   Deployment Protection. Inga användar-/produktionscredentials behövs.
6. Kör `scheduler-activate.sql`. Den väntar minst 150 s, tillåter högst fem
   HTTP-anrop och högst tolv minuter; första timeouten på 1 s är ett avsiktligt
   provfel. Normal pg_net-timeout är 180 s, större än workerbudgeten inklusive
   rimlig uppstartsmarginal. Kontrollera svar/effects via SQL, inte API-pollning.
7. Exportera endast request-ID, tider, status och syntetiska effekter. Läs
   aldrig pg_net:s headers eller godtyckliga felkroppar för loggning; även en
   felrespons kan innehålla en åtkomstlänk. Cron succeeded bevisar inte HTTP-
   eller verksamhetsframgång.
8. Kör `scheduler-cleanup.sql` och verifiera inga provjobb, Vault-poster,
   köade requests eller provresponser. Återkalla previewlänken och stoppa
   eventuell testklient. Städa även separata transport-preflight-ID:n.

**Plattformsgräns:** alla direkta SQL-loginroller kan läsa pg_net:s köheaders
och använda dess kö. Grantägaren är supabase_admin; postgres kan inte ändra
dessa PUBLIC-grants. Vault ändrar inte den tillitsgränsen. En påstått read-only
observatör har alltså inte en sådan garanti för net-schemat när pg_net är
installerat. Provet använder bara kontrollerade SQL-konton och kortlivad
previewåtkomst. Net ska aldrig exponeras via Data API.

Moduliths predicate-API läser normalt alla ofullständiga poster före filtrering.
M22D begränsar nu workerendpointens materialisering via en repository-SPI-
dekorator; se [registryrapporten](../docs/migration/m22-registry-results.md).
Manuellt återtag och shutdown-diagnostik är fortsatt obegränsade.
`probe.worker.read-timeout-seconds=2` styr bara workerns egna SQL-läsningar;
den totala budgeten är fortfarande mjuk. Se den fullständiga
[rapporten](../docs/migration/m22-scheduler-results.md) för tidslinje,
bevis och kvarvarande produktionsgränser.

## Data API och SQL-gränser (M22B)

Resultat och begränsningar finns i [M22B](../docs/migration/m22-isolation-results.md).
Lokalt, utan molncredentials:

```sh
python3 scripts/probe/isolation-check.py --verify-evidence docs/migration/evidence/m22-isolation.json
python3 -m unittest discover -s scripts/probe -p 'test_isolation_check.py'
```

För ett nytt verkligt prov, använd bara Supabase-projektet forena-kotlin
(`ckzrtxqjskosqzoitymc`) och verifiera projekt-ID före varje mutation:

1. Kör `scripts/probe/isolation-audit.sql` och spara ursprungliga roll-/databas-
   inställningar för authenticator. Setup förutsätter inget db_schemas-override,
   ingen befintlig fixtur och bara syntetiska data. Behåll återställningen redo.
2. Kör `isolation-setup.sql` atomärt som provider-/testbootstrap. Det exponerar
   tillfälligt enbart kontrollschemat; ändra aldrig Data API i ordinarie Förena.
3. Från en godkänd testklient med nätåtkomst, sätt `PROBE_PUBLISHABLE_KEY` till
   testprojektets publishable key via säker credentialkanal och kör
   `python3 scripts/probe/isolation-check.py`. Skriv inte nyckeln i kommandoraden.
   Alternativt kör samma fallista med provider-pg_net och bevara endast status,
   tillåtna felkoder och exakt syntetisk kontrollrad, som i M22B-beviset.
   Registrera pg_net-request-ID:n och läs aldrig råa headers/felkroppar till logg.
4. Kör `isolation-sql-roles.sql` för markörprovet, och audit för effektiva grants.
   Markörprovet använder anon/authenticated; runtime/observer kräver endast
   katalogkontroll. Utöka inte rollmedlemskap för att få SET ROLE att fungera.
5. Även vid fel: kör reset/notify-delen i `isolation-cleanup.sql` och COMMIT.
   Bekräfta att kontrollraden inte längre är tillgänglig via HTTP medan schemat
   finns kvar, därefter DROP-delen i separat operation. Ta bort bara noterade
   prov-ID:n från net-kön och responserna. Kör audit igen och jämför med basen.

M22B återställde avsiktligt avstängt Data API; en ny sådan kontroll ger därför
503/PGRST002 och ska inte godkännas som frisk schemaisolering. Lämna
`PROBE_PUBLISHABLE_KEY` osatt i scheduler-seed.py när Data API ska vara avstängt.
Återaktivera inte API:t enbart för kommande JDBC-/Cron-prov.

## Faktisk JVM-krasch och effekt/kvittens (M22C)

Se [rapporten](../docs/migration/m22-crash-results.md). Lokalt efter Maven verify:

```sh
python3 scripts/probe/local-lifecycle.py --concurrent-recovery --scheduled-crash
```

Detta startar engångs-PostgreSQL och riktiga JVM:er, kontrollerar exit 137 före
effekt respektive efter committad effekt men före registerkvittens och provar
sedan samtidiga workeranrop i två JVM:er. Lokala HTTP-anrop startar processerna;
det verkliga molnprovet använder riktig Supabase Cron för väckningen.

Felinjektion kräver både PROBE_ALLOW_CRASH=true och en SQL-skapad probe_fault
för ett frisläppt BLOCK-ID. Felpunkterna är BEFORE_EFFECT och AFTER_EFFECT_COMMIT.
Armera aldrig en verksamhetshändelse. Runtime kan läsa/förbruka markörer men
får inte skapa/radera dem eller ändra ID/felpunkt. Dess SQL-rättighet på
konsumtionskolumnerna är ingen säkerhetsgräns mot komprometterad JDBC; betrodda
SQL-konton och verifierad städning krävs precis som för pg_net i M22B.

För ett nytt molnprov:

1. Kör separat Liquibasejobb i testprojektet före runtime-deploy. Använd ett
   tidsbegränsat migrationskonto och verify-full TLS, inga migrationcredentials
   i funktionens runtime. Kontrollera migrationshistorik, bevarade data och
   slutlig objektägare forena_probe_migrator. Stäng sedan LOGIN/medlemskap.
2. Deploya provkällorna till en skyddad forena-kotlin-preview med kraschflaggan
   påslagen endast för provet. Använd separata prov-/workertokens.
3. Kör scheduler-seed.py utan PROBE_PUBLISHABLE_KEY; Data API ska förbli avstängt.
   Notera två BLOCK-ID:n och sista fullständiga svarstid. För över kortlivad
   previewcookie och endast workertoken till provets tre Vault-poster.
4. Kör scheduler-crash-activate.sql med before_id, after_id och last_response_at
   som psql-variabler (eller motsvarande säker parametrisering via MCP). Stoppa
   klienten före tidsgrinden. Högst tio HTTP-anrop under högst 15 minuter.
5. Följ SQL och Vercels loggar, inte appanrop. Bevisa vid båda felpunkterna
   faktisk JVM-död, kvittens saknas, 0 respektive 1 committad effekt, senare
   återtag i annan JVM samt en slutlig effekt och kvittens efter upprepning.
   Spara inte råa pg_net-felkroppar eller headers.
6. Exportera sanerade bevis före städning. Kör scheduler-cleanup.sql och ta
   bort endast provets två probe_fault-rader. Återkalla previewlänken, verifiera
   stoppade klienter och sätt previewförvalets kraschflagga till false inför
   kommande deployment. Befintliga deploymenters miljö är oföränderlig; de
   skyddas genom återkallad provåtkomst och borttagna armeringar.

## Registry-backlog (M22D)

`./mvnw verify` kör WorkerTest med pg_stat_statements i disponibel PostgreSQL:
100/10 000 köposter, SQL-resultatrader/anrop, deserialisering och grov minnes-/
tidsmätning. Ingen extension installeras i Supabase. Processprovet kan köras
med `--concurrent-recovery --scheduled-crash --registry-backlog 10000` för att
behålla färska poster under båda riktiga JVM-krascherna och tre två-JVM-rundor.
CI kör den kombinationen. Se rapporten för mätgränser och kvarvarande arbete.
