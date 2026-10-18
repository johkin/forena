# M18C: Driftsätt frontend på Firebase med kopplad backendversion

Status: planerad. Beroenden: M08, M18B. Leverans: en avgränsad PR om inte nedan
anges att arbetet först ska delas. Alla PR-baser är aktuell `main`.

## Bakgrund och gemensamma beslut

Frontend flyttas efter backend/API- och renderinggrindar. Behåll React/TypeScript, npm, mobilbeteende och gemensamma produktionskomponenter.

Läs [repoinstruktionerna](../../../AGENTS.md), [planen](../README.md),
[nuläget](../inventory.md), [besluten](../decisions.md),
[versionerna](../versions.md) och [status](../status.md).
Detta underlag räcker för att starta en separat Codex-session; verifiera sedan
aktuell kod och eventuella tillkommande AGENTS.md.

## Relevanta filer

src/, public/, package.json, package-lock.json, .github/workflows/, infra/, docs/design-spec.md, backend/OpenAPI. Nya backend-/infra-sökvägar beskriver avsedd plats och finns inte
nödvändigtvis innan beroendena är genomförda. Sökvägarna utgår från reporoten.

## Ingår

Inför Firebase Hosting/CDN och verifierad /api-rewrite till Cloud Run. Separera publik runtimekonfiguration från frontendartefakten. Preview ska automatiskt ange rätt frontend-SHA/backenddigest, isolerad datakälla och kanalsänkor. Återanvänd samma versionsmärkta artefakter mellan miljöer.

## Acceptanskriterier

Frontend/backend kan deployas separat och samordnat. Samma frontendartefakt främjas dev/test/prod, rätt API-version används i varje preview, och gamla flikar fungerar. Login/passkey/magic-link/MCP-origin och signerade callbacks fungerar på rätt domän utan oavsiktligt RP-ID-byte.

## Verifiering

Verklig Hosting-testdeploy, cache/headers/rewrite/timeout/streaming, artefaktdigests och preview-manifest, auth/kanal-E2E samt kontrollerad återgång av routing.

## Lämnas till senare

Avveckling av gamla resurser i M19. Inga hemligheter i runtimekonfiguration och inget domänbyte innan RP-ID/redirect- och pushplan verifierats.

## Avslut och överlämning

Systemet ska lämnas byggbart och testbart. Kör relevanta befintliga kontroller
enligt AGENTS.md; behåll CI-skydd. Uppdatera [status](../status.md) med PR/commit,
ändrat beteende, körda/godkända/misslyckade/ej körda kontroller, begränsningar och
nästa beroende uppgift. Om omfånget växer, skapa en separat uppgiftsfil och
lämna en kort överlämning med beslut, filer, tester och återstående arbete.
