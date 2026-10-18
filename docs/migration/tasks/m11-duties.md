# M11: Flytta bokning av en arbetspassplats

Status: planerad. Beroenden: M07. Leverans: en avgränsad PR om inte nedan
anges att arbetet först ska delas. Alla PR-baser är aktuell `main`.

## Bakgrund och gemensamma beslut

Bokning är fristående från kallelsesvar. Konkurrens om sista plats avgörs i skrivtransaktionen, inte av händelser.

Läs [repoinstruktionerna](../../../AGENTS.md), [planen](../README.md),
[nuläget](../inventory.md), [besluten](../decisions.md),
[versionerna](../versions.md) och [status](../status.md).
Detta underlag räcker för att starta en separat Codex-session; verifiera sedan
aktuell kod och eventuella tillkommande AGENTS.md.

## Relevanta filer

docs/activity-duty-schedule.md, src/lib/activity-duty-schedule.ts, src/app/api/activities/[activityId]/duty-schedule/route.ts, supabase/tests/activity_duty_slots_test.sql, backend/. Nya backend-/infra-sökvägar beskriver avsedd plats och finns inte
nödvändigtvis innan beroendena är genomförda. Sökvägarna utgår från reporoten.

## Ingår

Implementera läsa lediga platser → boka själv → avboka i samma behörighetsmodell och med livscykellås. Emittera reaktion endast efter säkrat tillstånd. Bevara revision och audit.

## Acceptanskriterier

Två samtidiga försök till sista plats ger exakt en bokning och en tydlig konflikt. Familje-/lagisolering och genomförda pass respekteras. Upprepat kommando ger ingen extra bokning eller notifiering.

## Verifiering

JUnit/regler, parallella PostgreSQL-transaktioner, Modulithtest och browserflöde genom genererad klient.

## Lämnas till senare

Automatisk fördelning, ändringsförfrågningar, seriemallar och assistentens batcher flyttas i separata följduppgifter efter denna.

## Avslut och överlämning

Systemet ska lämnas byggbart och testbart. Kör relevanta befintliga kontroller
enligt AGENTS.md; behåll CI-skydd. Uppdatera [status](../status.md) med PR/commit,
ändrat beteende, körda/godkända/misslyckade/ej körda kontroller, begränsningar och
nästa beroende uppgift. Om omfånget växer, skapa en separat uppgiftsfil och
lämna en kort överlämning med beslut, filer, tester och återstående arbete.
