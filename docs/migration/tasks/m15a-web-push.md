# M15A: Flytta Web Push-prenumeration och leverans

Status: planerad. Beroenden: M07, M08, M10. Leverans: en avgränsad PR. Alla PR-baser är aktuell `main`.

## Bakgrund och gemensamma beslut

Web Push är en befintlig funktion som behövs i skriv-/leveransregistret före pilotcutover. Kanalen har separat aktivering.

Läs [repoinstruktionerna](../../../AGENTS.md), [planen](../README.md),
[nuläget](../inventory.md), [besluten](../decisions.md),
[versionerna](../versions.md) och [status](../status.md).
Detta underlag räcker för att starta en separat Codex-session; verifiera sedan
aktuell kod och eventuella tillkommande AGENTS.md.

## Relevanta filer

`src/app/api/push-subscriptions/`, `src/lib/push-subscription.ts`,
`public/sw.js` och `supabase/functions/notification-worker/index.ts`.

## Ingår

Flytta pushregistrering/avaktivering och leverans med samma VAPID, användarägarskap och hantering av 404/410. Bevara endpoint-upsert, återaktivering och mjuk avstängning. Överta leveransansvaret från gammal worker med kvittenser och dokumenterad aktivering.

## Acceptanskriterier

Aktivera → leverera testkallelse → öppna rätt aktivitet → avaktivera fungerar på avsedd testmobil. Dubbletter skapar inte extra prenumerationer/utskick. Annan användare kan inte ändra prenumerationen; kontobyte och utgången prenumeration fungerar.

## Verifiering

Parser-/adaptertest, PostgreSQL/RLS, riktig testbrowser och PWA/enhet. Prova fallback och 404/410, service-worker-cache och gammal frontend.

## Lämnas till senare

## Avslut och överlämning

Systemet ska lämnas byggbart och testbart. Kör relevanta befintliga kontroller
enligt AGENTS.md; behåll CI-skydd. Uppdatera [status](../status.md) med PR/commit,
ändrat beteende, körda/godkända/misslyckade/ej körda kontroller, begränsningar och
nästa beroende uppgift. Om omfånget växer, skapa en separat uppgiftsfil och
lämna en kort överlämning med beslut, filer, tester och återstående arbete.
