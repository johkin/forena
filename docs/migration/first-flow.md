# Första verksamhets-API:t: familjens kallelsesvar

Status 2026-10-19: API-delen implementerad lokalt i `backend/api`, på
`feat/participation-api` från aktuell main (`1b60bb8`). Ingen molndeploy eller
omkoppling av Next.js har gjorts. Detta är en del av M02/M03/M05/M07, inte
slutlig acceptans av hela browserflödet.

## Ren databas enligt användarens beslut

[ADR-010](decisions.md) ersätter den tidigare planen att använda gamla
verksamhetsdatabasen övergångsvis. Gamla Förena-projektet innehåller testdata
som inte ska importeras. Det nya API:t får eget tomt privat `forena`-schema,
egen Liquibase-historik, schemaägare och begränsad runtime-roll. Auth och Storage
förblir leverantörsägda. Ingen radering av gamla projektet ingår.

## Implementerat och verifierbart

- `GET /api/activities/{activityId}/my-invitations`: egna personer och aktiva
  målsmanskopplingar, aldrig andra familjer. Före utskick returneras tom lista.
- `PUT /api/invitations/{invitationId}/respond`: ja/nej/pending, kommentar,
  ändring och återställning. Utelämnad kommentar bevaras; null/tom rensar;
  `pending` rensar kommentar och svarstid. Ogiltiga typer och okända bodyfält nekas.
- JWT-signatur och webbsessionsclaims kontrolleras före databasen. Metadata
  ger inga rättigheter; familjeåtkomst kommer från aktiva databasrelationer.
- Begränsad JDBC-roll och transaktionslokal serverbyggd identitet. RLS gäller
  läsning, radlås och skrivning. Konto/session kontrolleras per transaktion.
- Samma transaktion skriver svar, revision, historik med konto/session/kanal
  och en beständig signalversion. Kommentartext och token sparas inte i historik.
- Aktivitetslås skyddar mot samtidig inställning och avslut. Upprepning av samma
  tillstånd skapar ingen ny historik. Olika samtidiga svar serialiseras; ingen
  klientrevision krävs i version 0.1, så en sen annorlunda begäran kan ersätta svaret.

[API-README](../../backend/api/README.md) beskriver körning, bootstrap, exakt
Auth-policy och gränser. [OpenAPI](../../backend/api/contract/openapi.json) och
[genererade TS-typer](../../backend/api/contract/generated.ts) är versionshanterade.
Ingen trigger eller Modulith-producent skriver samma händelse två gånger.
Signalversionen är endast beständig invalidering; ingen signalworker är ännu inkopplad.

## Lokala verifieringsgrindar

JUnit kör riktig signerad JWT → HTTP → begränsad JDBC → PostgreSQL med egna
syntetiska familjer. Testerna omfattar egen person/två barn, annan familj,
återkallad koppling, blockerat konto/session, fel claims/signatur/algoritm,
ES256/RS256, JWKS-rotation/nätfel, livscykelkonflikter, samtidiga skrivare,
upprepning, historik, rollback och poolad identitet. Separata migrationstester
installerar tomt schema respektive uppgraderar den nya identitetsbaslinjen,
validerar och återkör med bevarade syntetiska data. Modulith-gränser verifieras.

API-jobbet läggs till CI:s obligatoriska `verify` utan att ta bort befintliga
kontroller. Testresultat och ej körda grindar redovisas i [status](status.md).
Gamla Supabase-migrationer har inte ändrats: det nya schemat verifieras med
Liquibase/Testcontainers i stället för reset av gamla databasen.

## Nästa steg före aktivering

1. Provisionera den rena målmiljön med nya syntetiska konton och verksamhetsdata.
   Verifiera verklig issuer/audience/JWKS, inloggningssätt och Auth-livscykel.
   Leverantörens utloggning/radering behöver kopplas till lokal spärr eller en
   uttryckligt accepterad tokenlivslängd. Lokal JWT-verifiering ger inte omedelbar
   extern sessionsrevokering.
2. Koppla full signalberäkning till beständigt ansvar enligt M06. Den nuvarande
   signalversionen är ingen kö och inga notifieringar eller signaler har levererats.
3. Inför serverägd Next-adapter för dessa endpoints och den nya miljöns data.
   Behåll bearer-verifiering i backend; ingen skrivfallback efter timeout. Prova
   browser, omläsning och äldre payload tillsammans. Provisionerings-/aktivitets-
   läsning måste ge den nya frontendens ID:n, inte gamla testdatabasens.
4. Öva aktivering/återgång och dränering i avsedd miljö. Aktivera först när
   Vercel-lagringsfrågan är hanterad. Inga nya molnbyggen startas i denna leverans.

Gamla Telegram-/WhatsApp-/MCP-flöden är inte anslutna till den nya verksamhets-
databasen. Återgång av UI-routing får inte låtsas att gamla och nya testdata
är samma dataset. Datakopiering eller dubbelskrivning behövs inte för ren start.
