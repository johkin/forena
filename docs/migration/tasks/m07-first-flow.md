# M07: Koppla första kompletta svarflödet till Kotlin

Status: delvis implementerad (2026-10-19). Beroenden: M05, M06. Leverans: en avgränsad PR om inte nedan
anges att arbetet först ska delas. Alla PR-baser är aktuell `main`.

API och versionshanterat OpenAPI/TS-kontrakt finns i `backend`. Serverstyrd
Next-adapter, avskild browservy och återkörbar syntetisk seed finns nu enligt
[browserflödet](../browser-participation.md). Ordinarie översiktens nya
ID-/aktivitetsläsning, full signalworker och driftaktivering återstår.
ADR-010 ersätter den gamla gemensamma databasen med ren start utan dataimport.
Se [första flödet](../first-flow.md) för aktuell avgränsning.

## Bakgrund och gemensamma beslut

Ren start utan gamla testdata enligt ADR-010. Befintliga UI-komponenter återanvänds när de kopplas till den nya miljön; tidigare antagande om samma databas gäller inte längre. first-flow.md beskriver aktuell ordning.

Läs [repoinstruktionerna](../../../AGENTS.md), [planen](../README.md),
[nuläget](../inventory.md), [besluten](../decisions.md),
[versionerna](../versions.md) och [status](../status.md).
Detta underlag räcker för att starta en separat Codex-session; verifiera sedan
aktuell kod och eventuella tillkommande AGENTS.md.

## Relevanta filer

src/components/overview-invitation-response.tsx, src/components/activity-invitation-response.tsx, src/app/api/invitations/[invitationId]/respond/route.ts, src/app/api/activities/[activityId]/my-invitations/route.ts, backend/. Nya backend-/infra-sökvägar beskriver avsedd plats och finns inte
nödvändigtvis innan beroendena är genomförda. Sökvägarna utgår från reporoten.

## Ingår

Exponera verksamhets-API med OpenAPI och reproducerbart genererade TS-typer/klient. Låt befintliga Next-endpoints vara tunna kompatibilitetsadaptrar som skickar riktig access token till backend. Inför serverägd routing och säker felhantering utan skrivfallback. Behåll omläsning/optimistisk UI-semantik.

## Acceptanskriterier

Syntetisk målsman med två barn kan läsa, svara, ändra, återställa och ladda om genom ny backend. Fel/scopes/isolation/samtidighet och historik/signalreaktion följer first-flow.md. Äldre klientpayload och öppna flikar fungerar. Komponentreferensen är fortsatt korrekt.

## Verifiering

Browser → Next-adapter → Kotlin → PostgreSQL → signalhantering → omläsning. Kör relevanta Vitest/pgTAP, JUnit/Modulith och fulla appkontroller vid kodändring. Öva routingaktivering och återgång i avsedd testmiljö.

## Lämnas till senare

Ingen Vite-flytt, Cloud SQL-dataflytt, ny kanal eller kallelseskapande. Om UI-element ändras uppdateras /components i samma PR.

## Avslut och överlämning

Systemet ska lämnas byggbart och testbart. Kör relevanta befintliga kontroller
enligt AGENTS.md; behåll CI-skydd. Uppdatera [status](../status.md) med PR/commit,
ändrat beteende, körda/godkända/misslyckade/ej körda kontroller, begränsningar och
nästa beroende uppgift. Om omfånget växer, skapa en separat uppgiftsfil och
lämna en kort överlämning med beslut, filer, tester och återstående arbete.
