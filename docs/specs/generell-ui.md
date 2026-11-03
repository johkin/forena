# Generell UI – påminnelse om ny frontendversion

- Status: Redo
- Senast uppdaterad: 2026-11-03
- Berörda dokument: [Designregler](../design-spec.md#ny-appversion),
  [versionskontroll i öppna sidor](../architecture.md#versionskontroll-i-öppna-sidor)
- Implementation och verifiering: Gemensam versionsnotis med stängning och
  entimmespåminnelse implementerad och verifierad för Next och React/Vite.
  Alla 1 244 enhetstester, typkontroll, lint och båda produktionsbyggena
  passerar. Browserflödet har verifierats mot lokala produktionsbyggen med
  simulerade versionssvar på 320, 390 och 1 280 px. Ingen driftsättning ingår.

## Problem och mål

Den som har sajten öppen ska uppmärksammas när en ny frontendversion har
driftsatts och kunna välja att ladda om. Om användaren vill fortsätta arbeta
ska påminnelsen kunna stängas och återkomma efter en timme.

## Omfattning

### Ingår

- En liten gemensam popup för ny frontendversion.
- Frivillig omladdning och möjlighet att stänga popupen.
- Påminnelse igen efter en timme om användaren inte har laddat den nya versionen.

### Ingår inte

- Tvingande omladdning eller blockering av fortsatt användning.
- Separat påminnelse utlöst enbart av en backenduppdatering.
- Delad väntetid mellan flikar eller beständig väntetid vid återbesök.
- Ny särskild varning om osparade ändringar vid vald omladdning.

## Användare, roller och flöden

Påminnelsen hör till det gemensamma gränssnittet, utan någon ny behörighet.
När en ny frontendversion upptäcks visas popupen. Användaren kan ladda om
sajten eller stänga popupen och fortsätta. Efter en timme återkommer
påminnelsen om den nya versionen fortfarande inte har laddats.

## Krav

- K-001: När en ny frontendversion har driftsatts och finns tillgänglig ska
  användare med en tidigare version få en liten popup som informerar om detta.
- K-002: Popupen ska erbjuda en åtgärd för att ladda om sajten och hämta den
  aktuella frontendversionen.
- K-003: Användaren ska kunna stänga popupen utan omladdning och fortsätta
  använda sajten.
- K-004: Efter stängning ska påminnelsen återkomma efter en timme om
  användaren fortfarande kör en tidigare frontendversion. Ny stängning
  startar en ny timmes väntetid; under väntetiden ska popupen vara dold.
- K-005: När aktuell frontendversion har laddats ska påminnelsen upphöra
  tills ytterligare en frontendversion finns tillgänglig.
- K-006: Sajten får inte automatiskt ladda om eller kräva omladdning för
  fortsatt användning. Enbart en backenduppdatering ska inte utlösa popupen.

## Data, integrationer och kvalitetskrav

Next jämför klientens inbäddade bygg-ID med `/app-version.json`.
React/Vite använder sitt frontend-ID från startkonfigurationen. Båda använder
samma `AppUpdateNotice` och monitor. Monitorn stannar efter upptäckt av en
avvikande version. Stängning sparar en tidsgräns i komponentens lokala tillstånd
och startar en separat timer på en timme. Återgång till fliken kontrollerar också
tidsgränsen, eftersom bakgrundsflikar kan pausa timers. Avmontering städar timers
och lyssnare. Ingen localStorage, sessionStorage eller fliksynkronisering används.

Befintliga designregler för versionsnotisen gäller fortsatt: gemensam
komponent under sidhuvudet, mobilanpassning, statusannonsering utan
fokusförflyttning och ingen automatisk avbrytning av formulär. Nya tillstånd
och åtgärder ska representeras på `/components` enligt designreglerna.
Specen inför inga nya verksamhetsdata eller behörigheter. Väntetiden gäller
endast aktuell öppen flik och bevaras vid navigation utan full sidladdning,
men inte vid en full omladdning eller ett återbesök.

## Acceptanskriterier

- AK-001 (K-001): Givet en öppen sida med tidigare frontendversion, när
  en ny driftsatt frontendversion upptäcks, ska en liten versionspopup visas.
- AK-002 (K-002, K-005): När användaren väljer omladdning ska aktuell
  frontendversion hämtas och popupen för den tidigare versionen upphöra.
- AK-003 (K-003, K-006): När användaren stänger popupen ska sidan vara kvar
  utan omladdning och fortsatt användning vara möjlig.
- AK-004 (K-004): Givet en stängd popup och oförändrad äldre klientversion
  ska popupen vara dold före en timme och återkomma efter en timme.
  Om den stängs igen ska nästa påminnelse vänta ytterligare en timme.
- AK-005 (K-005): Givet aktuell klientversion ska ingen popup visas förrän
  ytterligare en frontendversion finns tillgänglig.
- AK-006 (K-006): Givet enbart en backenduppdatering och oförändrad
  frontendversion ska ingen versionspopup visas och ingen omladdning krävas.

## Bekräftade beslut och motiv

- 2026-11-03: Användaren efterfrågade en liten popup vid ny driftsatt
  frontendversion med möjlighet att ladda om sajten.
- 2026-11-03, svar 1: Popupen ska kunna stängas om användaren inte vill ladda om.
- 2026-11-03, svar 2: Påminnelsen ska kunna återkomma efter en tid;
  användaren föreslog en timme. En timme är bekräftad i implementationsdialogen.
- 2026-11-03, svar 3: Det räcker med påminnelse för ny frontendversion.
  Tvingande uppdateringar kopplade till backend valdes bort.
- 2026-11-03: Specen ska följa repoets övriga specar och sparas som
  Markdown under `docs/specs/`.
- 2026-11-03, implementationsdialog: Användaren bekräftade väntetid bara i
  den öppna fliken och befintlig omladdning utan ny varning om osparade ändringar.
  Text, placering och frivillig omladdning behålls enligt befintliga designregler.

## Obekräftade antaganden och förslag

Inga återstående för den beställda omfattningen.

## Öppna frågor

Inga.

## Bekräftelse

Användaren beställde implementation och bekräftade därefter den sammanfattade
lösningen: stängbar popup, ny påminnelse efter en timme endast i aktuell flik,
befintlig omladdning utan extra varning och ingen automatisk omladdning.
Produktkraven är Redo; implementationsverifieringen redovisas separat.

## Verifiering per krav

Gemensam produktionskod: [AppUpdateNotice](../../src/components/app-update-notice.tsx),
[versionsmonitor](../../src/lib/app-version-monitor.ts) och
[komponentexempel](../../src/components/app-update-notice-example.tsx).
Automatiska kontroller:
[enhetstester för notisen](../../src/components/app-update-notice.test.tsx),
[monitortester](../../src/lib/app-version-monitor.test.ts) och
[browsertest](../../scripts/migration/app-update-browser.mjs).

| Krav / acceptanskriterium | Resultat och evidens |
| --- | --- |
| K-001 / AK-001 | Implementerat och verifierat: notis efter ändrat frontend-ID, båda apparna och alla tre skärmbredder. |
| K-002 / AK-002 | Implementerat och verifierat: uttryckligt klick gör full omladdning av aktuell adress inklusive query; notisen försvinner när laddat ID och versionssvaret matchar. Versionssvaren simuleras i browsertestet. |
| K-003 / AK-003 | Implementerat och verifierat: stängning utan omladdning, kvarvarande formulärvärde och fortsatt navigation. |
| K-004 / AK-004 | Implementerat och verifierat: dold vid 59:59.999, synlig vid 60:00.000, samma gräns efter nästa stängning. Även återgång efter pausad timer samt oberoende flikar verifieras. |
| K-005 / AK-005 | Implementerat och verifierat: oförändrat frontend-ID ger ingen notis före eller efter omladdning; avvikande ID utlöser notisen. |
| K-006 / AK-006 | Implementerat och verifierat: ingen automatisk omladdning eller omladdning vid stängning. Oförändrad frontendversion ger ingen notis; monitorn läser enbart frontendens statiska versionsfil och har ingen koppling till backendversion. |

Kör browsertestet med båda produktionsbyggena på port 3000 respektive 3001:
`node scripts/migration/app-update-browser.mjs`. Andra lokala adresser anges med
`FORENA_APP_UPDATE_ORIGINS`; vid behov anges Chromium-sökväg med
`FORENA_BROWSER_EXECUTABLE`. Visuell jämförelse har också gjorts på mobil och desktop.
Nexts vanliga länkar gör fulla sidladdningar; testet använder History API för
Nexts navigation utan omladdning och ordinarie routerlänk i React/Vite.

## Ändringshistorik

- 2026-11-03: Öppna produktfrågor bekräftade och status ändrad till Redo.
  Implementerat stängning, entimmespåminnelse och gemensamt interaktivt exempel
  på `/components` i båda apparna. Verifiering per krav redovisas ovan.
- 2026-11-03: Implementation beställd. Kopplat den gemensamma
  `AppUpdateNotice` till React/Vite-appens frontendversion; Next skickar sitt
  befintliga bygg-ID explicit till samma komponent.
- 2026-11-03: Sparat dialogens beslut i repoets specmall, med stabila
  krav-ID:n och kopplade acceptanskriterier. Rättat tidigare felaktig
  placering i en ChatGPT Page och skilt befintligt beteende från nya krav.
