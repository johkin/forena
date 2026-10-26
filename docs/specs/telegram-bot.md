# Telegram-boten

- Status: Redo
- Senast uppdaterad: 2026-10-27
- Berörda dokument: [Telegram](../telegram.md), [arkitektur](../architecture.md),
  [säkerhetsarkitektur](../security-architecture.md),
  [AI-assistenten](ai-assistent.md), [M14](../migration/tasks/m14-telegram.md)
- Implementation och verifiering: Ej påbörjad inom denna feature.

## Problem och mål

Importera befintlig Telegram-funktionalitet från Next-appen till React/Kotlin
och bygga vidare på boten. Kallelser är det primära målet. Spelare,
vårdnadshavare och ledare prioriteras lika. Botens primära flöden ska
kunna genomföras privat med knappar, text eller svenska röstmeddelanden.

## Omfattning

### Ingår

- En featurespec för importen och vidareutvecklingen av Telegram-boten.
- Inventering av befintliga flöden som underlag för omfattningsbeslut.
- Hela den befintliga botens funktionalitet som grund: kontokoppling,
  privata kallelser och knappsvar, gruppkoppling och navigation samt
  privata assistentfrågor. Förändringar beslutas uttryckligen.
- Kallelsesvar i vanlig text och privat närvarorapportering.
- Privata röstmeddelanden på svenska, högst 60 sekunder per meddelande,
  med transkribering och textsvar från boten.
- Sammanställning och uttrycklig knappbekräftelse före närvaroregistrering.
- En valfri lagchatt och en valfri ledarchatt per lag, med vägledd
  koppling i lagets inställningar och länkar från webbappen till chattarna.
- Telegram som kanal till den personliga Förena-assistenten, med samma
  sparade minnen men separat samtalshistorik och dialogkontext från webben.

### Ingår inte

Denna spec ändrar inte den redan bekräftade webbassistentspecen.

- Automatiska kvittenser i ledarchatten efter närvaroregistrering skjuts
  uttryckligen upp och ingår inte i första versionen.
- Assistentdialog, rösttolkning och närvaroregistrering i gruppchattar.
- Bekräftelse av aktivitets-, påminnelse- och minnesförslag i Telegram.
- Överföring av pågående närvaroförslag mellan kanaler/enheter.
- Meny i Telegram för återupptagande av tidigare Telegram-dialoger.
- Gruppbaserade avanmälansförslag från exempelvis ”Leona är sjuk”,
  ledarknappar för sådana förslag och automatiska krya-på-hälsningar.

## Användare, roller och flöden

Next-appen stöder privata flöden för spelare, vårdnadshavare och ledare.
Ledare med rättighet att hantera truppen kan koppla lag- och ledarchattar.
Spelare, vårdnadshavare och ledare prioriteras lika; kallelseflödet är
primärt för samtliga målgrupper.

Privat huvudflöde:

1. Användaren kopplar sitt konto genom profilens befintliga samtyckesflöde.
2. En privat kallelse kan besvaras direkt med ordinarie svarsknappar,
   eller genom ett text-/röstmeddelande som boten tolkar till ett förslag.
3. Boten fastställer aktivitet och personer inom aktuell behörighet.
   Vid tvetydighet eller inaktuell kontext ställer den en följdfråga.
4. Användaren granskar berörd klubb, aktivitet, personer och ändringar,
   kan rätta tolkningen och bekräftar med avsedd knapp.
5. Servern kontrollerar behörighet, underlag och förslagets giltighet
   igen och sparar högst en gång. Ändrat underlag kräver ny granskning.
6. Boten bekräftar resultatet privat. Andra assistentförslag hänvisas
   till granskning på webben; inga automatiska närvarokvittenser går till grupp.

Närvaroflödet följer samma granskning men kräver närvarobehörighet och
knappen Registrera närvaro. Kallelsesvar och faktisk närvaro är skilda data.

## Befintligt underlag

Inventerat i källkod och dokumentation vid `a76a711` den 2026-10-26.
Detta är befintligt beteende, inte nya bekräftade produktkrav eller
resultat från körda funktionstester.

- Frivillig kontokoppling från profilen med verifierat konto, samtycke och
  hashat 256-bitars engångsbevis med tio minuters giltighet.
- Privata kallelser per kallad person, inklusive separata meddelanden för
  flera barn. Knappar för Kommer, Kan inte och Öppna Förena. Kommentarer
  hanteras i appen. Sparade svar får kvittenstext och uppdaterade knappar.
- Kontroller av avsändare, aktuell personåtkomst, aktivitetens livscykel,
  återleveranser och gamla svar. Avstängning via profil, `/stop` eller
  blockering; återanslutning återaktiverar inte gamla knappar.
