# Första verksamhets-API:t: familjens kallelsesvar

Status 2026-10-19: API-delen finns i `backend` och har klarat verkligt
Auth-/databasprov efter PR #114. På `feat/kotlin-browser-flow`, från main
`548d627`, har även en avskild browservy med serverstyrd Next-adapter och
syntetisk seed införts. Ingen API-deploy eller omkoppling av ordinarie översikt
ingår. Detta är en del av M02/M03/M05/M07, inte slutlig acceptans av hela M07.
Modulen heter `activities` enligt ADR-015; `InvitationService` hanterar kallelser
inom aktivitetsdomänen. `identity` äger konto/session och familjeåtkomst.

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
- Spring Data JDBC-repositories med genererad CRUD, begränsad runtime-roll
  och uttryckliga åtkomstregler i Kotlin enligt ADR-012; ingen RLS i det privata
  API-schemat. Konto/session kontrolleras per transaktion, familj/organisation
  före läsresultat och före/efter skrivlås. Ingen databaskontext sätts.
- `@Service`/`@Transactional` äger all svarslogik enligt ADR-013. Läsmetoden är
  read-only. Repositories sparar svarstid, revision, historik och signalversion;
  inga egna databasfunktioner/procedurer eller verksamhetstriggers finns efter steg 004.
- Samma transaktion skriver svar, revision, historik med konto/kanal (inget sessions-ID enligt ADR-014)
  och en beständig signalversion. Kommentartext och token sparas inte i historik.
- Aktivitetslås skyddar mot samtidig inställning och avslut. Upprepning av samma
  tillstånd skapar ingen ny historik. Olika samtidiga svar serialiseras; ingen
  klientrevision krävs i version 0.1, så en sen annorlunda begäran kan ersätta svaret.

[API-README](../../backend/README.md) beskriver körning, bootstrap, exakt
Auth-policy och gränser. [OpenAPI](../../backend/contract/openapi.json) och
[genererade TS-typer](../../backend/contract/generated.ts) är versionshanterade. Specen genereras med springdoc 3.1.1 från REST-controllers
med typade request-/svarsklasser. Maven-verifieringen exporterar den via den
bearer-skyddade `/v3/api-docs`; CI genererar och jämför både spec och TS-typer.
Kotlin-tjänsten är ensam producent av historik/signalversion; inga triggers
eller Modulith-producenter skriver samma händelse en gång till.
Signalversionen är endast beständig invalidering; ingen signalworker är ännu inkopplad.

De befintliga Next-rutterna kan nu väljas till Kotlin genom servermiljön i
en avskild testprocess. Standard är fortsatt legacy. Browserns SSR-session
verifieras och dess bearer-token skickas vidare utan cookies/adminnycklar.
`/migration/participation` återanvänder det gemensamma sidskalet och
svarskomponenten med nya seedens aktivitets-ID. Läs
[browserflödet och dess körinstruktion](browser-participation.md).

## Lokala verifieringsgrindar

JUnit kör riktig signerad JWT → HTTP → begränsad JDBC → PostgreSQL med egna
syntetiska familjer. Testerna omfattar egen person/två barn, annan familj,
återkallad koppling, blockerat konto/session, fel claims/signatur/algoritm,
ES256/RS256, JWKS-rotation/nätfel, livscykelkonflikter, samtidiga skrivare,
upprepning, historik, rollback vid historik-/signalfel, låsväntan över sluttid och
signalversion vid samtidiga svar på olika kallelser. Separata migrationstester
installerar tomt schema respektive uppgraderar alla fyra tidigare baslinjer,
validerar och återkör med bevarade syntetiska data. Modulith-gränser verifieras.

API-jobbet läggs till CI:s obligatoriska `verify` utan att ta bort befintliga
kontroller. Testresultat och ej körda grindar redovisas i [status](status.md).
Gamla Supabase-migrationer har inte ändrats: det nya schemat verifieras med
Liquibase/Testcontainers i stället för reset av gamla databasen.

## Nästa steg före aktivering

Uppföljning 2026-10-19: begränsade LOGIN-roller, JDBC med betrodd CA/hostname,
femstegsmigrering/återkörning och riktig Auth-livscykel är verifierade i
`forena-kotlin`; se [målmiljö/Auth](target-auth-lifecycle.md). Även den avskilda
browserkedjan har verifierats i Vercel Sandbox enligt
[browserunderlaget](browser-participation.md). Det ersätter inte grindarna nedan.

1. Inför ordinarie aktivitets-/ID-läsning från den nya databasen och kontrollera
   hela översiktens familjedata. Den avskilda testsidan använder ett servervalt
   seed-ID och ersätter inte denna läsning. Gamla och nya test-ID:n blandas inte.
2. Koppla full signalberäkning till beständigt ansvar enligt M06. Den nuvarande
   signalversionen är ingen kö och inga notifieringar eller signaler har levererats.
3. Verifiera återstående Auth-metoder och browser-PKCE separat. Lösenordsflödets
   SSR-cookies, svar/kommentar/återställning, omläsning, äldre snabbpayload,
   familjeavgränsning och logout är verifierade i det avskilda browserprovet.
   Bearer-verifiering i backend och avsaknad av skrivfallback behålls.
4. Öva aktivering/återgång och dränering i avsedd miljö. Aktivera först när
   Vercel-lagringsfrågan är hanterad. Inga nya molnbyggen startas i denna leverans.

Gamla Telegram-/WhatsApp-/MCP-flöden är inte anslutna till den nya verksamhets-
databasen. Återgång av UI-routing får inte låtsas att gamla och nya testdata
är samma dataset. Datakopiering eller dubbelskrivning behövs inte för ren start.
