# Stegvis migrering till Kotlin och Google Cloud

Inventeringsbas: `c379a96719490bc4edbfcb0a4ee7a1947684ddce` på `main`.
Datum: 2026-10-18. Detta är första dokumentationsleveransen, inte en genomförd
backend- eller dataflytt. Befintliga instruktioner i [AGENTS.md](../../AGENTS.md)
och säkerhetskrav gäller även kommande uppgifter.

## Aktuell planeringsinriktning

Behåll Supabase som PostgreSQL-värd och Auth-leverantör under backendmigreringen.
Cloud SQL är ett senare alternativ, inte ett villkor för att flytta backend.
Verksamhetskoden använder JDBC, Liquibase och portabla PostgreSQL-objekt;
befintliga Supabase-beroenden ersätts stegvis med bevarad säkerhet.
Se ADR-008 i [besluten](decisions.md). Ingen databasflytt eller ny databasinstans
ska beställas inom nästa implementationssteg.

PR #97–103 är mergade. M21/M22 har verifierat isolerade Vercel-prov och
[M22A](m22-scheduler-results.md) dokumenterar verklig Supabase Cron-väckning.
[M22B](m22-isolation-results.md) skiljer avstängt Data API från SQL-kontonas
pg_net-rättigheter; JDBC och avstängt Data API behålls i Kotlin-testprojektet.
[M22C](m22-crash-results.md) verifierar schemalagt återtag efter två verkliga
JVM-krascher; testet är godkänt och slutlig radrensning verifierades i M22E.
[M22D](m22-registry-results.md) begränsar worker-materialisering och verifierar
backlog lokalt. [M22E](m22-load-cost-results.md) dokumenterar nu last, anslutningar och
[kostnad för en förening](m22-costs.md); M22C:s städning är avslutad.
Supabase Cron är huvudspår, inte ett krav på Vercel Pro. M22F/G beskriver
återstående kapacitets- och driftgrindar före pilot.
ADR-009 lämnar hostingvalet öppet tills säkerhets-, registry-, last- och
kostnadsgränserna är hanterade. Teknikproven verifierar delar av M01/M02/M06. Därefter följer
M02/M03/M04, svarstjänsten och M07:s kompletta kallelsesvar. M08 verifierar
Cloud Run → Supabase innan drift aktiveras. M20 tar bort kvarvarande
Supabase-specifika verksamhetsberoenden när motsvarande flöden har flyttats.

## Läsordning och gemensamt underlag

1. [Status och ordning](status.md).
2. [Verifierat nuläge](inventory.md) och [SQL-referenser](sql-references.tsv).
3. [Verktygskedja och kompatibilitet](versions.md).
4. [Arkitekturbeslut](decisions.md).
5. [Första kompletta flödet](first-flow.md).
6. [Kostnader, regioner och providerstöd](costs-and-regions.md).
7. Den självständiga uppgiften under [tasks](tasks/README.md).

Dokumenten skiljer källkodsverifierat beteende från målbeslut, förslag och
öppna frågor. Befintliga arkitekturtexter innehåller även mål och historiska
uppgifter; de är inte i sig bevis för att en funktion fungerar i produktion.

## Leveransprincip

En uppgift motsvarar normalt en liten PR från aktuell `main` till `main`.
Beroenden ska vara mergade före nästa implementationsbranch skapas. Ingen
långlivad migreringsbranch och inga staplade PR-baser. Dokumenterade uppgifter
är inte skapade GitHub Issues eller startade Codex-sessioner.

Första PR omfattar endast denna inventering och plan samt länkar från repots
huvuddokument. Börja därefter med M01, inte med att flytta frontendkatalogen.
Lås inga overifierade beroendeversioner som om kompatibiliteten vore fastställd.

Vid varje avslut uppdateras status med commit/PR, ändrat beteende, exakt körda
kontroller, begränsningar och nästa beroende uppgift. Om arbetet växer ska PR:n
avslutas i byggbart skick och återstoden få en ny uppgift med en överlämning:
beslut, filer, verifiering, kvarstående arbete och beroenden.
