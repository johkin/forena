# Spelarutvärdering och gruppförslag

Implementation av [den godkända specen](../specs/spelarutvardering-och-lagindelning.md)
i React/Kotlin, 2026-11-03. Ingen driftsättning eller databasändring mot
produktion ingår.

## Kod och användning

- Lagmeny → Spelarutvärdering, `/teams/{teamId}/evaluation`. Lagadmin aktiverar
  funktionen och skapar lagets mätpunkter, anger typ, gruppförval och tröskel.
  Ledare och admin registrerar gemensamma heltalsbetyg 0–10.
- Lagrapporten visar aktuell trupp, mätvärden, separata medelvärden och
  nivågrupper. Träningsdetaljerna får bidraget Gruppförslag med ja-svar som
  förval, manuellt deltagarurval och val av indelningssätt/gruppantal.
- `capabilities.playerevaluation` äger bedömning, konfiguration och
  indelningsalgoritm. `activities.EvaluationAccess` lämnar kontrollerade fakta.
  Laglåset och nya UUID-revisioner skyddar skrivning och bekräftad radering.
- `extensionapi.ReadViewContributor` / `ReadContribution` beskriver gemensamma
  typade läsvyer. `extensions.ReadViewController` samlar Spring-registrerade
  bidrag. `ExtensionReadViews` validerar kontraktet och väljer renderare efter
  vytyp; aktivitetskärnan känner inte till spelarutvärdering eller fotboll.
- REST: `GET/PUT /api/teams/{teamId}/player-evaluation`,
  `PUT /api/teams/{teamId}/player-evaluation/scores` och
  `GET /api/teams/{teamId}/read-views`. Aktivitet kan anges med `activityId`.
  Läsvyns kontraktsägda filter är `groupCount`, `mode` och `personIds`.
  Tomt `personIds=` betyder uttryckligen tomt urval, frånvaro betyder förval.
- Liquibase 027 skapar endast capabilityns tre privata tabeller i `forena`.
  Avstängning raderar bara dessa data. Next/Supabase-modellens migrationer
  ändras inte. Det separata Liquibase-schemat verifieras med projektets
  lokala PostgreSQL-testcontainers, inte en återställning av äldre Supabase-schemat.

Förmågegrupper sorterar efter orundat medelvärde med stabilt person-ID vid
likheter. Jämnstarka lag börjar med en deterministisk fördelning inom fasta
storlekar och förbättras med parbyten som minskar skillnader i gruppmedelvärden.
Högst 100 förbättringspass körs. Globalt optimum är inte ett krav och garanteras
inte. Utvecklingsvärden påverkar aldrig sorteringen. Saknat underlag visas
separat och görs aldrig om till noll.

## Verifiering

- `GroupingTest`: separata kompletta medelvärden, saknade betyg/giltig nolla,
  balansmått, nivåordning, 2/3/4 grupper, 20 spelare → 7/7/6, stabila
  likheter och oberoende av indikatorer.
- `ApiTest` med namnprefix `player evaluation`: aktuella roller, nekad åtkomst,
  inlånade, aktuella värden, revisionskonflikt, typ-/namnbyte, bekräftad
  borttagning/avstängning, återaktivering, gruppantal, tröskel och urvalsgränser.
- `MigrationTest`: hela migrationskedjan och runtime-/klienträttigheter mot
  nya lokala PostgreSQL-containrar. `ArchitectureTest`: Modulith och ArchUnit.
- `extension-read-views.test.tsx` och `evaluation-api.test.ts`: oberoende
  capabilities använder samma renderare, felaktig typ/version/data avvisas och
  browsertransporten begränsar endpoints, metoder och filter.
- `scripts/migration/player-evaluation-browser.mjs`: delade produktionsvyer i
  både Next och Vite vid 320, 390 och 1280 px. Betyg, konfliktutkast, roller,
  aktivering, avbruten/bekräftad avstängning, alla vytyper, okänd version,
  laddning och fel. Skärmbilder i `frontend/.evidence/evaluation/` är lokala
  verifieringsartefakter med syntetiska exempel.
- `scripts/migration/player-evaluation-e2e.mjs`: helt flöde mot riktig
  Kotlin-backend och PostgreSQL på 390/1280 px. Startas av `ApiTest` när
  `FORENA_EVALUATION_BROWSER_TEST=true`; kräver Vite på 127.0.0.1:3001.
  Browsern använder testkonton; HTTP-routing ändrar bara transporten till
  lokala processer, inte API-svar eller domändata.

Ordinarie kontroller: `npm test`, `npm run typecheck`, `npm run lint`,
`npm run build`, `npm run frontend:build`, `backend/mvnw -f backend/pom.xml verify`.
OpenAPI exporteras av `ApiTest` och genereras med `npm run generate --prefix backend/contract`.

Resultat 2026-11-03: 1 248 apptester passerade. Backendens breda körning
omfattade 252 tester med fem miljöstyrda överhoppningar. Alla ordinarie tester
passerade, inklusive de 26 migrationstesterna. Det nya E2E-provet fallerade
först på testets inloggningsväntan och senare på dess valfältsselektor;
det rättade provet passerade därefter isolerat mot riktig backend/databas på
både 390 och 1280 px. Den breda körningens ursprungliga resultat är alltså
inte en obruten grön körning; det senare riktade omprovet verifierar rättningen.
De separata komponentproven passerade i båda apparna vid 320/390/1280 px.
Slutlig lint, typkontroll, Next- och Vite-produktionsbyggen passerade.
Backendens JAR paketerades efter testerna med `-DskipTests package`;
det är en byggkontroll och räknas inte som en ny testkörning.
