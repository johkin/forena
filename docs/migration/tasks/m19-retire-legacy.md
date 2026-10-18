# M19: Avveckla gamla resurser efter verifierad täckning

Status: planerad. Beroenden: M13, M18C. Leverans: en avgränsad PR om inte nedan
anges att arbetet först ska delas. Alla PR-baser är aktuell `main`.

## Bakgrund och gemensamma beslut

Att ny backend fungerar innebär inte att alla gamla skrivare, scheman, nycklar eller retentionjobb kan raderas. Fullständigt register från M04/M13 är grunden.

Läs [repoinstruktionerna](../../../AGENTS.md), [planen](../README.md),
[nuläget](../inventory.md), [besluten](../decisions.md),
[versionerna](../versions.md) och [status](../status.md).
Detta underlag räcker för att starta en separat Codex-session; verifiera sedan
aktuell kod och eventuella tillkommande AGENTS.md.

## Relevanta filer

docs/migration/status.md, infra/, .github/workflows/, supabase/, README.md. Nya backend-/infra-sökvägar beskriver avsedd plats och finns inte
nödvändigtvis innan beroendena är genomförda. Sökvägarna utgår från reporoten.

## Ingår

Stäm av samtliga funktioner/integrationer mot tester och ägarskap; avsluta alla följduppgifter. Stoppa gamla deploytriggers, Edge Functions, domändatabasjobb och gamla verksamhetsgrants stegvis. Behåll Supabase PostgreSQL, Auth och nödvändiga inställningar enligt ADR-008; avvecklingen gäller ersatta app-/workergränssnitt, inte databasvärden. Rotera uttjänta hemligheter enligt driftens rutin och fastställ backup/retention.

## Acceptanskriterier

Inga legitima anrop använder gamla verksamhetsvägar under avtalad observationsperiod. Auth/passkeys/OAuth fortsätter. Nya larm, återställningsrutin och faktiskt uppmätta miljökostnader finns; gamla resurser tas bort först enligt verifierad avvecklingslista.

## Verifiering

Logg-/trafikmätning med dataminimering, återställningstest och regression för webb/AI/Telegram/MCP samt alla notifieringskanaler. Jämför verkliga kostnader med budget.

## Lämnas till senare

Ingen borttagning av Supabase PostgreSQL eller Auth eller historik som omfattas av retentionkrav. Irreversibel resursradering sker först som separat konkret releaseåtgärd.

## Avslut och överlämning

Systemet ska lämnas byggbart och testbart. Kör relevanta befintliga kontroller
enligt AGENTS.md; behåll CI-skydd. Uppdatera [status](../status.md) med PR/commit,
ändrat beteende, körda/godkända/misslyckade/ej körda kontroller, begränsningar och
nästa beroende uppgift. Om omfånget växer, skapa en separat uppgiftsfil och
lämna en kort överlämning med beslut, filer, tester och återstående arbete.
