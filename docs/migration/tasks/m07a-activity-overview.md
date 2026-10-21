# M07A: Mina aktiviteter i Kotlin-webben

Status: implementerad på `feat/my-activities`, från main `62247c7` (2026-10-21).
Beroenden: befintlig M05/API- och M03-sessionsgrund. Aktuellt browserpilotprov
krävs före driftacceptans. Egen PR från aktuell main, utan beroende av full M07.

## Underlag och avgränsning

Läs [AGENTS.md](../../../AGENTS.md), [status](../status.md),
[första flödet](../first-flow.md), [webbsessioner](../web-sessions.md),
[arkitekturen](../../architecture.md) och [designreglerna](../../design-spec.md).
Kotlin finns i `backend/`, genererat kontrakt i `backend/contract/`, den nya
browserappen i `frontend/` och gemensamma UI-komponenter i `src/components/`.

Piloten kan läsa/svara på kallelser för ett känt aktivitets-ID. Startsidan
behöver kunna hitta kontots aktiviteter i den nya databasen utan konfigurerat
`FORENA_KOTLIN_TEST_ACTIVITY_ID`. Gamla testdata importeras inte enligt ADR-010.

## Ingår

- Definiera ett smalt läskontrakt för kontots aktivitetsöversikt. Fastställ
  urval, tidsintervall, sortering och begränsning/paginering före implementation.
  Returnera den information som behövs för att hitta och öppna kallelsen.
- Kontrollera konto/session, organisation och aktiva personåtkomsttilldelningar i Kotlin
  innan data lämnas ut. Återanvänd M05:s behörighetsregler och repositories;
  ett aktivitets-ID från browsern ger inga rättigheter.
- Generera OpenAPI/TypeScript från Kotlin och koppla frontendens ordinarie
  startsida till API:t, med laddning, tom lista och felhantering. Återanvänd
  gemensamma komponenter och visa ändrade varianter på `/components`.
- Bevara Spring Session JDBC, CSRF-/kontokontroll, no-store och samma origin.
  Teknisk 503 behåller sessionen; ogiltig session döljer privata data.

## Acceptans och verifiering

En användare med egen och delegerad personåtkomst kan logga in, hitta kontots aktiviteter,
öppna en kallelse, svara och läsa samma svar efter omladdning utan förvalt ID.
Andra kontons aktiviteter visas inte; direktlänk ger ingen utökad åtkomst.
Återkallad åtkomst, avstängt konto och logout ger rätt avgränsning utan läckta
listdata. Kontobyte i annan flik får inte visa föregående kontos aktiviteter.

Testa Kotlin-läsning mot riktig lokal PostgreSQL med signerad identitet och
relevanta åtkomstfall; kontrollera genererat kontrakt. Kör app-/backendkontroller
enligt AGENTS.md vid implementation. Browserprov omfattar tomt/laddande/fel,
inloggning → lista → kallelse → svar → omladdning → logout, mobil och desktop.
Redovisa kontrollerad Auth, lokal kedja och verklig målmiljökedja separat.
Driftacceptans kräver resultat knutet till exakt SHA/deployment för aktuell
gemensam frontend/backend-release; health eller schema räcker inte.

## Lämnas till senare och överlämning

Ingen aktivitets-CRUD (M09), full signalworker (M06), kanal, administration,
signup eller dataimport. M07A stänger inte hela M07/M18B. Dokumentera API-urval,
filer, körda kontroller, begränsningar och nästa uppgift i status. Full
signalreaktion och M22G:s driftgrindar återstår inför pilotacceptans.

## Levererat urval och modell

`GET /api/me/activities?offset=0` visar kallelsekopplade, pågående/kommande
aktiviteter med start inom 90 dagar, utan inställda aktiviteter. Sortering är
starttid/UUID, 50/sida, `next_offset` vid fler resultat. Samtidiga ändringar kan
flytta sidor; frontend tar bort dubbletter. Klubb, lag och svensk tid visas.
Ett förvalt prov-ID behövs inte på startsidan; provsidan behåller sitt ID.

Backend använder `PersonAccessService`, `AccessiblePerson`, `MyInvitations`
och `AccessibleInvitation` enligt ADR-020. `self` och `guardian` är oförändrade
underlag för en uttrycklig åtkomsttilldelning; andra relationstyper kräver egna
beslut om rättigheter. Lagmedlemskap utan kallelse, arbetspass och
föreningstidszon saknas ännu i Kotlin-modellen. Separat migration 009 ger
runtime kolumnläsning på team före aktivering. Drift-/native-acceptans och
full M07/M18B återstår; se status för faktiskt körda kontroller.
