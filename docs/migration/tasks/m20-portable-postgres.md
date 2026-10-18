# M20: Verifiera portabel verksamhetsdatabas på Supabase PostgreSQL

Status: planerad. Beroenden: M04, M07, M13. Leverans: en avgränsad PR om inte nedan
anges att arbetet först ska delas. Alla PR-baser är aktuell `main`.

## Bakgrund och gemensamma beslut

ADR-008 behåller Supabase som databasvärd men verksamhetskoden ska inte kräva dess Auth-schema, Data API eller cron. M05 är en säker övergång som behåller befintlig RLS och triggers; den är inte slutlig frikoppling. Läs AGENTS.md i reporoten, ../README.md, ../decisions.md och ../inventory.md före start.

## Relevanta filer

backend/src/main/resources/db/, backendens JDBC-adaptrar och behörighetstjänster, supabase/migrations/, supabase/tests/, ../sql-references.tsv och M04:s effektiva regelmatris. Backendfiler införs av föregående uppgifter.

## Ingår

Ta ett redan flyttat verksamhetsflöde i taget och ersätt dess kvarvarande beroenden till auth.uid(), auth.users, Supabase-RPC, cron och privilegierade funktioner. Behåll vanliga PostgreSQL-constraints/triggers där de skyddar verksamhetsregler. Överlämna migrationsägarskap uttryckligt per objekt till Liquibase. Behåll auth/storage under Supabases ägarskap. Bryt ut återstående flöden i egna små uppgifter; denna första PR verifierar kallelsesvarsflödets portabilitet.

## Acceptanskriterier

Kallelsesvar med samma identitets-UUID, familje-/lagbehörighet, livscykellås, historik och händelser fungerar på PostgreSQL17 utan Supabaseinstallerade auth-funktioner. Backendkontot saknar superuser/BYPASSRLS. Borttagen familjekoppling och annan tenant nekas i skrivtransaktionen. Inget säkerhetsskydd tas bort innan ersättaren verifierats. Kvarstående plattformsberoenden är listade per flöde.

## Verifiering

JUnit/Testcontainers mot vanlig PostgreSQL samt motsvarande isolerad Supabase-testdatabas. Prova tomt/uppgraderat schema, omkörning, samtidighet, rollback, nekad åtkomst och samma svarflöde genom API. Jämför effektiva grants/policies före och efter. Befintliga relevanta pgTAP-prov måste fortsatt passera eller få verifierade motsvarigheter.

## Lämnas till senare

Ingen Cloud SQL-dataflytt, ändring av Auth/RP-ID, egen OAuth-server eller global avaktivering av RLS. Samtliga andra verksamhetsflöden får egna uppgifter med M04:s regelmatris som underlag.

## Avslut och överlämning

Systemet ska lämnas byggbart och testbart. Kör relevanta befintliga kontroller
enligt AGENTS.md; behåll CI-skydd. Uppdatera [status](../status.md) med PR/commit,
ändrat beteende, körda/godkända/misslyckade/ej körda kontroller, begränsningar och
nästa beroende uppgift. Om omfånget växer, skapa en separat uppgiftsfil och
lämna en kort överlämning med beslut, filer, tester och återstående arbete.
