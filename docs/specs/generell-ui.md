# Generell UI – påminnelse om ny frontendversion

- Status: Utkast
- Senast uppdaterad: 2026-11-03
- Berörda dokument: [Designregler](../design-spec.md#ny-appversion),
  [versionskontroll i öppna sidor](../architecture.md#versionskontroll-i-öppna-sidor)
- Implementation och verifiering: Befintlig versionsnotis finns i Next.
  Tilläggen i denna spec är inte implementerade eller funktionellt verifierade.

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
- Implementation genom denna specbeställning.

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

Befintlig Next-kod jämför klientens inbäddade bygg-ID med
`/app-version.json`. `AppUpdateNotice` erbjuder redan full omladdning av
aktuell adress, men saknar stängning och återkommande påminnelse. Monitorn
stannar när den upptäckt en avvikande version; återkommande påminnelser
behöver därför hanteras vid implementationen.

Befintliga designregler för versionsnotisen gäller fortsatt: gemensam
komponent under sidhuvudet, mobilanpassning, statusannonsering utan
fokusförflyttning och ingen automatisk avbrytning av formulär. Nya tillstånd
och åtgärder ska representeras på `/components` enligt designreglerna.
Specen inför inga nya verksamhetsdata eller behörigheter. Hantering av
väntetid mellan flikar och återbesök är ännu inte beslutad.

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
  användaren föreslog en timme. En timme används i utkastet.
- 2026-11-03, svar 3: Det räcker med påminnelse för ny frontendversion.
  Tvingande uppdateringar kopplade till backend valdes bort.
- 2026-11-03: Specen ska följa repoets övriga specar och sparas som
  Markdown under `docs/specs/`.

## Obekräftade antaganden och förslag

- Behåll befintlig text ”En ny version av Förena finns.” och ”Ladda om”.
- Följ befintlig placering under sidhuvudet även för den stängbara popupen.
- Hantera osparade ändringar innan användarinitierad omladdning. Detta
  lades tidigare till av assistenten och är inte ett bekräftat produktkrav.

## Öppna frågor

- Ska en timmes väntetid bestå vid återbesök och delas mellan flikar?
  Detta påverkar påminnelsebeteendet och behöver avgöras före Redo.
- Krävs särskild varning för osparade ändringar vid vald omladdning,
  eller räcker befintligt beteende? Behöver avgöras före Redo.
- Slutlig sammanfattning, inklusive entimmesintervallet, återstår att bekräfta.

## Bekräftelse

Enskilda svar och avgränsningar är sparade från dialogen 2026-11-03.
Slutlig sammanfattning är ännu inte bekräftad. Status är Utkast enligt
grill-me-flödet; implementation är inte beställd genom specdialogen.

## Ändringshistorik

- 2026-11-03: Sparat dialogens beslut i repoets specmall, med stabila
  krav-ID:n och kopplade acceptanskriterier. Rättat tidigare felaktig
  placering i en ChatGPT Page och skilt befintligt beteende från nya krav.
