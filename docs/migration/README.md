# Stegvis migrering till Kotlin på Vercel och Supabase

**2026-10-21:** Kotlin-koden är samlad direkt i `backend/` enligt
[ADR-019](decisions.md#adr-019-en-kotlin-kodbas-direkt-i-backend).
M21/M22-probets kod, skript och deployfiler är borttagna. Dokumenterade
provresultat och evidens bevaras; äldre provkommandon/källsökvägar gäller
historiska revisioner och beskriver inte körbar kod i dagens repo.

Inventeringsbas: `c379a96719490bc4edbfcb0a4ee7a1947684ddce` på `main`.
Datum: 2026-10-18. Detta är första dokumentationsleveransen, inte en genomförd
backend- eller dataflytt. Befintliga instruktioner i [AGENTS.md](../../AGENTS.md)
och säkerhetskrav gäller även kommande uppgifter.

## Dataroll och Kotlin-regler, 2026-10-21

På `fix/activity-overview-migration` inför migration 010 gemensamma datarättigheter
och förval för framtida owner-skapade tabeller. Runtime saknar DDL/ägarrätt och
åtkomst till Liquibase-metadata; modellen verifieras en gång efter Liquibase. Löpande DB-health kontrollerar endast anslutningen.
Owner kör korta migreringar före HTTP vid backendstart enligt ADR-023;
stora dataflyttar körs separat. Se ADR-021 för datarollen.

ADR-022 och AGENTS.md styr standardundantag och `*Entity`-namn för tabellklasser.
Aktuell målmiljökontroll visade bara steg 001–008 och saknad team-läsrätt, vilket
förklarar felet i Mina aktiviteter. Användaren har valt endast kod/PR: ingen
målmiljömigration körs här. [Status](status.md) skiljer lokal verifiering från drift.

## Aktuell uppföljning 2026-10-21

På `feat/my-activities` införs **Mina aktiviteter** med generell personåtkomst
enligt ADR-020 och [M07A](tasks/m07a-activity-overview.md). Backend använder
`PersonAccessService`; `guardian` är ett underlag för delegerad åtkomst, inte en
allmän familjebehörighet. Startsidan hittar kallelsekopplade aktiviteter utan
förvalt test-ID. Runtime behöver separat migration 009. Native-/driftprov och
full signalworker återstår; äldre M21/M22-kod är borttagen, inte en worker som
kan aktiveras i verksamheten. Se [aktuell status](status.md).

## Full funktionalitet efter migrering, 2026-10-22

Målet är samma funktionalitet som Next-appen, enligt användarens instruktion.
[Funktionell likvärdighet](feature-parity.md) samlar kvarvarande områden och
ordningen: rätta direkta kallelsesvar på befintlig startsida, därefter aktiviteter
via lagmedlemskap utan kallelse och fullständig personlig översikt. En pilot
stänger inte ett helt område och ingen befintlig funktion tas bort utan beslut.

## Implementering av Min översikt, 2026-10-22

På `feat/personal-dashboard` implementeras startsidan med delat innehåll för
Next och Vite, nytt personligt översikts-API och metadata för läsbara detaljer.
Migration 011 inför medlemskap, egen lagåtkomst och föreningsroller. Underlaget
omfattar aktiviteter utan kallelse och personrader utan svarsknappar, inte bara
det äldre pilot-API:t. Räknare, kalender och Behöver svar använder samma kompletta
snapshot. Rollgenvägar och personligt filtrerade förenings-/lagvyer ingår.
[Status](status.md) skiljer lokala tester från återstående driftacceptans.
Arbetspass, notifieringsleverans och AI/MCP har fortsatt egna uppgifter.

## Aktuell planeringsinriktning

**2026-10-19:** användaren har beslutat om ren start utan gamla testdata.
[ADR-010](decisions.md) ersätter den tidigare övergången via gamla databasen.
Första verksamhets-API:t finns i `backend`; [leveransen](first-flow.md)
skiljer implementerad API-del från återstående UI-/Auth-/driftaktivering.

Behåll Supabase som PostgreSQL-värd och Auth-leverantör under backendmigreringen.
Cloud SQL är ett senare alternativ, inte ett villkor för att flytta backend.
Verksamhetskoden använder Spring Data JDBC-repositories enligt ADR-011, Liquibase
och portabla PostgreSQL-objekt. Behörigheten för det privata API:t ligger i
Kotlin enligt ADR-012, utan RLS;
befintliga Supabase-beroenden ersätts stegvis med bevarad säkerhet.
Se ADR-008 i [besluten](decisions.md). Ingen databasflytt eller ny databasinstans
ska beställas inom nästa implementationssteg.

PR #97–104 är mergade. M21/M22 har verifierat isolerade Vercel-prov och
[M22A](m22-scheduler-results.md) dokumenterar verklig Supabase Cron-väckning.
[M22B](m22-isolation-results.md) skiljer avstängt Data API från SQL-kontonas
pg_net-rättigheter; JDBC och avstängt Data API behålls i Kotlin-testprojektet.
[M22C](m22-crash-results.md) verifierar schemalagt återtag efter två verkliga
JVM-krascher; testet är godkänt och slutlig radrensning verifierades i M22E.
[M22D](m22-registry-results.md) begränsar worker-materialisering och verifierar
backlog lokalt. [M22E](m22-load-cost-results.md) dokumenterar nu last, anslutningar och
[kostnad för en förening](m22-costs.md); M22C:s städning är avslutad.
Supabase Cron är huvudspår, inte ett krav på Vercel Pro. M22F har genomfört lokala kapacitetsprov; M22G beskriver
återstående driftgrindar före pilot.
ADR-009 fastställer Vercel + Supabase som aktuell inriktning. Google Cloud-
kopplingar utvärderas först om ett konkret hinder dokumenteras i denna lösning;
M08, M12 och M18C är vilande alternativ, inte pilotberoenden.
[M22F](m22-recovery-results.md) verifierar lokal, begränsad dränering över flera
batcher; M22G är nästa verifiering av Vercel-/Supabase-driftgrindar.
Teknikproven verifierar delar av M01/M02/M06. Därefter följer M02/M03/M04,
svarstjänsten och M07:s kompletta kallelsesvar. M20 tar bort kvarvarande
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
