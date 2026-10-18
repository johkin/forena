# M18B: Implementera Vite och vald publik renderingsstrategi

Status: planerad. Beroenden: M13, M17, M18A. Leverans: en avgränsad PR om inte nedan
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

Implementera Vite med M17:s beslut om publika sidor och verifierade ersättare till Next-specifika beroenden. Inventera server actions, routes, callbacks, RSC-läsningar och headers; bryt ut större återstående adapterflyttar i egna uppgifter före aktivering. Återanvänd UI, OpenAPI-klient, AppShell och komponentreferens.

## Acceptanskriterier

Alla befintliga användarflöden har verifierade ersättare och publika HTML/metadata/404 uppfyller M17. Mobil/PWA och /components bevaras. Äldre öppna flikar fungerar med mål-API och nya bygget läser separat publik runtimekonfiguration.

## Verifiering

Browserregression för login, familj, aktivitet, svar, närvaro, pass, admin och kanaler; 320/375/390/768 px och desktop, offline/logout/cache, API-kontrakt samt fulla app/backend/databaskontroller.

## Lämnas till senare

Firebase-release ligger i M18C. Avaktivera inte Next förrän varje ersättare i inventeringen är verifierad. Växande funktionsportning blir egen PR.

## Avslut och överlämning

Systemet ska lämnas byggbart och testbart. Kör relevanta befintliga kontroller
enligt AGENTS.md; behåll CI-skydd. Uppdatera [status](../status.md) med PR/commit,
ändrat beteende, körda/godkända/misslyckade/ej körda kontroller, begränsningar och
nästa beroende uppgift. Om omfånget växer, skapa en separat uppgiftsfil och
lämna en kort överlämning med beslut, filer, tester och återstående arbete.
