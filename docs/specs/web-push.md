# Web-push som aviseringskanal

- Status: Redo
- Senast uppdaterad: 2026-11-03
- Berörda dokument: [Telegram-boten](telegram-bot.md), [Mitt konto](mitt-konto.md), [Aktiviteter](hantera-aktiviteter.md), [Arkitektur](../architecture.md), [Roadmap](../roadmap.md), [M15A](../migration/tasks/m15a-web-push.md)
- Implementation och verifiering: Befintligt stöd finns i Next och React/Kotlin. Produktintervjun är slutförd; ingen implementation av kompletteringarna är beställd. Ingen liveleverans eller appkod har verifierats inom denna dokumentationsändring.

## Problem och mål

Web-push behöver en egen featurespec som beskriver kanalens beteende och
förhållande till e-post och Telegram. Befintliga regler är utspridda och
beskriver inte alla produktbeslut. Målet är att samla befintliga beslut och
intervjua fram det som saknas utan att behandla kodens beteende som nya beslut.

## Omfattning

### Ingår

- Inventering av befintliga kanalregler och implementation.
- Precisering av web-push genom intervju: målgrupper, händelser, kanalval,
  aktivering, enheter, innehåll, navigation, fel och kontolivscykel.
- Första versionen omfattar kallelser, kallelsepåminnelser,
  aktivitetsändringar och inställningar, bemanningshändelser samt
  ledarpåminnelser om saknad närvaro.

### Ingår inte

- Implementation inom denna beställning.
- Ändringar av andra kanalers produktregler utan uttryckligt beslut.

## Användare, roller och flöden

Mottagare följer verksamhetsspecarnas regler för respektive händelse.
Användaren aktiverar varje enhet under Mitt konto → Notiser. För en
avisering prövas Telegram, därefter alla aktiva pushenheter och slutligen
e-post om ingen push accepterats. Notisklick öppnar behörighetskontrollerat
mål, efter inloggning vid behov. Samlade ändringar öppnar en sammanställning.

### Observerat nuläge, inte nya produktbeslut

- Roadmapen beskriver flera enheter per konto, utskick till alla aktiva
  prenumerationer, avstängning vid 404/410 och e-post som reservkanal.
- Arkitekturen och Telegram-specen beskriver prioriteringen
  Telegram → push → e-post för privata kallelser.
- Aktivitetsspecens K-029/AK-030 beskriver samlade ändringsmeddelanden per
  konto och kanal, inklusive både mejl och push när båda är aktiverade.
  Detta har ändrats genom intervjuomgång 2: samma kanalordning gäller nu
  samtliga händelser som omfattas här. Inventeringen beskriver tidigare regel.
- Next har en notisdialog med status och installationshjälp. Den gemensamma
  React/Kotlin-inställningskomponenten erbjuder aktivering och avstängning
  på aktuell enhet, men har enklare statuspresentation.
- Kotlin-kallelsens push har generell text och länkar till `/notifications`;
  M15A:s acceptanskriterium anger att rätt aktivitet ska öppnas.
- Service workern visar notisen även när en appflik är öppen och öppnar eller
  återanvänder en flik vid klick. Appflikar får också en uppdateringssignal.
- Kotlin skickar till aktiva prenumerationer och räknar minst ett accepterat
  anrop som framgång. Det bevisar inte att användaren sett notisen.
- Kotlin spärrar övertagande av en endpoint som redan tillhör ett annat konto.
  Önskat beteende preciseras i K-008/K-017; det innebär inte att hela
  flödet är implementerat eller verifierat.

Källor: `src/components/notification-settings.tsx`,
`src/components/push-notification-settings.tsx`, `public/sw.js`,
`backend/src/main/kotlin/se/forena/api/notifications/PushService.kt` samt
dokumentlänkarna ovan. Ingen liveleverans har verifierats i inventeringen.

## Krav

- K-001: Web-push ska beskrivas som en egen aviseringskanal, med uttrycklig
  relation till de separata kanalerna e-post och Telegram.
- K-002: Alla privata aviseringar inom K-003 ska följa ordningen
  Telegram → push → e-post. Nästa kanal används när föregående inte kan
  leverera; dessa utskick ska inte skickas parallellt i flera kanaler.
