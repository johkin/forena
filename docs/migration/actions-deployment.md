# Actions-deploy av nya Kotlin-sajten

Git-kopplingen för `forena-kotlin` är bortkopplad av användaren. Den nya
workflowen `Deploy Kotlin site` i `.github/workflows/deploy-kotlin.yml` tar över
frontend och verksamhets-API. Gamla `Deploy production` har ett annat projekt-ID
och fortsätter separat. Ingen data importeras eller synkroniseras mellan sajterna.

## Releaseflöde

Efter framgångsrik **CI för en push till main** checkar Actions ut exakt den
verifierade committen. PR-körningar får inte starta en release. Även manuell
`workflow_dispatch` kräver aktuell main och en lyckad CI för samma SHA.
Deployjobb serialiseras utan att avbryta en pågående publicering. Main kontrolleras
igen före publicering, så en äldre köad release inte skriver över en nyare version.

`deploy/vercel.kotlin.json` kopieras till checkoutens `vercel.json` endast i
releasejobbet. Konfigurationen använder Vercel Services (**beta**) med två
containerbaserade tjänster i Frankfurt: Next standalone och `backend/api`.
Verksamhets-API:t ersätter teknikprovet i denna deployment. Båda tjänsterna byggs
och publiceras tillsammans med samma deployment och kan återställas tillsammans.
Gamla sajtens runtimekonfiguration behålls; de två befintliga Vercel-filerna får
bara ett deployundantag för arbetsbranchen `ci/kotlin-vercel-deploy`.

Actions bygger Next standalone med `FORENA_CONTAINER_BUILD=true` och paketerar
API-JAR med den befintliga checksumlåsta Oracle JDK:n. Tester körs i föregående
CI för samma SHA; releasepaketeringen använder `-DskipTests`. Vercel CLI är låst
till 60.1.3 och de två Actions-referenserna är låsta till commit-SHA.
`vercel build --prod` bygger/pushar containerbilderna till Vercels registry;
`vercel deploy --prebuilt --prod --skip-domain` skapar en stagingdeployment med
produktionskonfiguration utan att flytta den kanoniska adressen. Vercel kan ändå
tilldela sitt genererade team-alias redan i stagingsteget; det är observerat i
första körningen. Använd den exakta deployment-URL:en för provet och den kanoniska
adressen för publicerad kod.

`vercel curl` använder deployidentiteten för skyddade anrop. Kontrollen kräver:

- `/api/migration/health`: Next når den bundna API-tjänsten, vars Actuator-health
  kontrollerar JDBC. Svaret måste också ha exakt frontendbyggets versions-ID.
- `/login?mode=password`: inloggningssidan ger framgångsrikt HTTP-svar.

Först därefter kör Actions `vercel promote` för samma deployment. Fel lämnar
tidigare domäntilldelning kvar. En stagingdeployment/image kan finnas kvar efter
ett misslyckat prov; rensa den genom normal retention. Hälsokontrollen är läsande,
returnerar inga interna fel och ersätter inte browserprov med verkliga svar.

## Engångskonfiguration

I GitHub: skapa miljön **`kotlin-production`** under Settings → Environments.
Tillåt deployment endast från `main` och konfigurera required reviewers för
releasegodkännande. Lägg **`VERCEL_TOKEN`** som miljösecret där, med åtkomst till
teamet `johkin` och projektet `forena-kotlin`. Konfigurera token direkt i GitHub;
den ska inte klistras in i chatten eller committas. Inga databas-/Auth-adminsecrets
behövs i GitHub för denna deploy.

I Vercel-projektet **`forena-kotlin`**, team
`team_hkR9c8WmDdaB7Ohge0pDlA6X`, projekt
`prj_V1a7hd39ABj3w5ARUOATF31XMWX9`:

- Root Directory: **reporoten**, inte `backend`. Behåll befintligt Deployment Protection.
- Behåll Git-kopplingen frånkopplad. Actions väljer projekt med explicit ID.
- Ange följande variabler för **Production**:

