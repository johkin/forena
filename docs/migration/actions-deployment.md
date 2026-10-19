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

Actions installerar Temurin 25, bygger frontend och API-JAR samt kopierar samma
JDK till backendens runtime-image. Verksamhetstester körs i CI för samma SHA;
releasepaketeringen hoppar endast över deras återkörning. Vercel CLI är låst till
60.1.3. `vercel build --prod` paketerar statiska filer och backend-image;
`vercel deploy --prebuilt --prod --skip-domain` skapar en stagingdeployment.

Kontroller före `vercel promote`:

1. `/actuator/health` måste ge `status: UP`, inklusive JDBC-kontrollen.
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
