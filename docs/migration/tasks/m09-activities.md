# M09: Flytta skapa och ändra en enskild aktivitet

Status: implementerad på `feat/m09-activities`; aktuell verifiering och driftstatus finns i [status](../status.md). Beroenden: M07. Leverans: en avgränsad PR om inte nedan
anges att arbetet först ska delas. Alla PR-baser är aktuell `main`.

## Bakgrund och gemensamma beslut

Nuvarande create-route gör flera anrop; atomärt kommando är en föreslagen förbättring. Flytta en enskild aktivitet före serier/import.

Läs [repoinstruktionerna](../../../AGENTS.md), [planen](../README.md),
[nuläget](../inventory.md), [besluten](../decisions.md),
[versionerna](../versions.md) och [status](../status.md).
Detta underlag räcker för att starta en separat Codex-session; verifiera sedan
aktuell kod och eventuella tillkommande AGENTS.md.

## Relevanta filer

src/app/api/activities/route.ts, src/app/api/activities/[activityId]/route.ts, src/lib/activity-configuration.ts, src/lib/activity-time-rules.ts, docs/activity-time-rules.md, backend/. Nya backend-/infra-sökvägar beskriver avsedd plats och finns inte
nödvändigtvis innan beroendena är genomförda. Sökvägarna utgår från reporoten.

## Ingår

Användaren utökade 2026-10-23 samma PR med [hela administrationskedjan](m09a-club-team-administration.md). Se [körguide och gränser](../activity-management.md) för första systemadmin, klubb/sektion/lag och rolltilldelning.


Implementera skapa/ändra/inställ en aktivitet med domänregler, tidszon, disciplinförval, deltagare och schemaläggningsposter i en transaktion. Återanvänd applikationstjänst i webbens adapter. Fastställ activities/discipline-gräns utan cykel. Bevara audit och eventansvar.

## Acceptanskriterier

Behörighet, datum och relationer valideras; misslyckande lämnar inget halvt skapat flöde. Samtidig kallelserespons och inställning bevarar livscykellåset. Befintlig editor och gamla klienter fungerar.

## Verifiering

JUnit rena regler, PostgreSQL rollback/constraints, Modulith struktur/modultest och browser skapa → visa → ändra → inställ med relevanta nuvarande testfall.

## Lämnas till senare

Serier, extern matchimport, alla disciplinpaket och transporter blir egna senare uppgifter.

## Avslut och överlämning

Systemet ska lämnas byggbart och testbart. Kör relevanta befintliga kontroller
enligt AGENTS.md; behåll CI-skydd. Uppdatera [status](../status.md) med PR/commit,
ändrat beteende, körda/godkända/misslyckade/ej körda kontroller, begränsningar och
nästa beroende uppgift. Om omfånget växer, skapa en separat uppgiftsfil och
lämna en kort överlämning med beslut, filer, tester och återstående arbete.

## Utökning 2026-10-25

Användaren begärde paritet för översikt, kallelser vid redigering och skapande
av återkommande aktiviteter. React/Kotlin återanvänder nu de gemensamma korten
och serieformuläret. Redigering nås från öppnad aktivitet; extra listan på
lagöversikten tas bort. Kallelseval sparas atomärt vid redigering och veckoserier
skapas i en transaktion med beständig serieidentitet. Se
[aktivitetsflödet](../activity-management.md#återkommande-aktiviteter).
Äldre avgränsningen om att lämna allt seriestöd till senare gäller därför inte
längre skapandet; massändring av kommande tillfällen och extern leverans återstår.