- K-003: Web-push ska från första versionen kunna avisera kallelser,
  kallelsepåminnelser, aktivitetsändringar och inställningar,
  bemanningshändelser samt ledarpåminnelser om saknad närvaro.
  Mottagarurval och utlösande verksamhetshändelser ska återanvända
  [aktivitetsspecen](hantera-aktiviteter.md),
  [bemanningsspecen](arbetspass-och-bemanning.md) och bekräftade tids- och
  mottagarregler i [närvaropåminnelsespecen](telegram-narvaropaminnelse.md).
- K-004: Push ska aktiveras separat på varje enhet och, när push väljs
  enligt K-002, skickas till alla kontots aktiverade enheter. Användaren
  ska kunna stänga av aktuell enhet respektive samtliga enheter från
  Mitt konto → Notiser.
- K-005: Aktivering ska erbjudas under Mitt konto → Notiser.
  Webbläsarens tillståndsfråga får visas först efter att användaren
  uttryckligen tryckt på Aktivera push. En diskret uppmaning ska erbjudas
  efter första inloggningen på en ny enhet, men hoppas över om Telegram
  är aktiverat. Manuell pushaktivering ska fortfarande finnas som
  reservkanal under Mitt konto → Notiser.
- K-006: Pushnotisens synliga titel och text ska innehålla en kort
  beskrivning utan personnamn eller känsliga uppgifter. Personnamn,
  kommentarer eller känsliga uppgifter får inte läcka genom exempelvis
  aktivitetens fria titel. Detaljer visas först i den behörighetskontrollerade
  appvyn. Använd fasta textmallar med aktivitetstyp, datum och tid där
  det är relevant, exempelvis ”Ny kallelse – träning 5 november kl. 18.00”
  och ”Ett arbetspass har ändrats”. Fria aktivitetstitlar får inte användas.
- K-007: Klick på en pushnotis ska öppna rätt aktivitet eller arbetspass.
  Samlade ändringar ska öppna en sammanställning över berörda tillfällen.
  Om inloggning behövs ska användaren efter inloggning skickas vidare
  till det avsedda målet, med ordinarie kontroll av aktuell behörighet.
- K-008: Uttrycklig utloggning ska stänga av push på aktuell enhet för
  det utloggade kontot. Övriga enheter påverkas inte. Vid kontobyte ska
  det nya kontot själv aktivera push; en tidigare prenumeration får inte
  automatiskt övertas. Utgången session är inte i sig uttrycklig utloggning;
  inloggningsflödet vid notisklick följer K-007.
- K-009: Pushkanalen ska räknas som accepterad när minst en aktiverad
  enhets pushtjänst accepterat utskicket. Inget reservmejl ska då skickas,
  även om andra enheter misslyckas. Acceptans får inte beskrivas som att
  användaren har sett eller läst notisen. Alla aktiverade enheter ska
  fortfarande omfattas enligt K-004.
- K-010: Systemnotisen ska visas även när Förena redan är öppet.
  Samtidigt ska öppna appvyer uppdatera berört innehåll, med ordinarie
  behörighetskontroller och utan att notisen automatiskt navigerar användaren.
- K-011: Om användaren avböjer den diskreta pushuppmaningen ska den
  inte återkomma på samma enhet. Manuell aktivering under Notiser ska
  fortfarande vara möjlig. Webbläsarens blockerade tillstånd ska respekteras.
- K-012: Första versionen ska stödja iPhone/iPad med Förena öppnat från
  hemskärmen, Android och datorwebbläsare med Web Push-stöd. Ge tydlig
  installationshjälp och visa om push är aktiverat, avstängt, blockerat
  eller saknar stöd. Visa separat om tjänsten inte är konfigurerad eller
  status inte kan hämtas; sådana fel får inte felaktigt visas som aktiverat.
- K-013: Om målet tagits bort eller mottagaren saknar aktuell åtkomst
  ska klick visa ”Innehållet är inte längre tillgängligt” utan detaljer,
  med länk till översikten. Nya utskick ska kontrollera aktuell
  mottagaråtkomst. En pushlänk får inte i sig ge åtkomst.
- K-014: Om push inte accepteras av någon aktiverad enhet ska leveransen
  gå direkt vidare till e-post. Samma push ska inte försökas igen senare
  av Förena. Ogiltiga prenumerationer, exempelvis HTTP 404/410, ska
  inaktiveras automatiskt; tillfälliga leveransfel ska inte i sig stänga
  av prenumerationen. Pushtjänstens leverans till en offlineenhet efter
  acceptans styrs separat av K-015.