- Leveransordning Telegram → push → e-post i Next-flödet. Begränsning av
  Telegram-trafik och reservleverans finns; motsvarande stöd i målappen
  måste inventeras innan en leveransordning utlovas där.
- Lag- och ledarchattar har verifierad koppling och `/forena` för navigation.
  Grupprollen verifierar inte hela gruppens deltagare. Grupper får inga
  privata kallelser, svar eller AI-dialoger i befintligt flöde.
- Separat aktiverbara privata assistentfrågor återanvänder webbassistentens
  lagfunktionalitet. Varje fråga är fristående. Vid flera lag behövs ett
  entydigt lagval. Förslag hänvisas till webbappen för granskning och åtgärd.
- M14 planerar flytt av koppling, kallelser och knappsvar till gemensamma
  applikationstjänster. Privat assistent kan enligt den äldre planen flyttas
  i en följd-PR. Denna intervju ska precisera den önskade produkten.
- Den godkända AI-assistentspecen kräver återanvändbar verksamhetslogik för
  Telegram, men lämnar kanalens autentisering, kontext och bekräftelseflöden
  till en separat spec. Beständiga samtal och klubbidentiteter är beslutade
  för webbassistenten; Telegrams motsvarande beteende är ännu inte beslutat.
- Dokumentationen anger att live-test med riktig testbot inte har utförts.

Källor: `src/app/api/telegram/webhook/route.ts`, `src/lib/telegram.ts`,
`src/lib/telegram-assistant.ts`, `src/components/telegram-settings.tsx`,
`src/components/telegram-group-settings.tsx`,
`supabase/functions/_shared/telegram.ts` och dokumenten ovan.

## Krav

- K-001: Befintlig Telegram-bot i Next-appen ska vara förlaga för import
  och vidareutveckling. Hela befintliga funktionaliteten ska följa med;
  förändringar beslutas uttryckligen under intervjun.
- K-002: Kallelser ska vara det primära användningsområdet för Telegram-boten.
- K-003: Spelare, vårdnadshavare och ledare ska prioriteras lika.
- K-004: Användare ska kunna svara på kallelser med vanlig text i privat
  chatt. Exempel är ”båda barnen kommer” och ”Stina kan inte på lördag”.
  Aktivitetsval och bekräftelse följer K-012 och K-014.
- K-005: Närvarobehöriga användare ska kunna rapportera faktisk närvaro
  i privat chatt, exempelvis ”alla anmälda på plats förutom Stina”.
  Aktivitetsval och deltagarurval följer K-012 och K-013.
- K-006: Före närvaroregistrering ska boten alltid visa en sammanställning
  av de föreslagna ändringarna och kräva en uttrycklig knappbekräftelse
  med Registrera närvaro. Ingen närvaro sparas genom enbart fritexten.
- K-007: Varje lag ska kunna ha en valfri kopplad lagchatt och en valfri
  kopplad ledarchatt. Vägledd koppling ska finnas i lagets inställningar.
- K-008: Kopplade chattar ska kunna öppnas genom klickbara länkar från
  webbappen. Länken får öppna Telegram i installerad app eller webbläsare
  beroende på användarens enhet; ett särskilt krav på Telegram Web finns
  inte. Privata gruppers inträde följer K-020.
- K-009: Närvaroregistrering ska inte automatiskt skicka kvittenser i
  ledarchatten i första versionen.
- K-010: Boten ska stödja privata röstmeddelanden på svenska i första
  versionen. Högst 60 sekunder per meddelande tillåts, inklusive exakt
  60 sekunder. Längre meddelanden ska avvisas med begriplig hjälp och
  får inte utlösa verksamhetsändringar.
- K-011: Röstmeddelanden ska transkriberas och behandlas med samma
  tolknings-, behörighets- och bekräftelseregler som text. Boten svarar
  med text. Användaren ska kunna se vad boten uppfattat och rätta
  missförstånd, inklusive namn, före bekräftelse. Närvaro kräver alltid
  Registrera närvaro enligt K-006, även vid röstinmatning.
- K-012: Boten ska använda kallelsen som användaren svarar på eller ett
  tidigare uttryckligt aktivitetsval som aktivitetskontext. Om flera
  aktiviteter fortfarande är möjliga ska boten fråga innan ett förslag
  tas fram. Tidigare kontext ska verifieras mot aktuell behörighet.
- K-013: ”Alla anmälda på plats förutom Stina” ska betyda att de som
  svarat Kommer markeras närvarande, med Stina som uttryckligt undantag
  markerad frånvarande. Övriga deltagare lämnas oförändrade.
  Berörda personer ska visas före bekräftelse. Tvetydiga namn och
  undantag som inte motsvarar deltagare ska hanteras enligt K-015.
