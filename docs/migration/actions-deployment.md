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
releasejobbet. Vercel publicerar frontend och backend atomärt i Frankfurt:

- `frontend/`: React/Vite som statiska filer. Ingen frontend-container eller Node-server.
- `backend/api`: Java 25/Spring Boot i container med begränsad runtime-roll.

Vercel routar `/api/*` och `/actuator/health` direkt till backend, övrigt till
frontend. SPA-djuplänkar faller tillbaka till `index.html` för frontend;
API-anrop får aldrig HTML-fallback. Det finns ingen privat servicebinding;
browsern skickar den HttpOnly-sessionscookien till API:t på samma origin
(ADR-018). Backendens JWT-, sessions- och familjekontroller ligger kvar.

Browserns API- och config-anrop använder `credentials: same-origin` så att
Vercels skyddscookie når Deployment Protection. Plattformens HTML-/401-svar
avslutar inte appsessionen. Bara API:ts uttryckliga JSON-svar om ogiltig
appsession gör det. Behåll Deployment Protection aktiverat.

CI bygger native-imagen direkt med Spring Boots buildpacks (`-Pnative
spring-boot:build-image`) och starttestar den. Ingen extraktion, Dockerfile,
ändrad entrypoint eller andra imagebyggen följer. Samma OCI-image sparas som
`forena-backend-image-<sha>` och hämtas av releasejobbet för exakt godkänd main-
commit. Image-ID verifieras före och efter taggning/push till projektets VCR.
Saknad/utgången artefakt stoppar releasen; kör då CI igen för aktuell main.

Releasen skriver Vercels Build Output API: frontendens färdiga statiska filer
samt en containerfunktion vars `handler` är imagens oföränderliga VCR-digest.
`vercel build` körs inte. Vercel CLI 60.1.3 stöder denna containerfunktion, men
accepterar inte en registry-referens som `services.backend.entrypoint`.
API- och health-rutter behåller sin request-path och matchas före SPA-fallback.

Runtime får Auth-konfiguration och det publika databas-CA-certifikatet som
funktionskonfiguration. Appen validerar certifikatet och skriver det till en
privat temporär fil för JDBC:s `sslrootcert`; `sslmode=verify-full` behålls.
Ingen fil läggs i imagen efter bygget. DB-lösenordet kommer fortsatt enbart från
Vercels runtime-miljö. Tilldela endast det begränsade runtime-kontot till projektet.
Ägar-/migreringscredentials hör till den separata migrationsmiljön. Migreringsläge
sätts till false i funktionskonfigurationen. Auth läser plattformens CA-sökvägar
direkt från `SSL_CERT_FILE`/`NODE_EXTRA_CA_CERTS` när explicit Auth-bundle saknas.

`vercel deploy --prebuilt --prod --skip-domain` skapar staging med den redan
publicerade native-imagen. JDBC och riktig Auth/HTTPS-health kontrolleras före
promotion av samma deployment till den kanoniska domänen.

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
| `FORENA_WEB_SESSION_KEY` | Runtime-hemlighet: base64-kodade 32 slumpbyte, gemensam för backendinstanser; aldrig bygg-env |
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
inga migreringscredentials ska finnas i runtime-projektet.
Auth-HTTPS-klienten läser Java- och systemrötter samt plattformens CA-fil via
`SSL_CERT_FILE` och `NODE_EXTRA_CA_CERTS`. De kan även anges som `FORENA_AUTH_CA_BUNDLE` respektive
`FORENA_AUTH_EXTRA_CA_BUNDLE`.
Certifikat- och värdnamnskontroll behålls;
ett uttryckligt felaktigt CA-paket stoppar start.

## Verifiering och återgång

Nya projektets sju Liquibase-steg, inklusive `api-006-browser-session` och
`api-007-auth-rate-limit`, är förutsättning. `prepare-kotlin.mjs` kräver sessionsnyckeln och tar sedan bort den
ur bygg-envfilen utan att exportera/logga den. Runtime-descriptorn aktiverar
webbsessioner och sätter kanonisk origin till `https://forena-kotlin.vercel.app`;
nyckeln hämtas från projektets runtime-miljö precis som DB-lösenordet.
Sessionslagringens health blir DOWN om migration 006/007 saknas.
Se [webbsessionernas releaseordning](web-sessions.md). Separata
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