- K-015: Ett pushmeddelande får ligga hos pushtjänsten högst 24 timmar
  från sändningsförsöket. Tidigare slutgräns gäller för följande typer:
  kallelsepåminnelse vid aktivitetsstart, bemanningspåminnelse vid passets
  start och närvaropåminnelse vid aktivitetens slut plus 24 timmar.
  Giltighetstiden är den kortaste av 24 timmar och återstående tid till
  typens slutgräns. Inställningar och ändringsmeddelanden får hela dygnet,
  även efter aktivitetsstart. En tidsgräns som redan passerats innebär
  att pushen inte lämnas till pushtjänsten.
  Detta är pushtransportens giltighet, inte en ny statuskontroll som
  återkallar redan köade utskick vid inställning enligt aktivitetsspecens K-050.

- K-016: Timeout eller annat osäkert utfall hos pushtjänsten ska leda
  vidare till e-post om ingen enhet säkert accepterat. Förena ska inte
  skicka om samma push. I detta undantagsfall kan både push och mejl
  komma fram; det är accepterat och får inte beskrivas som garanterat
  exakt en leverans. Upprepade jobb ska dedupliceras per avisering och
  prenumeration så att samma jobb inte orsakar nya pushförsök.
- K-017: Vid utloggning ska Förena stoppa prenumerationen och rensa
  lokala notiser så långt webbläsaren tillåter. Utloggning ska fungera
  även vid nätfel. Om avstängningen inte kan bekräftas ska detta visas
  tydligt; gränssnittet får inte påstå att serveravstängningen lyckats.
  Redan överlämnade eller visade notiser kan inte garanteras återkallade.
  Ett nytt konto får aldrig automatiskt överta det gamla kontots
  prenumeration. Avstängning ska inte visas som bekräftad vid fel.

Befintliga godkända krav i länkade specar gäller fortsatt, med de
uttryckliga kanaländringarna i denna intervju. Inga nya regler för
verksamhetens mottagarurval införs genom transportkanalen.

## Data, integrationer och kvalitetskrav

Befintligt stöd använder Web Push, VAPID, service worker och kontobundna
prenumerationer. Ett annat konto får inte ändra eller överta dem.
Registrering av samma prenumeration ska inte skapa extra utskick.
Transporten ska återanvända projektets beständiga notifieringsflöde och
skydd mot dubbla jobb. Acceptans hos en pushtjänst är inte läskvitto.

### Verifiering vid framtida implementation

- Automatiska prov för kanalordning, delvis accepterad leverans, timeout,
  deduplicering, 404/410, tidsgränser, kontoisolering och behörigheter.
- Verkliga enhetsprov enligt AK-014, inklusive offlineleverans,
  utloggning/kontobyte och avstängning. Dokumentera vad webbläsaren medger
  för rensning; lova inte återkallning av redan överlämnade notiser.
- Kontrollera kontoinställningar och notifieringsflöden mot Next-appens
  förlaga enligt AGENTS.md och designreglerna.

## Acceptanskriterier

- AK-001 (K-001): Specen anger för varje inkluderad händelsetyp hur web-push
  väljs och hur den samverkar med e-post och Telegram.
- AK-002 (K-002): Givet att Telegram accepterar en privat avisering inom
  K-003 ska samma utskick inte också skickas via push eller
  e-post. Om Telegram inte kan leverera ska push prövas; om inte heller
  push kan leverera ska e-post prövas. Pushacceptans följer K-009.
- AK-003 (K-003): För varje inkluderad händelsetyp ska ett utskick som
  enligt verksamhetsreglerna riktas till mottagaren kunna levereras via
  web-push när kanalvalet medger det. Web-push får inte utöka händelsens
  mottagarurval eller ge mottagaren nya behörigheter.
- AK-004 (K-004): Givet två aktiverade enheter ska båda omfattas när
  pushkanalen väljs. Avstängning av den ena ska lämna den andra aktiv.
  Stäng av samtliga ska stoppa framtida push till alla kontots enheter.
- AK-005 (K-005): Att öppna Notiser eller logga in ska inte i sig visa
  webbläsarens tillståndsfråga; den får begäras först efter Aktivera push.
- AK-006 (K-005): Givet aktiverat Telegram och första inloggningen på
  en ny enhet ska ingen automatisk pushuppmaning visas. Användaren ska
  ändå kunna aktivera push manuellt under Mitt konto → Notiser.
