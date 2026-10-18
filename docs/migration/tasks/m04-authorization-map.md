# M04: Återskapa effektiv databas- och behörighetskatalog

Status: planerad. Beroenden: M00. Leverans: en avgränsad PR om inte nedan
anges att arbetet först ska delas. Alla PR-baser är aktuell `main`.

## Bakgrund och gemensamma beslut

Den statiska SQL-listan innehåller migrationshistorik och ersatta funktioner; den är inte en export av effektiv katalog. Detta är underlag för både första flödet och dataflytten.

Läs [repoinstruktionerna](../../../AGENTS.md), [planen](../README.md),
[nuläget](../inventory.md), [besluten](../decisions.md),
[versionerna](../versions.md) och [status](../status.md).
Detta underlag räcker för att starta en separat Codex-session; verifiera sedan
aktuell kod och eventuella tillkommande AGENTS.md.

## Relevanta filer

docs/migration/sql-references.tsv, supabase/migrations/, supabase/tests/, docs/security-architecture.md, src/lib/activity-management-context.ts. Nya backend-/infra-sökvägar beskriver avsedd plats och finns inte
nödvändigtvis innan beroendena är genomförda. Sökvägarna utgår från reporoten.

## Ingår

Återskapa lokal databas. Exportera tabeller/FK/constraints, effektiva RLS-policies/grants, definer/invoker-funktioner, triggers, auth-referenser, cron/net/Vault, storage och retention. Gör regelmatris per verksamhetsområde: källa, scope, tillåtet/nekat, målskydd, test, status. Stäm av avsedd driftkonfiguration read-only när tillgång finns.

## Acceptanskriterier

Varje verksamhetstabell/funktion har ägare och migreringsstatus. Svarflödets familj, klubb, sektion, lag, roller och datumvillkor är uttryckliga och förankrade i testfall. Avvikelser mot drift markeras utan att påstå full täckning.

## Verifiering

supabase db reset och supabase test db mot lokal stack; jämför katalogexport med migrationsbasen och testmatrisen. Kontrollera att exporten saknar persondata/hemligheter.

## Lämnas till senare

Ingen schema- eller behörighetsändring. Driftinventering får lämnas uttryckligen blockerad, men inget berört cutover får aktiveras då.

## Avslut och överlämning

Systemet ska lämnas byggbart och testbart. Kör relevanta befintliga kontroller
enligt AGENTS.md; behåll CI-skydd. Uppdatera [status](../status.md) med PR/commit,
ändrat beteende, körda/godkända/misslyckade/ej körda kontroller, begränsningar och
nästa beroende uppgift. Om omfånget växer, skapa en separat uppgiftsfil och
lämna en kort överlämning med beslut, filer, tester och återstående arbete.
