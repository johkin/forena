# M16: Flytta en skrivskyddad assistent- och MCP-funktion

Status: planerad. Beroenden: M03, M07, M08. Leverans: en avgränsad PR om inte nedan
anges att arbetet först ska delas. Alla PR-baser är aktuell `main`.

## Bakgrund och gemensamma beslut

MCP och assistent ska återanvända samma regler men behålla olika grants och dataminimering. Vercel AI Gateway använder i dag Vercel OIDC.

Läs [repoinstruktionerna](../../../AGENTS.md), [planen](../README.md),
[nuläget](../inventory.md), [besluten](../decisions.md),
[versionerna](../versions.md) och [status](../status.md).
Detta underlag räcker för att starta en separat Codex-session; verifiera sedan
aktuell kod och eventuella tillkommande AGENTS.md.

## Relevanta filer

docs/mcp.md, docs/assistant-memory.md, src/lib/mcp/, src/lib/ai/team-assistant-context.ts, src/lib/ai/team-assistant-tools.ts, backend/. Nya backend-/infra-sökvägar beskriver avsedd plats och finns inte
nödvändigtvis innan beroendena är genomförda. Sökvägarna utgår från reporoten.

## Ingår

Flytta ett läsfall för lagöversikt med gemensam applikationstjänst och tunna MCP/AI-adaptrar. Verifiera modellen/providerautentisering från Cloud Run och dokumentera kostnads-/dataskydd. Behåll samtycke och explicit resourceadress; för varje återstående verktyg/minne skapa egen uppgift med behörigheter och tester.

## Acceptanskriterier

Samma användare får konsekventa men kanalminimerade fakta. Fel grant/scope/klient/lag nekas. Inga modellinstruktioner kan ge extra rättigheter; inga privata kommentarer/minnen exporteras oavsiktligt. Extern MCP OAuth-discovery/consent/token/tool fungerar med syntetisk klient.

## Verifiering

MCP-protokolltest och faktisk extern testklient, modelstub + kontrollerat providerprov på Cloud Run, PostgreSQL-isolation och loggkontroll för personuppgifter/tokens.

## Lämnas till senare

Inga nya skrivverktyg eller automatisk bekräftelse av AI-förslag. Detta färdigställer ett läsfall; övriga befintliga verktyg är explicita pilotblockerare tills egna uppgifter avslutats.

## Avslut och överlämning

Systemet ska lämnas byggbart och testbart. Kör relevanta befintliga kontroller
enligt AGENTS.md; behåll CI-skydd. Uppdatera [status](../status.md) med PR/commit,
ändrat beteende, körda/godkända/misslyckade/ej körda kontroller, begränsningar och
nästa beroende uppgift. Om omfånget växer, skapa en separat uppgiftsfil och
lämna en kort överlämning med beslut, filer, tester och återstående arbete.