- AK-007 (K-006): Givet en händelse med personnamn i aktivitetstiteln
  och känslig kommentar ska pushnotisen ge en kort beskrivning utan
  att något av detta innehåll visas i notisens titel eller text.
- AK-008 (K-007): Klick på en notis ska leda till rätt aktivitet eller
  arbetspass, och en samlad notis till rätt sammanställning. Givet en
  utgången session ska målet behållas genom inloggningen, men innehållet
  får bara visas om det inloggade kontot har aktuell behörighet.
- AK-009 (K-008): Givet två aktiverade enheter ska uttrycklig utloggning
  på den ena stoppa nya pushutskick till den enheten för kontot, medan
  den andra förblir aktiv. Ett annat konto som loggar in på samma enhet
  får inte automatiskt överta prenumerationen eller få det gamla kontots
  nya aviseringar.
- AK-010 (K-009): Givet två aktiverade enheter där en pushtjänst accepterar
  och den andra nekar ska reservmejl inte skickas. Status ska skilja
  accepterad leverans från läst notis. Om ingen enhet accepterar ska
  e-post prövas enligt K-002.
- AK-011 (K-010): Givet att Förena är öppet när en push tas emot ska
  systemnotisen ändå visas och berört appinnehåll uppdateras. Den öppna
  vyn får inte navigeras bort enbart genom mottagandet.
- AK-012 (K-011): Efter avböjd uppmaning ska senare inloggningar på samma
  enhet inte visa den igen. Manuell aktivering ska fortfarande finnas.
- AK-013 (K-006): Kallelse, påminnelse, aktivitetsändring, inställning,
  bemanningshändelse och närvaropåminnelse ska presenteras med fasta
  textmallar. Fritt inmatad aktivitetstitel får inte förekomma i pushtexten.
- AK-014 (K-012): Verifiera aktivering, faktisk push, klick till rätt mål
  och avstängning på iPhone/iPad från hemskärmen, Android och dator med
  pushstöd. Verifiera dessutom blockerad behörighet, saknat stöd och
  installationshjälp. Redovisa enhet, operativsystem och webbläsarversion;
  automatiska transportprov ersätter inte verkliga enhetsprov.
- AK-015 (K-013): Givet borttaget mål eller förlorad åtkomst ska notisklick
  visa det generella meddelandet och länk till översikten utan att exponera
  innehållet. Förlorad mottagaråtkomst ska stoppa nya utskick till kontot.
- AK-016 (K-014): Givet att alla pushförsök misslyckas ska e-post prövas
  utan senare omsändning av samma push. HTTP 404/410 ska inaktivera berörd
  prenumeration; ett tillfälligt fel ska lämna den aktiv för nya händelser.
- AK-017 (K-015): Ett vanligt pushmeddelande ska ha högst 24 timmars
  giltighet. En kallelsepåminnelse skickad två timmar före aktivitetsstart
  ska ha högst två timmar. En bemanningspåminnelse begränsas på samma sätt
  av passets start. En närvaropåminnelse skickad 30 minuter efter slut
  ska ha högst 23 timmar och 30 minuter. En ändring efter start får ha
  24 timmar. En passerad slutgräns får inte leda till sen pushleverans.

- AK-018 (K-016): Vid timeout utan någon säker acceptans ska e-post
  prövas och pushen inte skickas om. Status ska ange osäkert utfall;
  eventuell sen push tillsammans med mejl är tillåten i detta fall.
  Upprepad behandling av samma avisering/prenumeration får inte ge
  ett nytt pushförsök eller återstarta redan genomförd reservleverans.
- AK-019 (K-008, K-017): Vid nätfel under utloggning ska användaren
  ändå loggas ut och få besked om att pushavstängningen inte kunde
  bekräftas. Lokal avregistrering och rensning ska göras där det går.
  Ett nytt konto ska inte automatiskt få den gamla prenumerationen.
  Redan överlämnade notiser omfattas av den dokumenterade begränsningen.

## Bekräftade beslut och motiv

- 2026-11-03, omgång 7: Timeout ska leda till mejl utan nytt pushförsök;
  möjlig dubbel leverans vid osäkert utfall accepteras. Utloggning ska
  stoppa prenumerationen och rensa lokala notiser där det går, fungera
  vid nätfel och tydligt visa obekräftad avstängning. Ingen garanti om
  återkallning av redan överlämnade notiser; inget automatiskt övertagande
  av prenumerationen vid kontobyte.