- K-014: Kallelsesvar som tolkas från text eller röst ska alltid visas
  för granskning och kräva en uttrycklig bekräftelseknapp före sparande.
  De befintliga knapparna Kommer och Kan inte får fortsatt spara direkt.
- K-015: Om ett namn är tvetydigt eller saknas bland aktivitetens
  deltagare ska boten fråga och visa behöriga möjliga personer innan
  den går vidare. Boten får inte gissa eller spara ett partiellt resultat
  medan personvalet är oklart.
- K-016: Boten ska kunna föreslå rättning av redan registrerad närvaro.
  Granskningen ska tydligt visa tidigare och föreslaget värde, exempelvis
  ”Stina: närvarande → frånvarande”, och kräva samma knappbekräftelse.
  Ändras relevant underlag före knapptrycket ska förslaget granskas på
  nytt. Aktuell behörighet ska kontrolleras vid sparandet.
- K-017: Den privata Telegram-chatten ska vara ytterligare en kanal till
  användarens personliga Förena-assistent. Samma kontobundna personliga
  minnen och behörighetsstyrda minnen för klubb, sektion och lag ska
  användas i webb och Telegram. Klubbavgränsning och minnesbekräftelse
  följer AI-assistentspecen; kanalval ger ingen ytterligare behörighet.
- K-018: Telegram ska behålla dialogkontext mellan meddelanden, inklusive
  uttryckligt vald aktivitet och följdfrågor. Telegrams samtalshistorik
  och dialogkontext ska vara fristående från webbens. Val, återupptagande
  eller nystart av webbsamtal får inte byta Telegrams kontext, och omvänt.
  Sparade minnen är fortsatt gemensamma enligt K-017. Klubbarnas egna
  samtal ska hållas åtskilda enligt AI-assistentspecen. Förslag i Telegram
  ska före bekräftelse tydligt visa berörd klubb och aktivitet. Aktiva
  närvaroförslag behöver inte kunna överföras mellan kanaler/enheter.
- K-019: Nytt samtal ska starta ett nytt samtal i den aktuella kanalen
  utan att radera tidigare samtal eller sparade minnen eller ändra den
  andra kanalens aktiva dialogkontext.
  Radering av samtal i Förena ska ta bort den sparade dialogen där.
  Telegrams meddelandekopior hanteras separat; radering i Förena får inte
  beskrivas som att Telegrams kopior också raderats.
- K-020: Lagchattens länk ska visas för lagets spelare, vårdnadshavare
  och ledare. Ledarchattens länk ska endast visas för lagets ledare.
  Privata grupper ska kräva gruppadministratörens godkännande av nya
  deltagare. Synlighet av en länk ger inte medlemskap eller utökad
  åtkomst i Förena. Aktuell roll ska kontrolleras på servern.
- K-021: Nytt samtal, radering av samtal eller bortkoppling av Telegram
  ska göra väntande förslag i det berörda samtalet ogiltiga. Gamla
  bekräftelseknappar ska hänvisa till ett nytt förslag och får inte
  genomföra ändringen. Detta avser granskningsförslag, inte de ordinarie
  svarsknapparna i redan skickade kallelser; dessa följer sina befintliga
  giltighets- och bortkopplingsregler.
- K-022: Kallelsesvar via text eller röst ska kunna föreslå både svar
  och kommentar, exempelvis Kommer och ”blir tio minuter sen”. Båda ska
  visas före knappbekräftelse och sparas som den bekräftade ändringen.
  Om ingen ny kommentar anges ska befintlig kommentar bevaras.
- K-023: Förena ska bara behandla röstfilen tillfälligt och spara
  transkriptionen i samtalet, utan egen beständig lagring av ljudet.
  Misslyckad transkribering ska ge hjälp att skicka nytt röstmeddelande
  eller text och får inte utlösa verksamhetsändringar. Telegrams egna
  ljudkopior omfattas inte av Förenas lagringslöfte.
- K-024: I första versionen ska förslag om aktiviteter, påminnelser och
  minnen granskas och sparas på webben. Telegram får diskutera dem och
  länka till webbflödet. Kallelsesvar och närvaro har egna uttryckliga
  bekräftelseknappar i Telegram enligt K-006 och K-014.
- K-025: Gruppchattar ska i första versionen fortsatt erbjuda navigation
  via `/forena`. Assistentfrågor, rösttolkning och registrering ska
  hanteras privat. Gruppmeddelanden får inte starta dessa privata flöden.
- K-026: Telegrams aktiva dialogkontext ska behållas tills användaren
  väljer Nytt samtal, om inte samtalet raderas eller kopplingen avslutas.
  Ett inaktuellt aktivitetsval får inte användas som automatisk tolkning
  av en ny registreringsbegäran. Boten ska fråga vilken aktivitet som
  avses, exempelvis när ”alla är här” följer efter gårdagens träning.
  Historik får inte behandlas som verifierad aktuell verksamhetsdata.
