# M10: Flytta en kallelseleverans med kontrollerad e-post

Status: planerad. Beroenden: M06, M08, M09. Leverans: en avgränsad PR om inte nedan
anges att arbetet först ska delas. Alla PR-baser är aktuell `main`.

## Bakgrund och gemensamma beslut

Separera beslut att skicka från transportförsök och revisionshistoria. Befintliga snapshots/checkpoints och Resend måste bevaras.

Läs [repoinstruktionerna](../../../AGENTS.md), [planen](../README.md),
[nuläget](../inventory.md), [besluten](../decisions.md),
[versionerna](../versions.md) och [status](../status.md).
Detta underlag räcker för att starta en separat Codex-session; verifiera sedan
aktuell kod och eventuella tillkommande AGENTS.md.

## Relevanta filer

docs/scheduled-tasks.md, supabase/functions/scheduled-task-worker/index.ts, supabase/functions/notification-worker/index.ts, src/app/api/activities/[activityId]/remind/route.ts, backend/. Nya backend-/infra-sökvägar beskriver avsedd plats och finns inte
nödvändigtvis innan beroendena är genomförda. Sökvägarna utgår från reporoten.

## Ingår

Flytta ett fullständigt flöde publicerad aktivitet → förfallen kallelse → färdig meddelandepayload → Resend-testmottagare → kvittens/status. Överta exakt ett leveransansvar från gammal kö enligt M06. Bevara mottagarbehörighet vid beslut, meddelande-ID och leverantörens idempotensfönster.

## Acceptanskriterier

Commit och beständigt leveransansvar är atomära; överlämningen lämnar ingen gammal aktiv producent för samma flöde. Fel, ack-förlust och replay provas och ingen okontrollerad dubbelsändning sker. Mottagare i test är tillåtelselista/sink och aldrig riktiga medlemmar.

## Verifiering

PostgreSQL + transportkontrakt, Resend-testläge/avsedd testdomän, Cloud Run scale-to-zero och Scheduler-trigger; mät köfördröjning och kontrollera larm/operatörsåtertag.

## Lämnas till senare

## Avslut och överlämning

Systemet ska lämnas byggbart och testbart. Kör relevanta befintliga kontroller
enligt AGENTS.md; behåll CI-skydd. Uppdatera [status](../status.md) med PR/commit,
ändrat beteende, körda/godkända/misslyckade/ej körda kontroller, begränsningar och
nästa beroende uppgift. Om omfånget växer, skapa en separat uppgiftsfil och
lämna en kort överlämning med beslut, filer, tester och återstående arbete.
