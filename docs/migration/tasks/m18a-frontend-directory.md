# M18A: Flytta befintlig frontend till egen katalog

Status: planerad. Beroenden: M00. Leverans: en avgränsad PR om inte nedan
anges att arbetet först ska delas. Alla PR-baser är aktuell `main`.

## Bakgrund och gemensamma beslut

Den mekaniska katalogflytten kan förberedas oberoende när deployroot kan samordnas. Ramverks- och hostingbyte väntar på M18B/M18C. Behåll React/TypeScript, npm och nuvarande beteende.

Läs [repoinstruktionerna](../../../AGENTS.md), [planen](../README.md),
[nuläget](../inventory.md), [besluten](../decisions.md),
[versionerna](../versions.md) och [status](../status.md).
Detta underlag räcker för att starta en separat Codex-session; verifiera sedan
aktuell kod och eventuella tillkommande AGENTS.md.

## Relevanta filer

src/, public/, package.json, package-lock.json, .github/workflows/, infra/, docs/design-spec.md, backend/OpenAPI. Nya backend-/infra-sökvägar beskriver avsedd plats och finns inte
nödvändigtvis innan beroendena är genomförda. Sökvägarna utgår från reporoten.

## Ingår

Flytta befintlig Next.js-app mekaniskt till frontend/ utan ramverksbyte. Uppdatera npm/script-sökvägar, Vitest/TypeScript, CI-cache, Supabase-typgenerering och befintlig Vercel-deployroot. Behåll supabase/, docs/, backend/ och infra/ på reporoten.

## Acceptanskriterier

npm ci/test/typecheck/lint/build fungerar i frontend/. Databasjobb och testimporter fungerar, och Vercel-root/sökvägar är uttryckligen samordnade med deploy. Samma UI och URL:er bevaras.

## Verifiering

Fulla befintliga appkontroller och relevanta databas-/typkontroller; verifiera deployplanens arbetskatalog utan att rulla ut orelaterad kod.

## Lämnas till senare

Ingen Vite-, API-, auth-, design- eller hostingändring i denna PR. Om Vercelroot inte kan ändras samordnat skjuts hela mekaniska flytten upp.

## Avslut och överlämning

Systemet ska lämnas byggbart och testbart. Kör relevanta befintliga kontroller
enligt AGENTS.md; behåll CI-skydd. Uppdatera [status](../status.md) med PR/commit,
ändrat beteende, körda/godkända/misslyckade/ej körda kontroller, begränsningar och
nästa beroende uppgift. Om omfånget växer, skapa en separat uppgiftsfil och
lämna en kort överlämning med beslut, filer, tester och återstående arbete.
