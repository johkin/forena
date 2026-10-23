# Actions-deploy av Kotlin-sajten

Spring-autentisering enligt ADR-026 är den nya appens enda auth-lösning.
Supabase kan fortsatt vara PostgreSQL-leverantör. Den äldre Next-appen har
separat auth och deployment. Ingen produktionsaktivering ingår i denna PR.


## Workflow och artefakter

`.github/workflows/ci.yml` kör applikation, databas, backend och GraalVM-buildpack.
`verify` kräver samtliga jobb. Backend publicerar migrations-JAR; native-jobbet
hämtar den och kör `local-smoke.py --runtime-image` mot den byggda containern.
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

Metadata innehåller `sourceCommit`, `verifiedCommit`, `buildInputs` och `imageId`.
Cache kan återanvändas endast för identiska inputs och måste verifieras på nytt
för aktuell commit. Release kräver linux/amd64 och exakt registry-digest.
PR-cacher får inte ersätta main-cacher. Alla tester och säkerhetskontroller körs
även vid cacheträff. Gamla Supabase-auth-images matchar inte den nya byggnyckeln.

## Databas och aktivering

Ordinarie backendstart kör korta Liquibase-migrationer som separat owner före HTTP.
Runtime verifieras efter migration och saknar DDL/owner-medlemskap. Engångs-JAR:en
kan migrera eller verifiera grants utan auth/mejlkonfiguration och utan HTTP.
Historik och checksummor bevaras; större dataflyttar sker i separata återupptagbara jobb.

Att byta auth för befintliga användare kräver en separat identifierad och testad
kontomigrering med verksamhetskopplingar. E-postlikhet räcker inte. Äldre Next-
deployment och dess delade beroenden behålls. Denna PR genomför ingen deploy,
kontomigrering, databasåterställning eller ändring av externa produktionsinställningar.

## Relevanta CI-jobb för pull requests

`scripts/deploy/ci_scope.py` väljer PR-kontroller från ändrade filsökvägar:

- Frontend, delade webbkomponenter och browserprov kör applikationskontrollerna,
  inklusive Chromium med syntetiska API-svar.
- Backendkod, backendtester, kontrakt, migrationer och backendens byggverktyg
  kräver JVM- och nativejobben. Delade API-kontrakt kräver också frontendkontroller.
- Supabase-schema och databastester kräver databasjobbet och
  applikationskontrollerna; Edge Function-kod kräver applikationskontrollerna.
- Dokumentation behöver inga byggen. Okända byggindata väljer alla jobb.

`verify` kräver lyckad scopeberäkning och alla valda jobb. Ett jobb får bara
vara överhoppat när scope uttryckligen anger att det inte behövs. Misslyckade,
avbrutna eller oväntat överhoppade jobb underkänns.

Push till `main` och manuella körningar verifierar alltid hela systemet och
producerar publiceringens backendartefakter för samma commit. Befintliga
innehållsbaserade byggcachar återanvänder oförändrad frontend och native-image.
