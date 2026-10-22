# M07B: Personliga aktiviteter även utan kallelse

Status: implementerad på `feat/personal-dashboard`; lokal och driftsatt verifiering redovisas i status.
Beroenden: M07A:s befintliga API/sessioner och identifierade läs-/åtkomstregler.
Egen branch från aktuell main; ingen import av gamla testdata.

## Varför och referens

Next-översikten visar relevanta publicerade aktiviteter även innan en kallelse
har skapats/skickats. Kotlin hittar i dag endast aktiviteter som har en kallelse
för en person kontot får företräda. Detta är en kvarvarande funktionslucka,
inte det slutliga urvalet. Läs `src/data/personal-dashboard.ts`, dess tester,
ADR-020, [startsidemålet](../personal-homepage-target.md),
[likvärdighetsplanen](../feature-parity.md) samt arkitektur-/designreglerna.

## Ingår

- Inventera Next-reglerna för datumgiltiga lagmedlemskap och egen lagåtkomst,
  inklusive vilka personkopplingar som får vidga aktivitetslistan. Ledarroll
  eller generellt föreningsmedlemskap ger inte rätt att företräda andra.
- Inför nödvändiga privata Kotlin-tabeller/`*Entity` och repositories med
  Liquibase, inklusive de publicerings- och tidszonsuppgifter urvalet behöver.
  Återanvänd gemensam runtime-dataroll. Bevara datumgiltighet i föreningens
  lokala kalender, inte UTC-datum eller godtyckliga 24-timmarsintervall.
- Låt aktivitetsurvalet förena kallelser och behöriga lagrelationer utan
  dubbletter. Orelaterade, utkastade, inställda och avslutade aktiviteter döljs.
  Nej-svar får inte filtrera bort en aktivitet. Fastställ tidsintervall och
  paginering mot den fullständiga Next-översikten, inklusive behov bortom 90 dagar.
- Separera rätt att läsa aktivitetens metadata från rätt att svara på en
  enskild persons kallelse. Inför/koppla riktiga aktivitetsdetaljer så att en
  legitim rad utan kallelse kan öppnas utan fel eller påhittad kallelse.
- Returnera bara redan skickade kallelser för personer kontot faktiskt får
  företräda. Lagåtkomst får inte öppna andra deltagares svar eller kommentarer.
  Främmande direktlänk ger fortsatt ingen utökad rätt.
- Återanvänd produktionskomponenterna på startsidan och `/components`. Visa
  aktivitet utan kallelse, ej utskickad kallelse och skickade personliga svar.
  Returnera berörda personer separat från deras eventuella kallelser så att
  exempelvis två personer får två namngivna rader med Ingen kallelse ännu.
  En tom `invitations`-lista ensam räcker inte för referensens personrader.

## Acceptans

Lokala PostgreSQL/HTTP-tester ska täcka egna och delegerade personer, flera
föreningar, start-/slutdatum för medlemskap, klubbens tidszon och dygnsgräns,
dubbletter från flera åtkomstvägar, nekade främmande personer och återkallning.
Verifiera att rader utan kallelse saknar svarsknappar, att detaljer kan öppnas
samt att kallelsesvar fortfarande kontrolleras separat och servermässigt.
Generera kontraktet från Spring och kör relevanta backend-/frontend-/browserprov.
Redovisa verkligt driftprov separat med exakt release/deployment.

## Därefter

Behöver svar, kalender och rollgenvägar enligt
[startsidemålet](../personal-homepage-target.md) ingår nu i leveransen nedan. Arbetspass,
extern notifiering, AI/MCP och fullständig administration följer enligt
funktionsmatrisen. M11:s bokningsbehörighet får
inte ersättas med en allmän lag-/personrelation. Aktivitetsskapande, serier och
import är separata uppgifter; denna läsleverans stänger inte M09 eller M13.

## Levererad implementation

Migration 011 och `PersonalOverviewService` inför datumgiltiga medlemskap,
egen lagåtkomst, föreningsroller och lokala tider. `GET /api/me/overview` ger
hela det behöriga kommande urvalet och separata personrader med valfri skickad
kallelse. `GET /api/activities/{id}` ger detaljer även utan kallelse. Ett nej-svar
döljer inte aktivitet; delegerad åtkomst ärver inte personens fristående lagåtkomst.

`PersonalHome`, `PersonalOverview` och `TeamCalendar` delas med Next. Denna
leverans innehåller också Behöver svar, Agenda/Kalender, personligt filtrerade
förenings-/lagvyer och rollgenvägar. Samma kallelse har gemensamt skrivlås och
bekräftat tillstånd i båda sektionerna. Mer än 20 000 aktiviteter ger 503 i
stället för ofullständiga räknare; äldre API behålls för kompatibilitet.
Arbetspass, extern push och AI/MCP samt fullständig administration återstår
utanför denna personliga läsleverans. Inga nya molndata skapas automatiskt.