- K-027: Vid bekräftelse ska aktuell behörighet och relevant underlag
  kontrolleras igen. Om någon ändrat berörd närvaro eller kallelsesvar
  efter granskningen ska boten visa ett uppdaterat förslag och kräva
  ny bekräftelse. Ett och samma förslag får genomföras högst en gång;
  upprepade knapptryck eller återleveranser får inte ge dubbla ändringar.
- K-028: En närvarobehörig ledare ska kunna föreslå närvaro för en person
  som finns bland aktivitetens deltagare även om personen inte svarat
  Kommer, exempelvis ”Lisa är också här”. Samma granskning och
  knappbekräftelse krävs. Registreringen får inte ändra kallelsesvaret.
- K-029: Första versionen ska ha en aktiv Telegram-dialog och Nytt samtal,
  utan meny för att återuppta gamla Telegram-dialoger i Telegram.
  Tidigare Telegram-samtal ska kunna visas och raderas i Förena.
  Visning av ett gammalt samtal på webben får inte ändra den aktiva
  Telegram-kontexten. Raderas det aktiva samtalet gäller K-021 och K-026.
- K-030: Den importerade basfunktionaliteten enligt K-001 ska bevara
  verifierad kontokoppling, uttryckligt samtycke, hashat 256-bitars
  engångsbevis med tio minuters giltighet, hemlig webhookheader,
  avsändarkontroll, deduplicering, uppdateringsordning och bortkoppling.
  Svar ska följa aktuell person-/målsmansåtkomst och aktivitetslivscykel.
  Varje kallad person ska fortsatt få ett separat privat meddelande.
  Återkoppling får inte återaktivera gamla knappar. Gruppkoppling kräver
  aktuell roster.manage och verifierad Telegram-administratörsstatus;
  grupproll eller meddelandetext får aldrig ge Förena-behörighet.
  Befintlig leveranspolicy med Telegram, push och e-post ska bevaras
  genom samordning med målappens notifieringsstöd, inte ersättas tyst
  om någon reservkanal ännu saknas.

## Data, integrationer och kvalitetskrav

Berörda områden är verifierad kontokoppling, privata mottagare och kallelsesvar,
gruppkopplingar, Telegram Bot API/webhook, leveranskö och gemensamma
assistenttjänster. Migreringen ska utgå från målappens Spring-autentisering
och behörighetsarkitektur; Next-appens interna användar-JWT är befintlig
teknik, inte ett beslutat krav på målappen.

Lagringsmodell och transportadaptrar fastställs vid implementation och
ska följa kraven ovan samt målappens arkitektur. Samtal och förslag ska
vara kontobundna; ett annat konto får inte läsa, radera eller bekräfta dem.
Inga bot-token, kopplingsbevis eller hemliga ljudhämtningsadresser får loggas.
Transkriberingsleverantör, leverantörens lagring och tekniska gränser
utöver 60 sekunder behöver fastställas före aktivering av röststödet.
Förena ska inte lagra egna beständiga ljudkopior enligt K-023.

## Acceptanskriterier

- AK-001 (K-001): Givet den inventerade Next-boten ska den färdiga specen
  uttryckligen ange vilka befintliga flöden som ska följa med, vilka som
  undantas och vilka beteenden som ska utvecklas vidare.

K-002 och K-003 är prioriteringskrav. Funktionella kriterier nedan ska
verifieras för relevanta spelar-, vårdnadshavar- och ledarroller.

- AK-002 (K-004): Givet en kopplad användare som skickar ett kallelsesvar
  i vanlig text ska boten kunna hantera det inom användarens aktuella
  svarsrättigheter, visa tolkningen och invänta knappbekräftelse enligt K-014.
- AK-003 (K-005, K-006): När en behörig användare föreslår närvaro i
  privat chatt ska boten visa aktivitet och föreslagna närvaroändringar.
  Ingen registrering får ske innan användaren trycker Registrera närvaro.
- AK-004 (K-007, K-008): Givet kopplade lag- och ledarchattar ska
  webbappen erbjuda länkar som öppnar respektive rätt Telegram-chatt.
  Synlighet och åtkomst ska följa K-020.
- AK-005 (K-009): När närvaro registreras ska ingen automatisk
  närvarokvittens skickas till ledarchatten.
- AK-006 (K-010, K-011): Givet ett svenskt privat röstmeddelande på högst
  60 sekunder ska boten kunna tolka det via transkribering och svara med
  text. Föreslagna ändringar ska kunna granskas och rättas före bekräftelse.
