# Actions-deploy av nya Kotlin-sajten

Git-kopplingen för `forena-kotlin` är bortkopplad. Workflowen `Deploy Kotlin
site` i `.github/workflows/deploy-kotlin.yml` publicerar den separata statiska
browser-frontendens första flöde och Java 25-API:t. Gamla `Deploy production`
har ett annat projekt-ID och fortsätter separat. Ingen data synkroniseras mellan
sajterna. [Frontendens omfattning och körning](../../frontend/README.md).

## Releaseflöde

Efter godkänd CI för en push till main checkar Actions ut exakt aktuell main-SHA.
Även manuell körning kräver godkänd main-CI för samma commit. PR-körningar får
inte publicera. Releasejobb serialiseras och main kontrolleras igen före promotion.

`deploy/vercel.kotlin.json` kopieras till checkoutens `vercel.json` endast i
releasejobbet. Vercel Services (beta) publicerar båda delarna atomärt i Frankfurt:

- `frontend/`: React/Vite som statiska filer. Ingen frontend-container eller Node-server.
- `backend/api`: Java 25/Spring Boot i container med begränsad runtime-roll.

Vercel routar `/api/*` och `/actuator/health` direkt till backend, övrigt till
frontend. SPA-djuplänkar faller tillbaka till `index.html` inom frontendtjänsten;
API-anrop får aldrig HTML-fallback. Det finns ingen privat servicebinding och
browsern skickar Bearer-token direkt till API:t på samma origin. Backendens
JWT-, sessions- och familjekontroller ligger kvar.

Browserns API- och config-anrop använder `credentials: same-origin` så att
Vercels skyddscookie når Deployment Protection. Plattformens HTML-/401-svar
får inte logga ut användaren ur Supabase. Bara API:ts uttryckliga JSON-svar
om ogiltig appsession gör det. Behåll Deployment Protection aktiverat.

CI bygger och starttestar den färdiga backend-imagen, inklusive startskript,
systembibliotek och CA-certifikat. Native-kompilering och paketering hör till
byggjobbet. Det äldre `kotlin-probe`-jobbet är borttaget från CI; verksamhets-API:ts
backend-tester och imageprov ligger kvar.

Releasen hämtar `forena-backend-image-<sha>` från godkänd main-CI för exakt
releasecommit och kontrollerar artefaktens sourceCommit och image-ID mot den
laddade imagen. Saknad/utgången artefakt stoppar releasen; kör CI igen för samma
aktuella main. Ingen binär extraheras och ingen backend-image byggs i deployjobbet.

Imagen taggas och pushas till samma projekts Vercel Container Registry. Image-ID:t
måste fortfarande matcha CI-artefakten efter push. Backend-tjänstens `entrypoint`
sätts till dess oföränderliga `vcr.vercel.com/johkin/forena-kotlin/backend@sha256:…`.
Dess service-root `deploy/backend-image` innehåller ingen Dockerfile. Vercel CLI
60.1.3 väljer då prebuilt-imagevägen och använder imagen direkt. Deployflödet
behöver inte veta om processen kör native, JVM eller något annat.

Frontend byggs separat. `vercel build --prod` paketerar statiska filer och den
befintliga OCI-referensen; `vercel deploy --prebuilt --prod --skip-domain` skapar
en stagingdeployment. JDBC och riktig Auth/HTTPS-health kontrolleras innan samma
deployment främjas till den kanoniska domänen.

Kontroller före `vercel promote`:

1. `/actuator/health` måste ge `status: UP`, inklusive JDBC och HTTPS-hämtning
   av Supabase Auths publika signeringsnycklar.
2. `/app-version.json` måste matcha den faktiskt paketerade frontendens version.
3. `/login` måste kunna hämtas.

