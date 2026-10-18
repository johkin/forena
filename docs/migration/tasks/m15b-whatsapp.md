# M15B: Flytta WhatsApps koppling, leverans och kallelsesvar

Status: planerad. Beroenden: M07, M08, M10. Leverans: en avgränsad PR. Alla PR-baser är aktuell `main`.

## Bakgrund och gemensamma beslut

Båda kanalerna är befintliga funktioner och behövs i skriv-/leveransregistret före pilotcutover. Varje kanal har separat uppgift och aktivering.

Läs [repoinstruktionerna](../../../AGENTS.md), [planen](../README.md),
[nuläget](../inventory.md), [besluten](../decisions.md),
[versionerna](../versions.md) och [status](../status.md).
Detta underlag räcker för att starta en separat Codex-session; verifiera sedan
aktuell kod och eventuella tillkommande AGENTS.md.

## Relevanta filer

docs/whatsapp.md, src/app/api/whatsapp/, src/app/api/push-subscriptions/route.ts, src/lib/push-subscription.ts, public/sw.js, supabase/functions/notification-worker/index.ts. Nya backend-/infra-sökvägar beskriver avsedd plats och finns inte
nödvändigtvis innan beroendena är genomförda. Sökvägarna utgår från reporoten.

## Ingår

Flytta verifierad kontokoppling, HMAC-webhook, snapshots, Meta-mallar och knappsvar via samma svarstjänst. Bevara samtycke, verifierat telefonägarskap, partiella accepter per barn och ordning på callbacks.

## Acceptanskriterier

Koppla → kontrollerad testleverans → knappsvar → omläsning fungerar. Fel HMAC/avsändare, gammal callback, återanvänt bevis och återkallad familjerelation nekas. Återförsök efter partiell leverans dubblerar inte accepterade barnmeddelanden.

## Verifiering

Separata webhook-/adaptertester, PostgreSQL-deduplicering och verkligt Meta-testnummer/testapp med tillåtelselista. Öva omstart och förlorad kvittens.

## Lämnas till senare

Web Push ligger i M15A. Ingen aktivering för riktiga mottagare eller otestad ändring av mallkategori. Stäng inte gammal ingress innan ersättaren verifierats.

## Avslut och överlämning

Systemet ska lämnas byggbart och testbart. Kör relevanta befintliga kontroller
enligt AGENTS.md; behåll CI-skydd. Uppdatera [status](../status.md) med PR/commit,
ändrat beteende, körda/godkända/misslyckade/ej körda kontroller, begränsningar och
nästa beroende uppgift. Om omfånget växer, skapa en separat uppgiftsfil och
lämna en kort överlämning med beslut, filer, tester och återstående arbete.