- 2026-11-03: Användaren begär inventering och `/grill-me` för web-push,
  med e-post och Telegram som separata kanaler.
- 2026-11-03, omgång 1: Användaren bekräftar Telegram → push → e-post
  för kallelser och påminnelser, med nästa kanal när föregående inte kan
  leverera. Bekräftar föreslagen händelseomfattning inklusive bemanning
  och ledarpåminnelser om saknad närvaro redan från början.
- 2026-11-03, omgång 2: Samma kanalordning bekräftas för samtliga
  inkluderade händelsetyper, även samlade serieändringar. Aktivering per
  enhet, utskick till alla aktiverade enheter och avstängning per enhet
  eller samtliga bekräftas. Inställningar under Mitt konto → Notiser och
  tillståndsfråga först efter klick bekräftas. Användaren lyfter Telegram
  som förstahandsval även när aktiveringsuppmaningen utformas.
- 2026-11-03, omgång 3: Ingen automatisk pushuppmaning när Telegram
  är aktiverat; manuell aktivering kvarstår. Kort notisbeskrivning utan
  namn eller känsliga uppgifter bekräftas. Direktlänk till aktivitet/pass,
  sammanställning vid samlade ändringar och vidareledning efter eventuell
  inloggning bekräftas.
- 2026-11-03, omgång 4: Utloggning stänger av push på aktuell enhet utan
  påverkan på andra; ett nytt konto aktiverar själv. Minst en accepterande
  pushtjänst innebär att reservmejl inte skickas, utan garanti för att
  notisen setts. Systemnotis visas även med öppen app, som samtidigt uppdateras.
- 2026-11-03, omgång 5: Avböjd uppmaning ska inte återkomma på enheten.
  Fasta textmallar med aktivitetstyp, datum och tid vid behov, utan fria
  aktivitetstitlar, bekräftas. Föreslaget enhetsstöd, installationshjälp
  och status för aktiverat/avstängt/blockerat/saknat stöd bekräftas.
- 2026-11-03, omgång 6: Bekräftat generellt meddelande för otillgängligt
  mål och kontroll av aktuell åtkomst vid nya utskick. Alla pushfel leder
  direkt till mejl utan senare pushåterförsök; ogiltiga prenumerationer
  stängs av. Bekräftat högst 24 timmars giltighet med tidigare slutgränser
  för kallelse-, bemannings- och närvaropåminnelser enligt K-015.

## Obekräftade antaganden och förslag

- Inga återstående obekräftade produktförslag.

## Öppna frågor

- Inga blockerande produktfrågor återstår. Implementation och verklig
  enhetsverifiering är separata kommande steg.

## Bekräftelse

2026-11-03: Användaren bekräftade slutsammanfattningen med ”ja”.
Samtliga sju intervjuomgångars beslut, krav och avgränsningar är godkända;
status är Redo. Bekräftelsen är inte en beställning av implementation.

## Ändringshistorik

- 2026-11-03: Användaren slutgodkände sammanfattningen. Status ändrad
  till Redo; inga blockerande produktfrågor återstår.
- 2026-11-03, omgång 7: Sparat accepterade begränsningar för timeout,
  reservmejl och utloggning vid nätfel. Sammanställt inför slutbekräftelse.
- 2026-11-03, omgång 6: Sparat otillgängligt mål, aktuell mottagaråtkomst,
  direkt e-postfallback utan pushåterförsök och exakta giltighetstider.
- 2026-11-03, omgång 5: Sparat avböjd uppmaning, fasta textmallar,
  enhetsstöd och verifierbara acceptanskriterier.
- 2026-11-03, omgång 4: Sparat utloggning/kontobyte, definition av
  accepterad push och visning med öppen app samt tillhörande acceptanskriterier.
- 2026-11-03, omgång 3: Sparat Telegram-undantag för uppmaningen,
  integritetskrav på notistext och navigation inklusive inloggning.
- 2026-11-03, omgång 2: Gemensam kanalordning för alla inkluderade
  händelser, enhetsaktivering, avstängning och inställningsingång bekräftade.
  Telegram-undantag för aktiveringsuppmaningen kvarstår som förslag.
- 2026-11-03, omgång 1: Sparat bekräftad kanalordning för kallelser och
  kallelsepåminnelser samt händelseomfattning för första versionen.
- 2026-11-03: Skapat utkast efter inventering av specar, dokumentation och
  befintlig kod. Dokumenterat skillnader och första öppna produktfrågor.