Misslyckad kontroll stoppar promotion. Vercel kan ändå flytta sitt genererade
team-alias under staging; det observerades i tidigare körningar. Använd exakt
deployment-URL för prov och den kanoniska adressen för publicerad kod.
Hälsokontroll och statisk HTML-hämtning ersätter inte ett verkligt inloggat
browserprov. Inga migreringar, utskick, bootstrap eller seed körs av releasen.

## Projekt och konfiguration

GitHub-miljö: `kotlin-production`, begränsad till main med avsedd review-policy.
`VERCEL_TOKEN` ska finnas som secret med åtkomst till rätt team/projekt.
Konfigurera credentials direkt i respektive tjänst, inte i chatten eller repot.
Org- och projekt-ID väljs explicit i workflowen:

- Team `team_hkR9c8WmDdaB7Ohge0pDlA6X` (`johkin`).
- Nya projektet `prj_V1a7hd39ABj3w5ARUOATF31XMWX9` (`forena-kotlin`).
- Kanonisk adress `https://forena-kotlin.vercel.app`.
- Root Directory: reporoten. Behåll avsett Deployment Protection.

Production-konfiguration i det nya Vercel-projektet:

| Variabel | Värde/källa |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ckzrtxqjskosqzoitymc.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Nya projektets publishable key |
| `SITE_URL` | `https://forena-kotlin.vercel.app` |
| `FORENA_DB_USERNAME` | `forena_api_runtime.ckzrtxqjskosqzoitymc` |
| `FORENA_DB_PASSWORD` | Begränsade runtime-kontots secret, inte ägar-/postgreslösenord |
| `FORENA_JDBC_URL` | `jdbc:postgresql://aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=/app/supabase-ca.crt` |
| `FORENA_KOTLIN_TEST_ACTIVITY_ID` | Valfri startaktivitet i nya projektet; alternativt aktivitetens djuplänk |

Sätt inga `FORENA_KOTLIN_*_URL`-variabler för nya frontend-appen. Klienten
använder alltid `/api/*` på samma origin. Endast de publika värdena och Vercels
metadata/OIDC får finnas i den förberedda bygg-envfilen. Frontendens generator
skriver en uttrycklig tillåtelselista till `config.json`: Auth-URL, publishable
key, valfri aktivitet och version. Databas-/Auth-admincredentials får aldrig
publiceras i frontendfiler eller Actions-artifakter. `config.json` och
versionsfilen har `no-store`. Runtime-API:t får bara sitt begränsade DB-konto;
startskriptets miljöfilter nekar migreringsläge och generella Spring-/JVM-överstyrningar.
Auth-HTTPS-klienten läser Java- och systemrötter samt plattformens CA-fil via
`SSL_CERT_FILE` och `NODE_EXTRA_CA_CERTS`. Sökvägarna förs vidare som
`FORENA_AUTH_CA_BUNDLE` respektive `FORENA_AUTH_EXTRA_CA_BUNDLE`.
Certifikat- och värdnamnskontroll behålls;
ett uttryckligt felaktigt CA-paket stoppar start.

## Verifiering och återgång

Nya projektets fem befintliga Liquibase-steg är förutsättning. Separata
migreringskonton och driftoperationer tillhör inte frontend-releasejobbet.
Efter merge behöver statisk frontend, direkt API-routing, riktiga Auth-sessioner
och JDBC verifieras i en ny deployment; lokal verifiering är inte molnbevis.

Återgång: främja en tidigare gemensam frontend/backend-deployment från samma
projekt. Databasen återställs inte och gamla sajtens data kopieras inte.

De äldre Next → Kotlin-deploymenterna före ADR-017 stannade i health med
`SELF_SIGNED_CERT_IN_CHAIN`. PR #120 gav transportdiagnostik och PR #121 tillförde
CA-förtroende, men sist observerade molnfelet kvarstod. Den nya browserappen
använder inte den anslutningen. Historik finns i [status](status.md); de gamla
Next-/TLS-proven finns kvar som isolerat underlag.