- AK-007 (K-010): Ett röstmeddelande över 60 sekunder ska avvisas med
  information om gränsen och får inte leda till verksamhetsändringar.
- AK-008 (K-006, K-011): Ett röstmeddelande som föreslår närvaro får inte
  spara närvaro före uttryckligt tryck på Registrera närvaro.
- AK-009 (K-012): När en användare svarar på en kallelse ska boten kunna
  använda dess aktivitet. Om flera aktiviteter är möjliga och inget
  entydigt uttryckligt aktivitetsval finns ska boten fråga före förslag.
- AK-010 (K-013): Givet en aktivitet där Stina och två andra personer
  svarat Kommer ska ”alla anmälda på plats förutom Stina” föreslå de två
  andra som närvarande och Stina som frånvarande. Deltagare med andra
  kallelsesvar ska lämnas oförändrade och berörda namn visas före bekräftelse.
- AK-011 (K-014): Varken texten ”båda barnen kommer” eller motsvarande
  röstmeddelande får spara ett kallelsesvar innan knappbekräftelse.
  Ett giltigt tryck på befintlig Kommer/Kan inte-knapp får spara direkt.
- AK-012 (K-015): Givet två deltagare med namnet Stina ska boten fråga
  vilken person som avses innan förslaget färdigställs. Ett namn utan
  deltagarträff ska ge en följdfråga, inte en gissning eller en skrivning.
- AK-013 (K-016): När en redan närvarande Stina föreslås som frånvarande
  ska granskningen visa ”närvarande → frånvarande”. Ingen rättning sparas
  före knappbekräftelse. Ändrat relevant underlag ska kräva ny granskning.
- AK-014 (K-017): Ett bekräftat personligt minne som sparats i webben
  ska vara tillämpligt även för samma kontos Telegram-assistent och
  omvänt. Andra kontons personliga minnen får inte bli tillgängliga.
- AK-015 (K-018): Givet ett uttryckligt aktivitetsval i Telegram ska
  en följdfråga där kunna använda samma kontext efter aktuell
  behörighetskontroll. Att användaren öppnar ett gammalt webbsamtal
  med en annan aktivitet får inte ändra Telegram-kontexten, och omvänt.
  Ett Telegram-förslag ska visa klubb och aktivitet före bekräftelse.
- AK-016 (K-017, K-018): Gemensamma sparade minnen får inte slå ihop
  separata klubbsamtal eller ge en klubbassistent tillgång till en annan
  klubbs privata uppgifter utöver användarens behöriga delegering enligt
  AI-assistentspecen.
- AK-017 (K-019): När användaren startar Nytt samtal i en kanal ska
  fortsatta meddelanden där använda det nya samtalet. Den andra kanalens
  aktiva samtal ska vara oförändrat. Tidigare samtal och sparade minnen
  ska finnas kvar.
- AK-018 (K-019): Ett raderat Förena-samtal ska inte längre kunna öppnas
  som sparad dialog där. Ingen automatisk radering av Telegrams
  meddelandekopior får utlovas.
- AK-019 (K-020): En spelare eller vårdnadshavare ska kunna se sitt lags
  lagchattlänk men nekas ledarchattlänken även vid direkt serveranrop.
  Lagets ledare ska kunna se båda. Inträde i en privat grupp ska kräva
  gruppadministratörens godkännande.
- AK-020 (K-021): Efter Nytt samtal, samtalsradering eller bortkoppling
  ska ett försök att bekräfta ett tidigare väntande förslag i det berörda
  samtalet avvisas utan ändring och ge hjälp att ta fram ett nytt förslag.
- AK-021 (K-022): ”Stina kommer, men blir tio minuter sen” ska kunna
  ge en förhandsvisning med både Kommer och kommentaren. Inget sparas
  före knappbekräftelse. Saknas ny kommentar ska den befintliga bevaras.
- AK-022 (K-023): Efter avslutad ljudbehandling ska Förena inte behålla
  en egen beständig ljudkopia. Lyckad transkription sparas i samtalet.
  Misslyckad transkribering ska ge hjälp och lämna verksamhetsdata oförändrad.
- AK-023 (K-024): Ett aktivitets-, påminnelse- eller minnesförslag som
  diskuteras i Telegram får inte sparas eller skickas genom ett ja eller
  en Telegram-knapp i första versionen; användaren hänvisas till webbens
  granskning och bekräftelse.
- AK-024 (K-025): Gruppfritext och gruppröstmeddelanden får inte nå
  assistentens tolkning eller registrera verksamhetsdata. `/forena` ska
  fortsatt erbjuda navigation till det kopplade laget.
- AK-025 (K-026): En följdfråga i samma aktiva Telegram-dialog ska kunna
  använda tidigare kontext. Om tidigare aktivitet är gårdagens träning
  och användaren skriver ”alla är här” ska boten fråga efter aktivitet
  i stället för att automatiskt föreslå registrering på gårdagens träning.
