# Målbild: Min översikt

Användarens tre mobilbilder, lämnade 2026-10-22, är visuell och funktionell
referens för den migrerade startsidan. De visar Next-appens personliga översikt.
Detta är acceptanskrav; dokumentet innebär inte att funktionerna redan finns i
Kotlin-webben. Se [funktionsmatrisen](feature-parity.md) för återstående flytt.

## Sida och ordning

1. Gemensam header med Förena-logotyp, notiser och meny, kvar vid scroll. Intern navigering ska
   behålla dokumentet och sidskalet. Notisknappen ska kopplas till det verkliga
   notifieringsflödet när detta migrerats; en overksam knapp uppfyller inte målet.
2. Ögonbryn **FÖRENA · PERSONLIGT**, rubrik **Min översikt** och ingress
   **Din och barnens vardag – alla lag och föreningar på samma plats.**
3. Den hopfällbara sektionen **Behöver svar**, med antal berörda aktiviteter.
4. Växling **Agenda / Kalender**, med agenda som grundläge på mobil.
5. Den hopfällbara sektionen **Kommande aktiviteter**, med antal aktiviteter.
6. **Mina lag och föreningar**, grupperat per förening och lag med användarens
   faktiska roller och klickbara länkar till motsvarande arbetsyta.
7. Gemensam sidfot med Förena-texten, **Anslut AI** och **Källkod**. AI-länken
   ska leda till det migrerade anslutningsflödet, med dess verkliga behörigheter.

Följ referensens serifrubriker, färger, luft, kort och tydliga svarsknappar
med projektets gemensamma designtokens och typsnitt.

Bildernas antal 1 och 17, person-/föreningsnamn, roller och aktiviteter är
exempeldata. Räknare och innehåll ska hämtas för det inloggade kontot.

## Aktiviteter och personrader

- Ett kort per aktivitet inom respektive sektion, med förening/lag, datumbricka
  med veckodag/dag, rubrik, lokal tid och plats. Samling visas enligt Next-
  appens befintliga tidsregler. Klick på rubrik/detaljlänk öppnar aktiviteten.
- Under kortets aktivitetsdel visas en rad per berörd person, med initialavatar
  och namn. Två personer i samma aktivitet är två personrader i samma kort.
- Finns ingen skickad kallelse visas **Ingen kallelse ännu**, utan svarsknappar.
  Det gäller både när kallelseraden saknas och när utskicket ännu ligger i framtiden.
  Personraden kräver därför egen information om deltagaren/lagrelationen; den
  får inte försvinna bara för att API:t inte returnerar någon kallelse.
- En skickad kallelse visar aktuellt svar, exempelvis **Ej svarat**, och direkt
  klickbara **Kommer / Kan ej**. Varje knapp påverkar enbart den personens
  kallelse. Sparfel och väntande tillstånd avgränsas till den raden. Snabbsvar
  bevarar kommentaren; kommentaren kan redigeras i aktivitetsdetaljerna.
- Kort med obesvarad skickad kallelse markeras med den orange kanten från
  referensen. Vald svarsknapp får tydlig markering. Namn ska radbrytas och
  tryckytor ska rymmas vid telefonbredd, som i den gemensamma Next-komponenten.

## Sektioner, räknare och kalender

**Behöver svar** är ett urval ur hela den behöriga aktivitetsmängden. En
aktivitet med två obesvarade personkallelser räknas en gång. När ett svar sparats
uppdateras personraden och sektionens urval/antal från bekräftat tillstånd.
Aktiviteten ligger kvar där så länge en annan relevant person behöver svara.

**Kommande aktiviteter** visar hela det relevanta urvalet, även aktiviteter
utan kallelse och aktiviteter med nej-svar. En aktivitet som behöver svar finns
också kvar här. Samma aktivitet får alltså förekomma i båda sektionerna, men
bara en gång per sektion. Ett sparat svar ska synas i båda representationerna.

Räknarna och Behöver svar får inte härledas enbart från den första hämtade
50-posterssidan. Paginering/filtrering ska ge korrekt antal och urval över hela
kontots översikt. Tidsintervall, tomma lägen och laddnings-/felhantering ska
bevara Next-flödets funktion; pilotens 90-dagarsgräns är inte ett beslut om
slutlig produktomfattning.

Agenda och kalender använder samma behöriga aktivitetsunderlag över alla
föreningar och lag, med konsekvent svarsläge efter växling. Agendan och
aktivitetsdetaljer visar föreningens lokala tid; familjekalendern visar
uttryckligen svensk tid enligt befintliga designregler.

## Mina lag och föreningar

Föreningskortet visar föreningsnamn och föreningsroller, även utan lagroll.
Lag visas under sin förening med namn, länk och relevanta rolletiketter,
exempelvis Målsman, Ledare och Lagåtkomst. Etiketterna beskriver användarens
verkliga relation/behörighet. En ledarroll ger inte automatiskt rätt att svara
för andra personer. Backend använder generell personåtkomst enligt ADR-020;
produktens ordval om barn/familj ändrar inte behörighetsmodellen.

## Återanvändning och acceptans

Återanvänd `PersonalDashboard`, `PersonalOverview`, `OverviewInvitationResponse`,
kalender och gemensam header/meny/sidfot där deras gränssnitt kan anslutas till
Kotlin-kontraktet. Domänregler och åtkomst ska ligga i Kotlin, inte flyttas till
browsern för att få gränssnittet att likna bilderna. Ändrade produktionsvarianter
ska samtidigt finnas på `/components`.

Verifiera särskilt med två personer på samma aktivitet: en obesvarad aktivitet
syns i båda sektionerna men räknas en gång i varje; ett svar påverkar rätt person
och båda vyerna; när alla svarat försvinner aktiviteten bara från Behöver svar.
Verifiera även en aktivitet utan kallelse med två namngivna personrader, flera
föreningar/roller, fler än 50 aktiviteter, agenda/kalender, återkallad åtkomst,
omladdning och tangentbord. Granska 320/375/390/768 px och desktop utan
horisontell scroll. Avslut kräver ett inloggat målmiljöprov knutet till release.
