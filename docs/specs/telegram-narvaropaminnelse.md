# Närvaropåminnelse via Telegram

- Status: Utkast
- Senast uppdaterad: 2026-11-02
- Berörda dokument: [Telegram-boten](telegram-bot.md),
  [närvaroregistrering](narvaroregistrering.md),
  [assistent och Telegram](../migration/assistant-telegram.md)
- Implementation och verifiering: Ej påbörjad

## Problem och mål

Användaren föreslår att efter avslutad aktivitet få en fråga om att registrera
närvaro om den saknas. Målet är att hjälpa ledare att få rapporteringen gjord
utan att själva behöva komma ihåg att starta boten.

## Omfattning

### Ingår

- Utreda automatisk fråga via Telegram efter aktivitetens slut när närvaro saknas.
- Återanvända botens befintliga närvaroflöde för granskning och bekräftelse.

### Ingår inte

- Upprepade automatiska påstötningar efter den första påminnelsen.
- Ytterligare avgränsningar är ännu inte beslutade.

## Användare, roller och flöden

30 minuter efter aktivitetens slut får alla med närvarobehörighet som själva
har anmält att de kommer en privat fråga, om närvaron saknas. Mottagarens eget
ja-svar gäller; ett ja-svar för ett barn eller någon annan kvalificerar inte
kontot som mottagare. Syftet är att undvika att störa ledare som inte deltar.
Förslag: en knapp startar närvarorapporteringen för aktiviteten.

## Krav

- K-001: Påminnelsen ska skickas privat via Telegram 30 minuter efter
  aktivitetens slut, om närvaro saknas helt eller rapporteringen är ofullständig
  och någon person i rapportens personurval fortfarande har okänd närvaro.
- K-002: Endast personer med aktuell `attendance.manage` för aktivitetens lag
  och eget kallelsesvar Kommer för aktiviteten ska få påminnelsen. Behörighet
  utan eget ja-svar räcker inte. Ett ja-svar utan behörighet räcker inte.
- K-003: Högst en automatisk påminnelse ska skickas per aktivitet och mottagare.
  Ingen ytterligare påstötning ska skickas om närvaron fortsätter att saknas.
- K-004: Fullständigt bedömd närvaro ska inte utlösa någon påminnelse.
  Registrerad frånvaro räknas som bedömd närvaro, även om alla är frånvarande.
- Befintlig närvarobehörighet och uttrycklig knappbekräftelse ska fortsatt
  följa Telegram-botens redan beslutade regler.

## Data, integrationer och kvalitetskrav

Kotlin-boten har redan privata närvaroförslag och knappbekräftelse.
Det finns en beständig notifieringsarbetare för kallelser; en automatisk
närvaropåminnelse behöver ett eget underlag och skydd mot dubbla utskick.
Den får inte förväxlas med kallelsesvar eller automatisk kvittens i ledarchatten.

### Föreslaget eventflöde

Som svar på användarens fråga om Modulith föreslås att ett event vid
aktivitetsslut leder till beständig schemaläggning av påminnelsen efter
30 minuter. Fördröjningen ska i förslaget överleva omstart. Före utskick
kontrolleras aktuell närvaro, behörighet, eget ja-svar och tidigare utskick.
Aktivitetsstart behövs inte för denna påminnelse. Eventet initierar en
påminnelse; själva närvaron sparas först efter ledarens uttryckliga bekräftelse.

Detta är ett tekniskt förslag, inte ett implementerat flöde eller ett
bekräftat nytt produktbeslut. Nuvarande Kotlin-kod publicerar
`InvitationNotificationRequested` för kallelsenotifieringar, men har inte
motsvarande start-/slutevent för aktiviteter eller automatisk närvaropåminnelse.

## Acceptanskriterier

- AK-001 (K-001, K-002): Givet saknad närvaro, aktiv Telegram-koppling,
  närvarobehörighet och eget ja-svar ska personen få en privat påminnelse
  30 minuter efter aktivitetens slut.
- AK-002 (K-002): En person utan närvarobehörighet eller med kallelsesvar
  Kan inte eller Ej svarat ska inte få påminnelsen. Ett ja-svar enbart för
  en annan person ska inte räcka.
- AK-003 (K-001): Givet påbörjad rapportering där minst en person i
  rapportens personurval fortfarande har okänd närvaro ska behöriga
  mottagare få påminnelsen enligt samma tids- och mottagarvillkor.
- AK-004 (K-003): Givet att en mottagare redan fått påminnelsen för en
  aktivitet ska senare körningar inte skicka fler påminnelser för samma
  aktivitet till mottagaren, även om rapporteringen fortfarande saknas.
- AK-005 (K-004): Givet fullständigt bedömd närvaro före utskick ska ingen
  påminnelse skickas, även om samtliga personer registrerats som frånvarande.

## Bekräftade beslut och motiv

- 2026-11-02: Användaren föreslog en automatisk fråga efter avslutad aktivitet
  när närvaro saknas, som alternativ eller komplement till `/närvaro`.
- 2026-11-02, svar 1: Alla med närvarobehörighet som har anmält att de kommer
  ska få frågan, så att ledare som inte deltar slipper störas. Svaret gavs på
  förslaget om privat utskick 30 minuter efter aktivitetens slut.
- 2026-11-02, svar 2: Användaren bad att uppdatera specen med de föreslagna
  reglerna: påminn även vid ofullständig rapportering och skicka högst en
  påminnelse per aktivitet och mottagare.
- 2026-11-02, svar 3: Användaren bekräftade sammanfattningen med ”Ja”:
  privat påminnelse efter 30 minuter till närvarobehöriga som själva tackat ja,
  även vid ofullständig rapportering, högst en gång per aktivitet och mottagare.

## Obekräftade antaganden och förslag

- Knapp som startar befintligt närvaroflöde för just aktiviteten.
- Behålla `/närvaro` och `/narvaro` som manuella genvägar.
- Modulith-event vid aktivitetsslut med beständig fördröjning och ny kontroll
  av utskicksvillkoren enligt det föreslagna eventflödet ovan.

## Öppna frågor

- Hur hanteras redan avslutade aktiviteter
  vid aktivering, inställda aktiviteter och ändrade sluttider?
- Är detta ett komplement till den manuella genvägen eller en ersättning?

## Bekräftelse

Sammanfattningen av K-001–K-004 och mottagarvillkoren är bekräftad med ”Ja”
i svar 3 den 2026-11-02. Återstående frågor ovan är inte avgjorda; status är
fortsatt Utkast. Bekräftelsen gäller specens sammanfattade regler och innebär
inte en ny beställning av implementation.

## Ändringshistorik

- 2026-11-02: Sparat användarens bekräftelse av de sammanfattade reglerna.
- 2026-11-02: Dokumenterat förslaget om Modulith-event vid aktivitetsslut
  och beständig fördröjning, separat från bekräftade produktregler.
- 2026-11-02: Sparat regler för ofullständig rapportering, fullständigt
  bedömd närvaro och högst en påminnelse per aktivitet och mottagare.
  Uppdaterat krav, avgränsningar och acceptanskriterier.
- 2026-11-02: Sparat svar 1 med eget ja-svar och närvarobehörighet som
  samtidiga mottagarvillkor, tidpunkt samt verifierbara acceptanskriterier.
- 2026-11-02: Inventerat befintligt Telegram-flöde och sparat förslaget
  samt första frågeomgången. Automatisk påminnelse är inte implementerad.