- AK-026 (K-027): Givet en förhandsgranskning som följts av en annan
  användares ändring av berört svar eller närvaro ska knappbekräftelsen
  inte skriva över ändringen. Ett uppdaterat förslag med ny bekräftelse
  krävs. Upprepad bekräftelse av redan genomfört förslag ska inte skriva igen.
- AK-027 (K-028): Givet Lisa bland aktivitetens deltagare med obesvarad
  kallelse ska en behörig ledares ”Lisa är också här” kunna föreslå och
  efter knappbekräftelse registrera närvaro. Kallelsen förblir obesvarad.
- AK-028 (K-029): Nytt samtal i Telegram ska börja en ny dialog utan
  meny för återupptagande av gamla dialoger. Ett gammalt Telegram-samtal
  ska kunna visas och raderas i Förena utan att visning där byter den
  aktiva Telegram-kontexten.
- AK-029 (K-030): Utgånget eller återanvänt kopplingsbevis, fel
  webhookhemlighet eller främmande avsändare ska inte ge koppling eller
  verksamhetsändring. Borttagen målsmansrelation, bortkopplat konto och
  äldre update får inte ändra ett svar. Återkoppling återupplivar inte
  gamla knappar. Två kallade barn ska ge två separata privata kallelser.
- AK-030 (K-030): Gruppkoppling utan nödvändig Förena-behörighet eller
  Telegram-administratörsstatus ska nekas. Gruppmedlemskap eller
  frågetext får inte välja konto eller ge åtkomst till privat data.
- AK-031 (K-017, K-018, K-027): Ett annat konto ska nekas åtkomst till
  samtal och förslag även vid direkta serveranrop. Återkallad behörighet
  före bekräftelse ska neka ändringen utan privilegierad reservväg.

## Bekräftade beslut och motiv

Besluten nedan är kronologiska. Omgång 12 ersätter tidigare beslut om
gemensamt aktivt samtal och gemensam nystart; aktuella krav är K-017–K-019.

- 2026-10-26: Användaren begär uppdatering mot `origin/main` och `grill-me`
  för import från Next-appen och vidareutveckling av Telegram-boten.
- 2026-10-26, omgång 1: Hela befintliga boten ska följa med. Kallelser är
  primära målet. Alla tre målgrupper prioriteras lika.
- 2026-10-26, omgång 2: Kallelsesvar i vanlig text och privat
  närvarorapportering ska ingå i första versionen. Närvaro kräver alltid
  sammanställning och uttrycklig knappbekräftelse innan registrering.
- 2026-10-26, omgång 3: En valfri lagchatt och en valfri ledarchatt per lag,
  med vägledd koppling i lagets inställningar, accepteras under villkor
  att chattarna kan öppnas via länkar från webben. Automatiska
  närvarokvittenser i ledarchatten får vänta.
- 2026-10-26, omgång 4: Chattlänkar får öppna Telegram i app eller
  webbläsare beroende på enheten. Användaren efterfrågar en bedömning av
  svårigheten med röstmeddelanden innan beslut om omfattningen.
- 2026-10-26, omgång 5: Användaren accepterar privata röstmeddelanden i
  första versionen, med svenska som första språk, högst 60 sekunder per
  meddelande och textsvar. Närvarons bekräftelseknapp gäller även röst.
- 2026-10-26, omgång 6: Användaren accepterar aktivitetskontext från
  besvarad kallelse eller tidigare uttryckligt aktivitetsval och följdfråga
  vid flera möjliga aktiviteter. ”Anmälda” avser Kommer; nämnt undantag
  markeras frånvarande och övriga lämnas oförändrade. Berörda personer
  visas före bekräftelse. Text- och rösttolkade kallelsesvar kräver
  knappbekräftelse; befintliga svarsknappar får spara direkt.
- 2026-10-26, omgång 7: Användaren accepterar följdfrågor vid tvetydiga
  eller saknade namn samt rättning av befintlig närvaro med tydlig
  före-/eftervisning och ny granskning om underlaget ändrats.
  Användaren föreslår att Telegram fungerar som den generella
  Förena-assistenten och delar minne; exakt delning är ännu inte bekräftad.
- 2026-10-26, omgång 8: Användaren accepterar Telegram som kanal till
  den personliga Förena-assistenten, med både gemensamma sparade minnen
  och möjlighet att fortsätta samma personliga samtal mellan webb och
  Telegram. Klubbarnas egna samtal hålls åtskilda. Telegram-förslag visar
  klubb och aktivitet före bekräftelse.