| Variabel | Värde/källa |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ckzrtxqjskosqzoitymc.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Nya projektets publishable key, Config; finns redan via integrationen |
| `SITE_URL` | `https://forena-kotlin.vercel.app`, Config |
| `FORENA_DB_USERNAME` | `forena_api_runtime.ckzrtxqjskosqzoitymc`, Config |
| `FORENA_DB_PASSWORD` | Det begränsade runtime-kontots lösenord, Secret; inte postgres/ägarkontot |
| `FORENA_JDBC_URL` | `jdbc:postgresql://aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=/app/supabase-ca.crt`, Config |
| `FORENA_KOTLIN_TEST_ACTIVITY_ID` | Valfritt nytt syntetiskt aktivitets-ID när testsidan ska användas |

Root Directory, SITE_URL, runtime-användarnamn och JDBC-URL har förberetts i
Vercel utan deployment. Runtime-lösenordet och GitHub-miljön återstår att
konfigurera direkt i respektive tjänst. Inga hemliga värden har hämtats tillbaka.

Sätt inte `FORENA_KOTLIN_SERVICE_URL` manuellt: Services-bindingen injicerar den.
En servicebinding behandlas som en intern bas-URL: HTTP och en eventuell
routingprefix/sökparameter bevaras när API-sökvägen läggs till. Det separata
`FORENA_KOTLIN_API_URL` behåller sina striktare originregler för direktkopplade
lokala browserprov; en trasig servicebinding ger aldrig fallback till den.
Auth issuer/JWKS och backendval är låsta till nya projektet i startskripten.
Det privata API:t saknar publik rewrite; browserns API-anrop går genom Nexts
befintliga adapter med verifierad användartoken. Ingen automatisk legacy-fallback.

Vercel injicerar projektvariabler i tjänsternas startmiljö. Startskripten använder
`env -i` med uttryckliga tillåtna variabler: Next-processen får inga databas- eller
admincredentials; JVM får bara det begränsade runtime-kontot och Auth-konfigurationen.
Projektvariabler som `SPRING_APPLICATION_JSON`, `JAVA_TOOL_OPTIONS`, migreringsläge,
probetoken och integrationssecrets skickas inte vidare till applikationsprocesserna.
Projektets äldre secrets kan fortsatt finnas i containerns ursprungliga startmiljö;
detta är inte en separat hemlighetsgräns mot komprometterad containerkod.
Bygget tillåter endast publik Auth-konfiguration och Vercels egna metadata/OIDC
i den lokala bygg-envfilen. Envfiler laddas aldrig upp som Actions-artifakter.

Hälsokontrollen loggar bara fasta felsteg (`configuration`, `upstream`,
`response`) och eventuell HTTP-status. Bindingens URL, sökparametrar, tokens,
felkropp och exceptiontext loggas inte. Ogiltig runtime-användare eller JDBC-
konfiguration ger också ett fast startfel utan de konfigurerade värdena.

## Databas, testdata och återgång

Nya projektets fem befintliga Liquibase-steg måste redan vara installerade.
Denna pipeline kör **inte** bootstrap, Supabase-migrationer, Liquibase eller seed.
JVM tvingas till `FORENA_MIGRATE=false` och får inga ägarcredentials. Framtida
schemaändringar behöver ett separat migreringssteg före promotion med eget konto
och verifierad kompatibilitet. Gamla projektets migrationer körs bara av dess
befintliga, separata workflow.

Utan `FORENA_KOTLIN_TEST_ACTIVITY_ID` är `/migration/participation` avsiktligt 404;
deploymenten kan ändå verifieras via health och login. Skapa avgränsade syntetiska
data enligt [browserinstruktionen](browser-participation.md) innan manuell
funktionstestning. Lämna aldrig persondata eller syntetiska lösenord i Actions-loggar.
Vanliga översikten, full signalworker och övriga Auth-metoder är fortfarande
återstående M07-arbete; publicerad kod är inte acceptans av hela piloten.

Återgång: välj en tidigare **gemensam frontend/API-deployment** från detta nya
Services-flöde och kör `vercel promote <url> --scope team_hkR9c8WmDdaB7Ohge0pDlA6X`.
En äldre teknikprovsdeployment är inte samma app. Återgång återställer inte
databasen och kopierar inga data till gamla sajten.

## Leveransens verifiering

Lokala kontroller och PR/CI redovisas i [status](status.md). Full molndeploy och
promotion kan verifieras först när engångskonfigurationen ovan finns och workflowen
är mergad på main. GitHub-miljöns skydd/secrets är inte verifierade av repots kod.
