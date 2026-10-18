# M14: Flytta Telegrams verifierade koppling och kallelsesvar

Status: planerad. Beroenden: M07, M08. Leverans: en avgränsad PR om inte nedan
anges att arbetet först ska delas. Alla PR-baser är aktuell `main`.

## Bakgrund och gemensamma beslut

Boten finns redan och delar privat identitet, snapshots och deduplicering med databasen. I monoliten krävs ingen självsignerad Supabase-token.

Läs [repoinstruktionerna](../../../AGENTS.md), [planen](../README.md),
[nuläget](../inventory.md), [besluten](../decisions.md),
[versionerna](../versions.md) och [status](../status.md).
Detta underlag räcker för att starta en separat Codex-session; verifiera sedan
aktuell kod och eventuella tillkommande AGENTS.md.

## Relevanta filer

docs/telegram.md, src/app/api/telegram/, src/lib/telegram.ts, src/lib/telegram-assistant.ts, supabase/tests/telegram_invitation_scope_test.sql, backend/. Nya backend-/infra-sökvägar beskriver avsedd plats och finns inte
nödvändigtvis innan beroendena är genomförda. Sökvägarna utgår från reporoten.

## Ingår

Flytta koppla konto → privat kallelse → knappsvar → applikationstjänst. Bevara samtycke, hashat 256-bitars engångsbevis, TTL, webhookheader, avsändarkontroll, uppdateringsordning och avkoppling. Flytta privat assistent i en följd-PR om den inte ryms; gruppfunktioner behåller sina begränsningar.

## Acceptanskriterier

Återanvänt/utgånget bevis, fel avsändare, avkopplat konto, borttagen familjerelation och äldre update kan inte ändra svar. Verifierad kontext och kanal auditeras. Gruppen får inte privat data och frågetext kan inte välja konto.

## Verifiering

Kontraktstest webhook, PostgreSQL-deduplicering och engångsförbrukning, verifierad privat testbot end-to-end. Negativtest service-/signeringshemlighetsfri applikationstjänst.

## Lämnas till senare

Ingen grupptolkning med AI eller egen autentiseringsserver. Behåll gamla verifierade flöden tills varje ersättare aktiverats atomärt.

## Avslut och överlämning

Systemet ska lämnas byggbart och testbart. Kör relevanta befintliga kontroller
enligt AGENTS.md; behåll CI-skydd. Uppdatera [status](../status.md) med PR/commit,
ändrat beteende, körda/godkända/misslyckade/ej körda kontroller, begränsningar och
nästa beroende uppgift. Om omfånget växer, skapa en separat uppgiftsfil och
lämna en kort överlämning med beslut, filer, tester och återstående arbete.