- 2026-10-26, omgång 9: Användaren bedömer att påbörjad närvarorapportering
  inte behöver kunna slutföras på annan enhet. Detta avgränsar aktiva
  arbetsflöden och ersätter inte beslutet om gemensamma minnen och samtal.
  Gemensamt Nytt samtal utan radering av gamla samtal/minnen accepteras,
  liksom separat hantering av Telegram-kopior vid radering i Förena.
  Rollstyrd synlighet för lag-/ledarchatt och administratörsgodkännande
  av nya deltagare i privata grupper accepteras.
- 2026-10-27, omgång 10: Användaren accepterar ogiltigförklaring av
  väntande förslag vid Nytt samtal, radering och bortkoppling, kommentarer
  till kallelsesvar med granskning samt bevarande av befintlig kommentar
  om ingen ny anges. Ljud behandlas tillfälligt, transkriptionen sparas
  i samtalet och transkriberingsfel ger hjälp utan verksamhetsändring.
- 2026-10-27, omgång 11: Användaren accepterar webbgranskning av övriga
  assistentförslag och fortsatt navigation utan assistentdialog i grupper.
  Användaren ifrågasätter gemensamt aktivt samtal: ett gammalt samtal
  valt i webben ska inte oväntat ge kontext på mobilen. Nya Telegram-samtal
  föreslås; exakt innebörd behöver avgöras. K-018 och berörda kriterier
  är markerade för omprövning, medan gemensamma sparade minnen kvarstår.
- 2026-10-27, omgång 12: Användaren förtydligar att boten måste behålla
  kontext mellan Telegram-meddelanden, men att kontexten är fristående
  mellan Telegram och webb. Gemensamma sparade minnen kvarstår. Detta
  ersätter kanalöverskridande aktivt samtal och gemensam nystart.
- 2026-10-27, omgång 13: Användaren accepterar Telegram-kontext tills
  Nytt samtal, följdfråga vid inaktuell aktivitet och uppdaterade förslag
  med ny bekräftelse vid samtidiga ändringar. Samma förslag får inte
  genomföras två gånger.
- 2026-10-27, omgång 14: Användaren accepterar närvaroregistrering av
  aktivitetsdeltagare som inte svarat Kommer utan ändring av kallelsesvar,
  samt en aktiv Telegram-dialog utan återupptagningsmeny. Gamla dialoger
  kan visas/raderas i Förena utan att visning där ändrar Telegram-kontexten.
- 2026-10-27, slutlig bekräftelse: Användaren säger ”vi börjar med
  nuvarande spec, allt ser bra ut i specen”. Befintlig sammanfattning
  och omfattning godkänns. Den tillkommande idén om gruppbaserad
  avanmälan skjuts upp; K-025 behålls. Specen markeras Redo.

## Obekräftade antaganden och förslag

- Framtida idé, uppskjuten: meddela ledarchatten att närvaro registrerats
  av exempelvis George.
- Transkriberingsleverantör, leverantörens retention och tekniska gränser
  utöver 60 sekunder är ännu inte beslutade. Förenas egen tillfälliga
  ljudbehandling och lagring av transkription är bekräftade.
- Användaren frågar om Förena kan skapa lag- och ledarchattar som grund.
  Rekommenderat flöde är vägledd manuell gruppskapning i Telegram eller
  koppling av befintlig grupp, med uttryckligt val av lag och grupproll.
  En vanlig bot kan inte själv skapa Telegram-grupper via Bot API.
  Befintlig Next-koppling använder en gruppvalslänk och kontroller av
  både Förena-behörighet och Telegram-administratörsstatus.
  Direkt hämtning av Telegrams dokumentation gav HTTP 403 i miljön;
  aktuell dokumentation kunde inte verifieras live denna omgång.
- Inga ytterligare obekräftade produktförslag ingår i leveransen.
- Framtida idé, uttryckligen uppskjuten vid slutlig bekräftelse: när någon skriver
  ”Leona är sjuk” i en föräldrachatt kan boten föreslå ”Avanmäl Leona”
  för ledare och efter genomförd avanmälan skriva ”Krya på Leona”.
  En vanlig Telegram-grupp har inte individuellt synliga botmeddelanden
  eller inlineknappar. En synlig knapp kan däremot behörighetskontrolleras
  vid klick, eller förslaget skickas i en redan verifierad privat chatt.
  Idén ingår inte i denna leverans. En framtida beställning skulle ändra
  gruppavgränsningen i K-025 och kräver en separat precisering.
  Aktivitetsval, rätt att ändra annans svar, vem som får se förslaget,
  gruppens läsinställningar och återkoppling behöver preciseras.

## Öppna frågor

Inga blockerande produktfrågor återstår. Följande tekniska val och
leveranskontroller hanteras vid implementation:

- Inför implementation: välj transkriberingsleverantör, dokumentera dess
  retention och sätt tekniska fil-/trafikgränser. Dessa är tekniska
  genomförandefrågor; de får inte ändra 60-sekundersgränsen eller
  tillfällig egen ljudbehandling. Röststödet kräver verifierad konfiguration
  före aktivering.
- Vid implementation: verifiera privata grupplänkar och administratörens
  godkännande, notifieringskanalernas beroenden samt säker aktivering och
  avveckling av gamla webhooken. Telegram-dokumentation och riktig testbot
  behöver verifieras i en miljö med åtkomst. Utgör leveranskontroller,
  inte ytterligare öppna produktbeslut.

## Bekräftelse

Användaren bekräftade den slutliga sammanfattningen och nuvarande omfattning
2026-10-27: ”vi börjar med nuvarande spec, allt ser bra ut i specen”.
Den tillkommande gruppidén är uttryckligen uppskjuten. Status är Redo.
Ingen implementation eller live-verifiering är genomförd inom denna feature.

## Ändringshistorik

- 2026-10-26: Skapat utkast efter uppdatering till `origin/main` (`a76a711`).
  Inventerat Next-botens flöden och kopplingen till den godkända assistentspecen.
- 2026-10-26: Sparat svar från omgång 1: full befintlig funktionalitet,
  kallelser som huvudmål och lika prioritering av målgrupperna. Noterat
  närvarorapportering med ledarkvittens som obekräftad vidareutvecklingsidé.
- 2026-10-26: Sparat svar från omgång 2: kallelsesvar i vanlig text och
  privat närvarorapportering ingår, med obligatorisk närvarobekräftelse.
  Gruppskapning/koppling och kvittens till ledarchatt utreds vidare.
- 2026-10-26: Sparat svar från omgång 3: vägledd koppling av lag- och
  ledarchatt med länkar från webben, uppskjutna automatiska gruppkvittenser
  och en öppen fråga om röstmeddelanden.
- 2026-10-26: Chattlänkar får öppna app eller webbläsare. Röststöd är
  fortfarande obekräftat i väntan på en bedömning av komplexitet.
- 2026-10-26: Röststöd bekräftat för första versionen: privata svenska
  röstmeddelanden, högst 60 sekunder, transkribering, textsvar och
  granskning/rättning före bekräftelse av föreslagna ändringar.
- 2026-10-26: Bekräftat aktivitetsval, exakt innebörd av ”anmälda” och
  uttryckligt närvaroundantag samt obligatorisk knappbekräftelse av
  kallelsesvar som tolkas från text eller röst.
- 2026-10-26: Bekräftat följdfrågor vid otydliga namn och granskade
  närvarorättningar. Noterat önskemålet att utreda gemensamt minne med
  den personliga Förena-assistenten i stället för separat Telegram-minne.
- 2026-10-26: Gemensamma sparade minnen och fortsatt personligt samtal
  mellan webb och Telegram bekräftade, med bibehållen klubbavgränsning.
- 2026-10-26: Avgränsat överföring av aktiva närvaroförslag mellan
  kanaler/enheter. Bekräftat gemensamt Nytt samtal, radering i Förena med
  separat Telegram-hantering och rollstyrda chattlänkar med godkännande.
- 2026-10-27: Bekräftat ogiltiga gamla förslag, granskade kommentarer
  till kallelsesvar, tillfällig ljudbehandling och sparad transkription
  samt hjälp utan verksamhetsändring vid transkriberingsfel.
- 2026-10-27: Bekräftat webbgranskning för övriga förslag och privat
  assistentdialog. Markerat gemensamt aktivt samtal för omprövning efter
  invändningen om oväntad kontext från gamla webbsamtal.
- 2026-10-27: Ersatt gemensamt aktivt samtal med separata kontexter i
  Telegram och webb. Telegram behåller följdfrågors kontext; sparade
  minnen är gemensamma. Nytt samtal påverkar endast den aktuella kanalen.
- 2026-10-27: Bekräftat bibehållen Telegram-kontext med följdfråga vid
  inaktuell aktivitet samt ny granskning vid samtidiga ändringar och
  skydd mot upprepad verkställighet av samma förslag.
- 2026-10-27: Bekräftat närvaro även för oanmälda aktivitetsdeltagare
  utan ändring av kallelsesvar samt en aktiv Telegram-dialog. Slutgranskat
  krav och kriterier, tagit bort besvarade frågor och förberett bekräftelse.
- 2026-10-27: Återöppnat omfattningsfrågan om botförslag från grupptext
  efter användarens idé om ledarstyrd avanmälan och grupphälsning.
- 2026-10-27: Användaren bekräftar nuvarande spec och skjuter upp
  gruppidén. Inga blockerande produktfrågor kvarstår; status ändrad till Redo.
