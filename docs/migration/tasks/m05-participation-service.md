# M05: Implementera familjeläsning och svarstjänst i den rena verksamhetsdatabasen

Status: delvis implementerad (2026-10-19). Beroenden: M02, M03, M04. Leverans: en avgränsad PR om inte nedan
anges att arbetet först ska delas. Alla PR-baser är aktuell `main`.

Läs-/svarstjänsten finns i `backend`, på nytt tomt schema enligt ADR-010. Personåtkomst i Kotlin utan RLS enligt ADR-012, transaktion, historik och livscykellås är verifierbara; full signalreaktion återstår. Se [första flödet](../first-flow.md) för aktuell avgränsning.

## Bakgrund och gemensamma beslut

Första kompletta flödet beskrivs i first-flow.md. ADR-010 anger nytt tomt verksamhetsschema utan import av gamla testdata. Befintliga sidoeffekter måste implementeras och verifieras separat, inte antas följa med.

Läs [repoinstruktionerna](../../../AGENTS.md), [planen](../README.md),
[nuläget](../inventory.md), [besluten](../decisions.md),
[versionerna](../versions.md) och [status](../status.md).
Detta underlag räcker för att starta en separat Codex-session; verifiera sedan
aktuell kod och eventuella tillkommande AGENTS.md.

## Relevanta filer

src/app/api/invitations/[invitationId]/respond/route.ts, src/app/api/activities/[activityId]/my-invitations/route.ts, supabase/tests/invitations_rls_test.sql, supabase/tests/invitation_response_lifecycle_test.sql, backend/. Nya backend-/infra-sökvägar beskriver avsedd plats och finns inte
nödvändigtvis innan beroendena är genomförda. Sökvägarna utgår från reporoten.

## Ingår

Inför organization/activities/participation-API:er i minsta nödvändiga omfattning och gemensam applikationstjänst. Implementera egen/familj-läsning och svar med samma fältsemantik. Bevisa begränsad JDBC-roll och transaktionslokal serverbyggd auth-kontext; nya RLS-policyer och livscykel-/historiktriggers införs. Inför revisionsuppgift om användare/kanal utan privat innehåll.

## Acceptanskriterier

Alla positiva och negativa regler i first-flow.md håller mot riktig databas. Omöjligt att kringgå RLS via runtimekonto eller läcka claims mellan poolade anrop. Historik och beständig signalversion skapas atomärt av en producent; oförändrat svar får inga extra poster. Full signalreaktion återstår att koppla in enligt M06.

## Verifiering

JUnit/regler utan transport, Modulith verifiering och modultest, PostgreSQL-test med verkliga policyer/triggers, parallell inställning/svar och rollback. Det nya schemat verifieras med Liquibase/Testcontainers; gamla pgTAP-prov används som regelunderlag.

## Lämnas till senare

Ingen aktivering i webb, inga nya utskick och ingen dubblerad Kotlin-händelse. Om JDBC/RLS inte kan verifieras: stoppa och dokumentera separat adapterbeslut, ingen ägarroll som genväg.

## Avslut och överlämning

Systemet ska lämnas byggbart och testbart. Kör relevanta befintliga kontroller
enligt AGENTS.md; behåll CI-skydd. Uppdatera [status](../status.md) med PR/commit,
ändrat beteende, körda/godkända/misslyckade/ej körda kontroller, begränsningar och
nästa beroende uppgift. Om omfånget växer, skapa en separat uppgiftsfil och
lämna en kort överlämning med beslut, filer, tester och återstående arbete.
