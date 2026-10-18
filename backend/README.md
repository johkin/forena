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
