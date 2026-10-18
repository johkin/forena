# M12: Bygg och repetera Supabase till Cloud SQL-dataflytt

Status: vilande alternativ enligt ADR-008; ingår inte i aktiva backendmigreringen. Beroenden: M02, M04, M08. Leverans: en avgränsad PR om inte nedan
anges att arbetet först ska delas. Alla PR-baser är aktuell `main`.

## Bakgrund och gemensamma beslut

Liquibase-schemamigrering och dataflytt är skilda flöden. ADR-007 kräver bevarade identiteter och en enda skrivande databas.

Läs [repoinstruktionerna](../../../AGENTS.md), [planen](../README.md),
[nuläget](../inventory.md), [besluten](../decisions.md),
[versionerna](../versions.md) och [status](../status.md).
Detta underlag räcker för att starta en separat Codex-session; verifiera sedan
aktuell kod och eventuella tillkommande AGENTS.md.

## Relevanta filer

supabase/migrations/, docs/migration/sql-references.tsv, backend/src/main/resources/db/, infra/, docs/migration/decisions.md. Nya backend-/infra-sökvägar beskriver avsedd plats och finns inte
nödvändigtvis innan beroendena är genomförda. Sökvägarna utgår från reporoten.

## Ingår

Ta fram schema-/typmappning och separat export/import med resume/checkpoints. Bevara auth-UUID, verksamhets-ID, familjerelationer, historik, meddelandekvitton, köer och sekvenser. Kartlägg tenantgränser och gemensamma kataloger/identiteter innan klubbvis flytt väljs. Skriv frysning/överföring/validering/återföringsrunbook.

## Acceptanskriterier

Syntetisk representativ Supabase-källa kan flyttas till PostgreSQL17/Cloud SQL-test utan tappade relationer eller ändrat ägarskap. Omkörning kan inte duplicera data/utskick. Avbruten import återtas. Checksummor och negativa auth/tenanttester godkänns.

## Verifiering

Tomt + föregående schema + senaste schema, import, omkörning, avbrott och rollback/återföring. JUnit/Testcontainers och testmiljös molnprov, med jämförelse av counts/FK/constraints och verksamhetsresultat.

## Lämnas till senare

Ingen produktionsdump eller generell live-dubbelskrivning. Verklig cutover blockeras tills alla skrivvägar omfattas av M13:s grind.

## Avslut och överlämning

Systemet ska lämnas byggbart och testbart. Kör relevanta befintliga kontroller
enligt AGENTS.md; behåll CI-skydd. Uppdatera [status](../status.md) med PR/commit,
ändrat beteende, körda/godkända/misslyckade/ej körda kontroller, begränsningar och
nästa beroende uppgift. Om omfånget växer, skapa en separat uppgiftsfil och
lämna en kort överlämning med beslut, filer, tester och återstående arbete.
