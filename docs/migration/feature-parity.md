# Funktionell likvärdighet med Next-appen

Användarbeslut 2026-10-22: när migreringen är klar ska Kotlin-webben ha samma
funktionalitet som den befintliga Next-appen. En fungerande pilot för ett flöde
är inte en färdig migrering. Inventeringen i [inventory](inventory.md) och
befintlig kod/tester är referens; nya upptäckta funktioner läggs till här.
Backendens personåtkomst förblir generell enligt ADR-020.

Användarens mobilbilder fastställer [startsidemålet](personal-homepage-target.md):
Min översikt, Behöver svar, Agenda/Kalender, Kommande aktiviteter samt Mina lag
och föreningar. Samma aktivitet kan visas i båda aktivitetssektionerna, med
separata personrader även utan kallelse. Detaljerade acceptansfall finns i målbilden.

## Nästa leveranser

1. Rätta befintlig startsida: aktivitetslista med varje behörig persons skickade
   kallelse, aktuellt svar och direkt klickbara svar. Bevara kommentarer,
   sessionskontroller, fel per person och navigering utan dokumentomladdning.
2. [M07B](tasks/m07b-personal-activity-scope.md): utöka aktivitetsurvalet med datumgiltiga lagmedlemskap och egen lagåtkomst.
   Visa publicerade aktiviteter även utan kallelse; en läsrätt ger inte svarsrätt
   för andra personer. Migrera nödvändiga medlemskaps-/publiceringsmodeller först.
3. Slutför startsidans aktivitetssammanhang: riktiga detaljer, plats, samling,
   föreningstidszon, Behöver svar över hela urvalet, kalender och lag/föreningar.
   Bokade arbetsuppgifter läggs till tillsammans med M11:s behörighetsmodell.
4. Fortsätt med funktionerna i matrisen. Dela stora områden i egna små uppgifter;
   aktivitetsskapande, serier och import är separata leveranser. M06/M22G:s
   leverans- och driftgrindar behövs fortfarande för notifieringar och pilot.

## Funktionsmatris

Status nedan beskriver kod, inte verifierad produktionsdrift. ”Delvis” innebär
att motsvarande område i Next fortfarande innehåller funktioner som ska flyttas.

| Område | Referens i Next | Kotlin-webb och återstående funktioner | Plan |
| --- | --- | --- | --- |
| Personlig aktivitetslista och kallelsesvar | `src/data/personal-dashboard.ts`, `PersonalOverview`, `OverviewInvitationResponse` | Delvis: kallelsekopplad lista och svar. Denna uppföljning lägger skickade kallelser och direktsvar på startsidan. Aktiviteter utan kallelse via medlemskap/lagåtkomst återstår. | M07A och nästa leverans ovan |
| Komplett personlig översikt | `PersonalDashboard`, `src/data/personal-dashboard.ts` | Återstår: fullständigt urval, Behöver svar, kalender, lokala tider, aktivitetens detaljer samt Mina lag och föreningar. | Uppföljning M07A/M18B |
| Konto och personkopplingar | `src/app/login`, `profile`, `setup`, `passkey/setup`, `connect` | Delvis: lösenords-/passkey-login, logout och serversessioner. Profil, kontouppsättning, registrering av passkeys och övriga kontoflöden ska inventeras och flyttas. | M03 samt egna följduppgifter |
| Medlemskap och ansökningar | `src/lib/membership`, `src/app/o/[organizationSlug]/join`, ansöknings-/inbjudningsrutter | Återstår: ansökan, verifiering, inbjudan, granskning, medlemskap och person-/lagkopplingars datumgiltighet. | M04 samt egna följduppgifter |
| Förenings-, sektions- och lagvyer | `src/data/team-dashboard.ts`, `src/data/general-workspace.ts`, `src/app/o` | Återstår: arbetsytor, medlemslistor, undergrupper och roller, med separata läs-/skrivgränser. | M04/M18B samt egna följduppgifter |
| Aktiviteter, serier, import och närvaro | `src/app/api/activities`, `src/app/api/activity-series`, `src/lib/activity-time-rules.ts` | Delvis: kallelseläsning och svar. Skapa/ändra/inställ, deltagare, plats/tider, serier/import, historik och närvaro återstår. | M09; egna uppgifter för serier/import/närvaro |
| Arbetspass | `src/lib/activity-duty-schedule.ts`, `src/lib/duty-fairness.ts` | Återstår: passplatser, bokning, ändringsförslag, revisioner, låsta genomförda pass och visning i översikten. | M11 |
| Kallelseleverans och notifieringar | `src/lib/email`, Telegram-/WhatsApp-/pushintegrationer, `public/sw.js` | Återstår: verksamhetens schemalagda leverans, kanalernas koppling/svar, påminnelser och återhämtning. Teknikprov räknas inte som migrerad verksamhetsfunktion. | M06/M10/M14/M15A/M15B/M22G |
| Discipliner och förval | `src/disciplines`, `src/lib/disciplines`, aktivitetstyper/-inställningar | Återstår: disciplinpaket, sektionsarv, aktivitetsförval och signaler. | Egna följduppgifter |
| Assistent, minne och MCP | `src/lib/ai`, `src/app/api/ai`, `docs/mcp.md`, `docs/assistant-memory.md` | Återstår: befintliga läs-/skrivverktyg, bekräftelser, minnesarv, OAuth/samtycke och MCP-flöden. M16:s första läsfall ersätter inte resten. | M16 samt egna följduppgifter |
| Administration | `src/app/system`, förenings-/sektionsadministration och administratörsinbjudningar | Återstår: plattformens och föreningarnas administration med skilda rollgränser, skyddad radering och historik. | M04 samt egna följduppgifter |
| Publika sidor och PWA | Publika förenings-/lagsidor, `public/sw.js`, befintlig renderingsstrategi | Återstår: publik fallback/rendering, installation, uppdatering, djuplänkar och funktioner utan privat offlinecache. Pilotens interna navigering är inte hela PWA-flödet. | M17/M18B |

## Klart betyder verifierat beteende

För varje del ska PR/status ange motsvarande Next-flöde, vad som nu är flyttat,
vad som saknas och bevis från lokala tester respektive driftsatt browserflöde.
Återanvänd gemensamma UI-komponenter och befintliga regressioner. Verifiera egen
och delegerad åtkomst, främmande organisation/person, kontoändring, återkallning,
laddning/fel, verkligt sparat resultat efter återbesök och mobil/tangentbord.

Ingen funktion får tyst tas bort för att slutföra migreringen. Ändrad
produktomfattning kräver ett uttryckligt användarbeslut. Gamla lösningen och
resurser avvecklas först när matrisens samtliga aktuella flöden är verifierade
i målmiljön och relevanta säkerhets-/driftgrindar är godkända (M13/M19).
