# Actions-deploy av Kotlin-sajten

Spring-autentisering enligt ADR-026 är den nya appens enda auth-lösning.
Supabase kan fortsatt vara PostgreSQL-leverantör. Den äldre Next-appen har
separat auth och deployment. Ingen produktionsaktivering ingår i denna PR.


## Workflow och artefakter

`.github/workflows/ci.yml` väljer berörda applikations-, databas- och backendjobb.
`verify` kräver alla valda jobb. Varje main-release kräver native-jobbet, som
återanvänder en verifierad backend eller hämtar migrations-JAR från ett nytt
backendbygge och kör `local-smoke.py --runtime-image` mot containern.
Även en cacheträff måste klara detta prov för aktuell commit. Buildpack-bygget
anger uttryckligen `linux/amd64`, samma arkitektur som runner, cache och release,
och låser buildern till digesten från den senast godkända native-körningen.
Det undviker att en ändrad `latest`-tagg byter till en ARM64-builder. Uppdatering
av builderdigesten görs uttryckligen och verifieras med hela native-provet.

`.github/workflows/deploy-kotlin.yml` gäller bara main med lyckad CI för exakt
aktuell main-commit. GitHub-miljön `kotlin-production` behåller sin review-policy.
Workflowen hämtar den verifierade imagen, kontrollerar innehåll och digest,
bygger statisk frontend och skapar Build Output API-output med befintlig entrypoint.
Staging använder exakt deployment-URL, health och byggversion före promotion.
Verkligt inloggat browserprov krävs dessutom före produktionsaktivering av auth.

- Projekt: `prj_V1a7hd39ABj3w5ARUOATF31XMWX9` (`forena-kotlin`).
- Team: `team_hkR9c8WmDdaB7Ohge0pDlA6X` (`johkin`).
- Origin: `https://forena-kotlin.vercel.app`.
- Root Directory: reporoten. Behåll avsedd Deployment Protection.

`VERCEL_TOKEN` ligger i GitHub-miljön. Databas-/migrationscredentials,
sessionsnyckel och Resend-konfiguration ligger bara i backendens runtime-secrets.
`prepare-kotlin.mjs` kontrollerar närvaro och rätt miljö utan att exportera
hemligheterna. Publik config är en uttrycklig tillåtelselista.

## Återanvändning av byggen

`build_inputs.py` beräknar SHA-256 över spårade källfiler, sökvägar och filmoder.
Backendnyckeln omfattar backend, CI-recept och imageverifiering. Frontendnyckeln
omfattar frontend, delade komponenter, publika resurser, låsta npm-beroenden,
Node-version och valfri provaktivitet. Dokumentation och runtime-secrets ingår inte.
En ny UTC-vecka förnyar rörliga buildpack-/basimage-inputs vid nästa CI-körning.

Metadata innehåller `sourceCommit`, `verifiedCommit`, `buildInputs`, `imageId`
och `migrationJarSha256`. Cachepaketet innehåller både imagen och migrations-JAR.
Cache kan återanvändas endast för identiska inputs och måste verifieras på nytt
för aktuell commit. Release kräver linux/amd64 och exakt registry-digest.
PR-cacher får inte ersätta main-cacher. Main återställer paketet före jobburvalet
och kontrollerar imageidentitet, byggindata och JAR-checksumma. Paketet skickas
sedan som en artefakt inom samma körning; det kan inte försvinna genom
cachevräkning mellan scopeberäkningen och native-jobbet.

Oförändrad backend med giltig cache behöver varken kompileras eller köra om
JVM-sviten. Aktuell frontend körs ändå mot imagen och en disponibel databas i
native-jobbets HTTP-/browserprov. Ny verifieringsmetadata och publiceringens
imageartefakt skapas för aktuell release-commit. Cachemiss, veckoförnyelse eller
ändrade backendindata kräver backendbygge och JVM-svit. En ändrad eller trasig
cacheartefakt stoppar körningen. Den nya v2-nyckeln kräver ett första fullständigt
bygge för att fylla cachen med både image och migrations-JAR.

## Databas och aktivering

Ordinarie backendstart kör korta Liquibase-migrationer som separat owner före HTTP.
Runtime verifieras efter migration och saknar DDL/owner-medlemskap. Engångs-JAR:en
kan migrera eller verifiera grants utan auth/mejlkonfiguration och utan HTTP.
Historik och checksummor bevaras; större dataflyttar sker i separata återupptagbara jobb.

Att byta auth för befintliga användare kräver en separat identifierad och testad
kontomigrering med verksamhetskopplingar. E-postlikhet räcker inte. Äldre Next-
deployment och dess delade beroenden behålls. Denna PR genomför ingen deploy,
kontomigrering, databasåterställning eller ändring av externa produktionsinställningar.

## Relevanta CI-jobb

`scripts/deploy/ci_scope.py` väljer kontroller från ändrade filsökvägar:

- Frontend och delade webbkomponenter kör applikationskontrollerna,
  inklusive Chromium med syntetiska API-svar.
- Backendkod, backendtester, kontrakt, migrationer och backendens byggverktyg
  kräver JVM- och nativejobben. Delade API-kontrakt kräver också frontendkontroller.
- Browserproven som körs mot Spring och CI:s urvals-/workflowregler kräver också
  backendverifiering. En ändring av testet får inte hoppa över själva provet.
- Supabase-schema och databastester kräver databasjobbet och
  applikationskontrollerna; Edge Function-kod kräver applikationskontrollerna.
- Dokumentation behöver inga byggen. Okända byggindata väljer alla jobb.

`verify` kräver lyckad scopeberäkning och alla valda jobb. Ett jobb får bara
vara överhoppat när scope uttryckligen anger att det inte behövs. Misslyckade,
avbrutna eller oväntat överhoppade jobb underkänns.

PR:er jämförs med sin bas. Push till `main` jämförs med den senaste lyckade
main-körningen, så att ändringar från misslyckade eller avbrutna körningar följer
med till nästa kontroll. Saknad eller icke-ancestral bas och okända byggindata
väljer alla jobb. Manuella körningar behåller full verifiering.

Main kräver alltid aktuell native-integration och publiceringens backendartefakt,
även när JVM-jobbet återanvänds. Oförändrat Supabase-schema kör inget databasjobb.
Frontendbygget återanvänds även i JVM- och native-jobben med samma Node-version
och innehållsnyckel som applikationsjobbet. Äldre Next-deployens produktionsbygge
är ett separat flöde.
