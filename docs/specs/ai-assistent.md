# AI-assistenten

- Status: Redo
- Senast uppdaterad: 2026-10-28
- Berörda dokument: [Designregler](../design-spec.md),
  [arkitektur](../architecture.md), [säkerhetsarkitektur](../security-architecture.md),
  [assistentminne](../assistant-memory.md), [MCP](../mcp.md),
  [funktionell likvärdighet](../migration/feature-parity.md),
  [M16](../migration/tasks/m16-assistant-mcp.md)
- Implementation och verifiering: React/Kotlin-implementation med lokala automatiska prov. Verklig modell och målmiljö är ännu inte live-verifierade; se matrisen nedan och [leveransdokumentet](../migration/assistant-telegram.md).

## Problem och mål

Beskriv AI-assistentens funktion, användarflöden och verifierbara acceptans
med befintlig Next-funktionalitet som grund. Specen avser produkten
AI-assistenten; migreringsläget är underlag för genomförandet.

## Omfattning

### Ingår

Hela befintliga webbassistenten i React/Kotlin, inklusive klubb-, sektions-
och lagfrågor, minnen samt förslags-/bekräftelseflöden för aktiviteter,
påminnelser och arbetsuppgifter. Uttryckliga förbättringar och detaljerade
krav fastställs under intervjun.

Assistenten ska även finnas på Min översikt och kunna hjälpa över alla
lag och klubbar användaren har rättighet till, enligt K-004.
Varje klubb ska ha en egen konfigurerbar assistent och separata samtal.
Den personliga assistenten har en egen neutral profil för överblick över klubbar.
På Min översikt presenteras den personliga chatten som en privat gruppchatt
med Förena-boten och relevanta klubb-botar som egna avsändare enligt K-015.

### Ingår inte

Webbsökning ligger utanför denna leverans, även befintlig evenemangsresearch
för aktivitetsutkast. Assistenten ska fokusera på plattformens uppgifter enligt K-018.

Extern MCP och Telegram får separata specar och kanalimplementationerna
ingår inte i denna leverans. Assistentens funktionalitet ska kunna
återanvändas från sådana kanaler enligt K-003. Implementation har inte
beställts. Nya automatiska skrivåtgärder är ännu inte beslutade.

## Användare, roller och flöden

Befintlig webbassistent används på klubb-, sektions- och lagsidor. Olika
roller får olika data och verktyg. Exakta användargrupper och flöden för
leveransen behöver bekräftas. Befintligt underlag är dokumenterat nedan.

## Befintligt underlag

Läst i källkod och dokumentation 2026-10-26, inte verifierat genom körning:

- Webbassistenten har en gemensam flytande knapp och panel/dialog som visar
  arbetsyta och aktuell sida. Samtalet bevaras vid minimering. Mobil och
  desktop följer gemensamma designregler. Utloggade och systemadministrativa
  sidor visar inte assistenten.
- Klubb-/sektionsassistenten kan läsa kommande aktiviteter och medlems- och
  uppdragsuppgifter, och hänvisa lagfrågor till ett uttryckligt valt lag.
  Detaljerade privata totalsvar över flera lag stöds inte av denna delegering.
- Lagassistenten kan svara på lagfrågor, läsa aktivitets-/närvarohistorik och
  kallelseläge samt lämna granskbara förslag för aktiviteter, minnen,
  påminnelser och arbetsuppgifter utifrån behörighet.
- Relevanta sparade minnen från person, lag, sektion, klubb och system används
  enligt reglerna i assistentminnesdokumentet; disciplin är en separat dimension.
- Aktivitetsutkast för externa evenemang kan i befintlig kod använda
  webbresearch, med källor kopplade till utkastet och overifierade uppgifter
  markerade som preliminära. Generell webbsökning i vanliga chatsvar hittades
  inte i det granskade flödet.
- Förslag är inte genomförda åtgärder. Spara minne, skicka påminnelse och
  andra skrivningar kräver befintliga separata bekräftelseflöden och aktuell
  serverkontrollerad behörighet. Ett ja i chatten ersätter inte dessa knappar.
- Befintlig kod använder Vercel AI SDK och AI Gateway; M16 beskriver äldre
  Cloud Run-prover men migreringsplanens aktuella driftgrund är Vercel.
  Provider, modell och målarkitektur måste inventeras innan tekniska val fastställs.
- React/Kotlin har en avgränsad MCP-pilot med `list_my_activities` och separat
  OAuth-/grantmodell. Detta är inte en full migrering av webbassistenten.
- M16 beskriver endast ett skrivskyddat läsfall. Migreringsmatrisen anger att
  övriga verktyg, bekräftelser, minnesarv och full klientintegration återstår.
- Extern MCP och Telegram har egna befintliga flöden och är separata
  omfattningsbeslut, även om verksamhetsregler kan delas.

Källor: `src/components/floating-assistant.tsx`,
`src/lib/ai/workspace-assistant.ts`, `src/lib/ai/team-assistant.ts`,
`src/lib/ai/team-assistant-types.ts`, `src/lib/ai/team-assistant-prompts.ts`,
`src/lib/mcp/server.ts`, `backend/src/main/kotlin/se/forena/api/mcp/McpController.kt`
och dokumenten ovan. Verktygskatalogen behöver inventeras i detalj när
omfattningen preciseras; uppräkningen ovan är inte en fullständig verktygsinventering.

Samtalslagring: `TeamAssistantCard` håller meddelanden i React-state och
skickar de senaste sex meddelandena som textkontext. `FloatingAssistant`
behåller komponenten vid minimering men ger den en arbetsyteberoende nyckel.
Ingen beständig samtalslagring hittades i dessa komponenter; omladdning eller
byte av arbetsytenyckel återskapar samtalskomponenten. Detta är inventerat
nuläge, inte ett beslutat krav på den nya assistenten.

## Krav

- K-001: Specen ska beskriva AI-assistentens funktion och beteende med
  befintlig assistentfunktionalitet som grund. Befintligt stöd och nya
  produktbeslut ska skiljas åt; migreringsläget är genomförandeunderlag.
- K-002: Hela befintliga webbassistenten ska finnas i React/Kotlin,
  inklusive minnen och förslags-/bekräftelseflöden. Det omfattar klubb-,
  sektions- och lagfrågor, historik samt granskbara förslag för aktiviteter,
  påminnelser och arbetsuppgifter. Förändringar beslutas uttryckligen i intervjun.
  Webbsökning undantas uttryckligen enligt K-018.

- K-003: Webbassistenten, extern MCP och Telegram ska beskrivas i separata
  specar. Assistentens funktionalitet ska kunna återanvändas av andra kanaler,
  exempelvis Telegram-boten, utan att återskapas som separat verksamhetslogik.
  Återanvändning ska respektera anroparens behörigheter och kanalens egna
  autentiserings-, kontext- och bekräftelseflöden. Detta beslut innebär inte
  att Telegram- eller MCP-kanalerna implementeras i denna leverans.

- K-004: Assistenten ska finnas på Min översikt och kunna hjälpa över alla
  lag och klubbar användaren har rättighet till. Urvalet ska inte begränsas
  till egna och barnens aktiviteter; även andra rättigheter ska beaktas.
  Varje uppgift och verktygsanrop ska följa aktuell, ändamålsspecifik
  behörighet. Att få se ett lag eller en klubb ger inte automatiskt rätt
  att läsa alla privata uppgifter eller genomföra alla åtgärder där.

- K-005: När en begäran gäller en viss arbetsyta får assistenten använda
  aktuell sida eller ett tidigare uttryckligt lagval i samtalet. Om flera
  alternativ fortfarande är möjliga ska assistenten fråga användaren innan
  ett lagbundet förslag tas fram. Klubb och lag ska tydligt framgå i förslaget
  före bekräftelse. Kontextvalet ska alltid verifieras mot aktuell behörighet.
  Sidkontext får inte byta klubbidentitet i ett pågående klubbsamtal enligt K-008.

- K-006: Assistenten får läsa behörig information och ta fram granskbara
  förslag, men verksamhetsändringar kräver en separat bekräftelseknapp.
  Det gäller exempelvis aktiviteter, minnen, påminnelser och arbetsuppgifter.
  Användaren ska se vad som ska ändras och i vilken arbetsyta. Vid bekräftelse
  ska behörighet och aktuella uppgifter kontrolleras igen. Ett ”ja” i chatten
  får inte genomföra ändringen eller ersätta knappbekräftelsen.

- K-007: Samtal ska sparas på användarkontot och kunna återupptas efter
  omladdning och på en annan enhet. Användaren ska kunna starta ett nytt
  samtal och radera gamla samtal. Sparade samtal ska vara privata för
  användaren; andra konton ska inte få läsa dem via klient eller serveranrop.
  Sparad samtalstext ger ingen utökad behörighet till aktuell verksamhetsdata.

- K-008: Assistentens identitet ska följa samtalet, inte sidan. Varje klubb
  ska ha separata samtal med sin egen assistent. Ett sidbyte ska inte byta
  klubbprofil/systemprompt i ett pågående samtal eller radera dess historik.
  På en annan klubbs sida erbjuds den klubbens assistent och dess separata
  samtal. Assistentens identitet och arbetsyta ska vara tydliga. Personlig
  överblick använder en separat, neutral assistent. Detta ersätter tidigare
  beslut om ett gemensamt samtal över klubbar.
- K-009: Varje klubb ska kunna konfigurera sin assistents namn, personlighet
  och egna instruktioner för språk, bemötande och arbetssätt. Klubbassistenten
  ska använda den egna klubbens profil och tillämpliga minnen. Endast
  klubbadministratörer ska få ändra denna klubbgemensamma konfiguration.
  Ledares rätt att hantera lagminnen ska inte i sig ge rätt att ändra
  klubbens assistentprofil. Sektionsinflytande följer K-011.
- K-010: Klubbens egna instruktioner får inte åsidosätta gemensamma regler
  för behörighet, dataskydd eller bekräftelse av ändringar. Klubbprofiler,
  minnen och samtal från en annan klubb får inte blandas in som den aktuella
  klubbens rutiner; UIK:s caférutiner ska exempelvis inte styra AIK:s planbokning.

- K-011: Sektioner ska kunna komplettera klubbassistentens profil med egna
  instruktioner och rutiner för sin verksamhet. Klubben bestämmer namn,
  grundpersonlighet och gemensamma instruktioner; assistenten behåller
  klubbens identitet. Sektionstillägg ska bara användas när frågan gäller
  den sektionen. Är sektionen oklar ska assistenten fråga. Lagets rutiner
  kommer fortsatt från lagminnen. Sektionstillägg får inte åsidosätta klubbens
  gemensamma regler eller systemets behörighets- och bekräftelsekrav.
  Sektionsadministratörer får redigera sin egen sektions instruktioner;
  klubbadministratörer får redigera alla sektioners instruktioner inom
  klubben. Enbart lagledar- eller lagminnesbehörighet ger inte denna rätt.

- K-012: Tidigare meddelanden ska fortsatt vara läsbara som privat
  samtalshistorik om användaren förlorar åtkomst till ett lag eller en klubb.
  Detta ger inte rätt till nya datauppslag eller bekräftelse av gamla
  förslag; dessa kräver aktuell behörighet. Gamla svar får inte presenteras
  som verifierade uppgifter om nuläget. Historiken är fortsatt privat enligt K-007.

- K-013: Uppdaterade klubb- och sektionsinstruktioner ska användas från
  nästa svar, även i ett befintligt samtal. Tidigare meddelanden ska behållas
  oförändrade som historik. Samtalet ska fortsatt tillhöra samma klubb enligt
  K-008; ett instruktionsbyte är inte ett byte av klubbidentitet.

- K-014: Den personliga assistenten ska kunna hämta svar från rätt
  klubbassistent när frågan tydligt gäller en klubb. Svaret ska tydligt
  märkas med den klubbassistent som lämnat det, exempelvis ”Svar från AIK:s
  assistent”. Användaren ska inte behöva byta samtal. Klubbsvaret ska använda
  rätt klubbs instruktioner och tillämpliga minnen, medan den personliga
  assistenten behåller sin neutrala profil. Detta är uttrycklig förmedling
  av ett klubbavgränsat svar, inte ett tyst profilbyte enligt K-008.

- K-015: Den personliga chatten ska fungera som en privat gruppchatt med
  en personlig Förena-bot och användarens behöriga klubb-botar, exempelvis
  UIK-boten och AIK-boten. Botarnas namn och klubbtillhörighet ska tydligt
  framgå som avsändare för varje svar. Förena-boten samordnar frågor, ger
  överblick och ställer följdfrågor; klubb-botar svarar för respektive klubbs
  verksamhet. Användaren ska kunna rikta frågor med @-omnämnanden, exempelvis
  `@UIK`. Utan omnämnande fördelar Förena-boten frågan automatiskt när målet
  är tydligt; annars frågar den enligt K-005. Bara relevanta botar ska svara.
  Direkta separata klubbsamtal ska fortsatt finnas på klubbsidorna.
- K-016: Gruppchatten ska vara användarens privata samtal, inte en grupp
  med andra klubbmedlemmar. Gemensam visning ska inte ge klubb-botar tillgång
  till varandras privata klubbdata eller hela den personliga samtalshistoriken.
  Varje klubb-bot ska bara få den relevanta frågekontext och de uppgifter som
  behövs för sitt behöriga uppdrag; klubbprofil och tillämpliga minnen ska
  fortsatt hållas åtskilda enligt K-010. Åtkomst styrs av användarens rättigheter.

- K-017: Om en relevant klubb-bot eller datakälla inte kan hämta uppgifter
  ska tillgängliga verifierade svar ändå kunna visas. Det ska tydligt framgå
  vilken klubb eller del som saknas och finnas möjlighet till återförsök.
  Förena-boten får inte presentera ett delvis resultat som en komplett
  överblick. Ett hämtningsfel får inte tolkas som att aktiviteter eller andra
  uppgifter saknas.

- K-018: Assistenten ska i denna leverans fokusera på plattformens uppgifter:
  behörig verksamhetsdata, sparade minnen och tillämpliga klubb-/sektionsinstruktioner.
  Webbsökning ska inte ingå eller användas, vare sig för vanliga frågor eller
  aktivitetsutkast. Om underlag för en sakuppgift saknas ska detta framgå;
  assistenten får inte fylla luckan med påhittad information eller påstå att
  externa uppgifter är verifierade. Generell webbsökning och befintlig
  evenemangsresearch lämnas till senare.

- K-019: Personliga minnen ska höra till användarkontot oberoende av klubb.
  Gemensamma minnen ska alltid höra till en bestämd klubb, sektion eller ett
  lag. Personliga preferenser får inte automatiskt bli gemensamma klubbregler.
  Minnesförslaget ska visa exakt text och mål före knappen ”Spara minne”.
  Sparande kräver separat knappbekräftelse och aktuell rätt att hantera målet
  enligt K-006; användaren får inte få tillgång till någon annans personliga minnen.

- K-020: Botarnas svar ska visas efter hand som de blir klara. Varje bot
  som fortfarande arbetar ska ha tydlig ”svarar…”-indikering. Ett färdigt
  svar ska inte behöva vänta på övriga botar. Förena-boten får sammanfatta
  när underlaget är klart och ska ange saknade delar enligt K-017.

- K-021: Assistenten ska svara professionellt till ledare och andra
  funktionärer inom klubben: sakligt, tydligt och handlingsinriktat utan
  överdrivet beröm. Till målsmän ska bemötandet vara varmare, mer förklarande
  och hjälpsamt, med konkreta nästa steg och samma saklighet. Assistenten
  ska inte förutsätta att målsmän kan sportens begrepp eller klubbens
  processer, utan förklara dessa när det behövs.
- K-022: För spelare ska ton och uttryck anpassas efter spelarens ålder:
  under 13 år enkelt och konkret, 13–17 år direkt och respektfullt utan
  påtvingad slang, och från 18 år ett vuxet bemötande. Åldersanpassning får
  inte bli nedlåtande. Vid flera roller styr den aktuella uppgiften tonen.
  Ålder hämtas enbart från användarens egen kopplade personprofil; okänd
  ålder ger neutralt och tydligt bemötande utan gissning. Klubbens och
  sektionens instruktioner får anpassa tonen inom de gemensamma reglerna.

## Bevarad funktionsomfattning från Next

Följande ingår genom K-002, med de uttryckliga ändringarna i denna spec:

| Funktion | Befintligt underlag och beteende att bevara |
| --- | --- |
| Verksamhetsfrågor | Klubb-/sektionsaktiviteter, medlemsantal/listor och registrerade uppdrag via `workspace-assistant.ts` och `workspace-member-tools.ts`. Detaljer ska följa respektive rättighet. |
| Lagfrågor | Kommande aktiviteter, egna/företrädda personers kallelser och behörighetsstyrt lagunderlag, uppgifter och målgruppsanpassade dokument via `team-assistant-context.ts` och `team-assistant-tools.ts`. |
| Historik | Aktivitets-/närvarohistorik och arbetsuppgifter via `activity-history-tools.ts`, med skillnad mellan registrerad närvaro, kallelsesvar och genomförd arbetsuppgift. Saknad rapport är okänd. |
| Kallelseläge | Period- och aktivitetsavgränsad läsning via `activity-invitation-tools.ts`, med separata rättigheter och utan att nya svar eller mottagare skapas av modellen. |
| Aktivitetsförslag | Granskbara enstaka aktiviteter och återkommande serier enligt `team-assistant.ts` och aktivitetsutkastets schema. Befintliga aktivitetstyper, datumregler och strukturerade förval återanvänds. Webbresearch undantas enligt K-018. |
| Påminnelser | Bedömning och granskbara förslag via `reminder-tools.ts` och [minnesreglerna](../assistant-memory.md). Aktuellt svarsläge och behörighet kontrolleras före separat utskicksbekräftelse. Köad leverans får inte beskrivas som skickad. |
| Arbetsuppgifter | Granskbara förslag för aktivitetsanknutna arbetsuppgifter via `activity-duty-tools.ts`, med separat sparande och befintliga verksamhetsregler. |
| Minnen | Föreslå, granska, spara, läsa och administrera minnen enligt [assistentminne](../assistant-memory.md), med kontobundna personliga minnen enligt K-019. Tillämplig disciplin, nivå och behörighet ska beaktas. |
| Gränssnitt | Gemensam assistentyta på mobil/desktop enligt [designreglerna](../design-spec.md#flytande-föreningsassistent), med tillgängliga dialoger, aktivitetslänkar och granskning av utkast. |

Aktuell strukturerad verksamhetsdata ska fortsatt ha företräde framför
motstridiga minnen enligt befintliga minnesregler. Kallelsesvar, kommentarer
och minnestexter ska behandlas som data och får inte ge nya verktygsrättigheter.
Klubb-/sektionskonfigurationens överordnade gränser följer K-010–K-011;
vanliga lagminnen får inte kringgå dessa. Befintliga begränsningar av listor
och historik ska synliggöras, inte presenteras som fullständiga totalsvar.

## Data, integrationer och kvalitetskrav

Assistenten använder verksamhetsdata, behörigheter, sidkontext,
konversationstext, minnen och modell/provideranslutning. Befintliga
bekräftelse- och åtkomstregler är underlag som ska bevaras om inte användaren
uttryckligen beslutar annat. Sidtext, minnen och andra verksamhetstexter får
inte ge nya behörigheter. Externa kanaler använder egna grants och samtycken.

Teknisk ansvarsfördelning, modell/provider och exakta svarstidsgränser väljs
vid implementation inom kravbilden. Samtalslagring, kontext, behörigheter
och felhantering ska följa kraven ovan.
Ingen provider har anropats och inga externa system har ändrats i inventeringen.

## Acceptanskriterier

- AK-001 (K-001): Den färdiga specen ska ange vilka assistentflöden
  som ingår, vilka som ligger utanför och vilka uttryckliga ändringar som
  beslutats, med verifierbara kriterier för den valda leveransen.
- AK-002 (K-002): I React/Kotlin ska behöriga användare kunna använda hela
  webbassistentens beslutade funktionsomfång, inklusive minnen och granskning/
  bekräftelse av förslag. Ett enda skrivskyddat MCP-läsfall uppfyller inte
  detta krav. Flödesspecifika kriterier kompletteras i fortsatt intervju.

- AK-003 (K-003): Assistentens beslutade funktioner ska kunna anropas via
  ett gemensamt gränssnitt från webbchatten och en separat kanaladapter,
  exempelvis ett Telegram-testanrop. Verksamhetsregler ska återanvändas och
  ingen extra behörighet eller automatisk bekräftelse ska uppstå genom
  kanalbytet. Kanalens fullständiga flöde verifieras i dess egen spec.

- AK-004 (K-004): Givet behörighet till lag i två klubbar, när användaren
  frågar på Min översikt om aktiviteter i veckan, ska assistenten kunna
  sammanställa behöriga aktiviteter från båda klubbarna och ange klubb/lag.
  Underlaget får inte begränsas enbart till användarens familjerelationer.
- AK-005 (K-004): Uppgifter eller åtgärder som kräver rättigheter användaren
  saknar ska inte lämnas ut eller utföras, även om de avser en klubb eller
  ett lag som ingår i användarens övergripande urval. Begäran i chatten får
  inte utöka rättigheterna.

- AK-006 (K-005): Givet en behörig användare på en lagsida, när användaren
  ber om en träning på torsdag utan att namnge laget, får sidans lag användas.
  Förslaget ska visa klubb och lag före bekräftelse.
- AK-007 (K-005): Givet Min översikt med flera möjliga lag och inget
  tidigare uttryckligt lagval, när användaren ber om en träning utan att ange
  lag, ska assistenten fråga vilket lag som avses i stället för att välja
  godtyckligt. Ett tidigare uttryckligt val får återanvändas om det gör
  begäran entydig och aktuell behörighet fortfarande finns.

- AK-008 (K-006): Givet ett förslag om en verksamhetsändring, när användaren
  skriver ”ja” i chatten utan att trycka på bekräftelseknappen, ska ändringen
  inte genomföras. Förslaget ska visa ändring och arbetsyta före bekräftelsen.
- AK-009 (K-006): Givet ett visat förslag, när behörighet eller relevant
  verksamhetsdata ändras före knappbekräftelsen, ska servern kontrollera det
  aktuella läget och inte utföra ändringen med inaktuella rättigheter eller
  förutsättningar. Ändrat förslag behöver granskas på nytt.

- AK-010 (K-007): Givet ett sparat samtal, när samma användare laddar om
  sidan eller loggar in på en annan enhet, ska samtalet kunna återupptas.
  Ett nytt samtal ska kunna startas utan att radera det tidigare samtalet.
- AK-011 (K-007): Användaren ska kunna radera ett gammalt samtal så att det
  inte längre kan öppnas som sparat samtal. Ett annat konto ska nekas läsning
  och radering av samtalet, även vid direkt serveranrop.

- AK-012 (K-008, K-007): Givet ett sparat samtal med UIK:s assistent, när
  användaren går till AIK:s sida, ska UIK-samtalet behållas under UIK och
  inte fortsätta med AIK:s profil. AIK:s egen assistent och separata samtal
  ska erbjudas; återgång till UIK ska kunna återuppta UIK-samtalet.
- AK-013 (K-008, K-005): Givet ett klubbsamtal som berört flera lag inom
  klubben, när en följdfråga inte entydigt anger lag genom begäran eller
  kontext, ska assistenten fråga i stället för att välja godtyckligt.
- AK-014 (K-009): Givet två klubbar med olika namn, personligheter och
  instruktioner, ska respektive klubbassistent använda sin egen konfiguration
  och tillämpliga minnen. Den personliga assistenten ska behålla sin neutrala profil.
- AK-015 (K-010, K-006): Klubbkonfiguration som begär utökad dataåtkomst
  eller ändringar utan knappbekräftelse ska inte kunna åsidosätta de gemensamma
  reglerna. UIK:s sparade caférutiner ska inte bli AIK:s rutiner för planbokning.

- AK-016 (K-009): En klubbadministratör ska kunna ändra klubbens
  assistentprofil. En användare med enbart ledarbehörighet eller rätt att
  hantera lagminnen ska nekas motsvarande ändring även vid direkt serveranrop.

- AK-017 (K-011): Givet två sektioner med olika bokningsrutiner, när en
  fråga gäller innebandysektionen ska dess instruktioner kunna användas
  tillsammans med klubbprofilen utan att den andra sektionens rutiner blandas
  in. Om frågans sektion inte kan avgöras ska assistenten be om förtydligande.
- AK-018 (K-011, K-010): Sektionsinstruktioner får inte byta klubbassistentens
  identitet eller åsidosätta klubbens gemensamma regler, aktuell behörighet
  eller separat knappbekräftelse för verksamhetsändringar.

- AK-019 (K-011): En sektionsadministratör ska kunna ändra sin egen
  sektions instruktioner men nekas ändring av en annan sektions instruktioner
  även vid direkt serveranrop. En klubbadministratör ska kunna ändra alla
  sektioners instruktioner i sin klubb, men inte en annan klubbs.
- AK-020 (K-011, K-009): En användare med enbart lagledar- eller
  lagminnesbehörighet ska nekas ändring av sektionsinstruktioner och
  klubbprofil även om användaren kan hantera sitt lags minnen.

- AK-021 (K-012, K-007): Givet ett sparat privat samtal om klubb A, när
  användarens åtkomst till A återkallas, ska tidigare meddelanden kunna läsas
  som historik. Andra konton ska fortsatt nekas åtkomst till samtalet.
- AK-022 (K-012, K-006): Efter återkallad verksamhetsbehörighet ska nya
  uppslag och bekräftelse av gamla förslag som kräver den behörigheten nekas.
  Tidigare meddelanden får inte användas som bevis för aktuella rättigheter
  eller presenteras som en ny verifiering av verksamhetens nuläge.

- AK-023 (K-013, K-008): Givet ett pågående klubbsamtal, när behörig
  administratör ändrar klubbens eller tillämpliga sektionens bokningsinstruktioner,
  ska nästa svar använda de nya instruktionerna utan att kräva ett nytt
  samtal. Gamla meddelanden ska bestå och samtalet inte flyttas till en annan klubb.

- AK-024 (K-014, K-010): När användaren i den personliga chatten frågar
  ”Hur bokar jag innebandyplanen i AIK?” ska svaret kunna hämtas från AIK:s
  assistent och tydligt märkas som dess svar. AIK:s tillämpliga instruktioner
  och minnen ska användas utan att UIK:s rutiner blandas in eller den
  personliga assistentens neutrala identitet byts ut.

- AK-025 (K-015, K-014): Givet att användaren har åtkomst till UIK och AIK,
  när frågan gäller veckans aktiviteter och AIK:s planbokning, ska Förena-boten
  kunna ge överblick och AIK-boten svara om bokningen med tydliga separata
  avsändare. UIK-boten ska inte svara enbart för att den finns i chatten.
- AK-026 (K-015, K-005): När användaren skriver `@UIK` med en klubbfråga
  ska den riktas till UIK-boten. Utan omnämnande ska ett entydigt klubbmål
  kunna väljas automatiskt; om flera mål fortfarande är möjliga ska
  Förena-boten fråga. Omnämnandet får inte ge åtkomst till en obehörig klubb.
- AK-027 (K-016, K-010): När AIK-boten besvarar sin del av en fråga i den
  personliga gruppchatten ska UIK:s privata klubbdata och ovidkommande privata
  samtalstext inte överföras till dess kontext. Andra klubbmedlemmar ska
  fortsatt sakna åtkomst till användarens privata samtal.

- AK-028 (K-017): Givet en fråga om UIK:s och AIK:s aktiviteter, när UIK:s
  data hämtas men AIK:s hämtning misslyckas, ska UIK:s aktiviteter kunna visas
  med tydlig information om att AIK:s uppgifter inte kunde hämtas och möjlighet
  till återförsök. Resultatet får inte beskrivas som komplett eller ange att
  AIK saknar aktiviteter på grund av hämtningsfelet.

- AK-029 (K-018): När en fråga kräver externa uppgifter som inte finns
  i plattformens tillgängliga underlag ska assistenten förklara begränsningen
  utan att söka på webben eller hitta på ett verifierat svar. Detta gäller
  även externa evenemang i aktivitetsutkast.
- AK-030 (K-018): Webb- och researchverktyg ska inte erbjudas till
  assistenten i denna leverans. Klubbfrågor ska använda rätt klubbs tillåtna
  verksamhetsdata, instruktioner och minnen inom övriga behörighetsregler.

- AK-031 (K-019): Givet ett personligt minne om korta svar, när användaren
  använder den personliga assistenten med olika behöriga klubbar, ska minnet
  fortfarande höra till samma användarkonto och kunna tillämpas utan ett
  nytt klubbundet personligt minne. Ett annat konto ska inte få läsa minnet.
- AK-032 (K-019, K-006): Givet förslaget ”Så sköter vi UIK:s café” som
  gemensamt minne ska exakt text och UIK som mål visas före ”Spara minne”.
  Ett ja i chatten ska inte spara det. Efter behörig knappbekräftelse ska det
  tillhöra UIK och inte bli AIK:s rutin eller ett personligt kontominne.

- AK-033 (K-020, K-017): När UIK-botens svar är klart och AIK-boten
  fortfarande arbetar ska UIK:s svar visas och AIK ha ”svarar…”-indikering.
  Efter avslut ska indikatorn upphöra, med svar eller tydligt fel. En
  sammanfattning ska ange om någon relevant del saknas.
- AK-034 (K-002): En behörig användare ska kunna fråga efter aktiviteter,
  medlemsuppgifter/uppdrag, kallelseläge och registrerad historik inom det
  bevarade funktionsomfånget. Ett begränsat eller felande underlag får inte
  ge påhittade totalsvar, och anmäld får inte tolkas som faktiskt närvarande.
- AK-035 (K-002, K-006): Behöriga användare ska kunna få granskbara
  aktivitets-/serieutkast, påminnelseförslag, arbetsuppgiftsförslag och
  minnesförslag. En separat bekräftelse ska använda plattformens befintliga
  domänregler. Assistenten får inte påstå att ett osparat förslag är genomfört.

- AK-036 (K-021): Givet en ledare eller annan funktionär, när assistenten
  besvarar en fråga, ska svaret vara sakligt, tydligt och handlingsinriktat
  utan överdrivet beröm.
- AK-037 (K-021): Givet en målsman, när assistenten besvarar en fråga,
  ska svaret vara varmt, sakligt och hjälpsamt med konkreta nästa steg.
  Om svaret bygger på sportbegrepp eller klubbprocesser ska nödvändiga
  förklaringar ges utan att förkunskaper förutsätts.
- AK-038 (K-022): Givet spelare som är 12, 13, 17 respektive 18 år och
  ställer samma fråga, ska svaren följa respektive åldersgrupp: enkelt och
  konkret för 12-åringen, direkt och respektfullt utan påtvingad slang för
  13- och 17-åringen samt vuxet bemötande för 18-åringen. Inget svar får
  vara nedlåtande.

## Verifiering vid implementation

Verifiera varje krav och acceptanskriterium i berörda lager, med särskilda
fall för flera klubbar/sektioner, roller, konto- och behörighetsbyte, minnen,
instruktionsbyte, delvisa fel och separata bekräftelser. Testa modellen med
kontrollerade svar för deterministiska åtkomst-/åtgärdsfall samt ett
kontrollerat verkligt modellprov för routing, rätt avsändare och rätt kontext.
Browserprov ska omfatta mobil och desktop, samtal → fråga → botrespons →
förslag → granskning → bekräftelse → återläst ändring. Redovisa lokal
verifiering och faktisk målmiljöverifiering separat enligt AGENTS.md.

## Implementation och verifieringsmatris

Implementation beställd tillsammans med Telegram 2026-10-27. Kompletteringen
om rollval, eget åldersunderlag och instruktionshierarki är bekräftad i samtalet.
Kraven är fortsatt `Redo`; verifieringsstatus ska läsas separat.

| Acceptanskriterier | Implementation och evidens |
| --- | --- |
| AK-001 | Omfattning och uttryckliga undantag dokumenterade ovan. |
| AK-002–AK-003 | Gemensamma `AssistantService`/`AssistantProposalService` för webb och Telegram; HTTP-/databasprov i `ApiTest` och separat kanaladapter. Verklig modell återstår. |
| AK-004–AK-005 | Aktuellt rättighetsstyrt klubb-/lagurval, separata datauppslag och domänkommandon. `personal club replies keep profiles private…` samt befintliga API-behörighetsprov. |
| AK-006–AK-007 | Sidans lag/aktivitet och beständig uttrycklig kontext; oklart val kräver följdfråga, även när modellen väljer ett lag utan entydigt underlag. Faktisk språkförståelse behöver modellprov. |
| AK-008 | `chat yes never confirms a memory…`: texten ja skriver inget. Separat förslagsbekräftelse krävs. |
| AK-009 | Låsning och ny jämförelse mot granskat underlag; ändrad revision ger uppdaterad granskning. Närvarons versionsgräns och domänkommandonas atomaritet provas i `ApiTest`. |
| AK-010–AK-011 | Kontobundna samtal, återupptagande och radering. Direkt HTTP-prov nekar andra konton läsning/radering. Browserprov täcker samma produktionsvy i båda apparna. |
| AK-012–AK-013 | Klubb och kanal är oföränderliga samtalsidentiteter; frontend väljer separat klubbsamtal. Behörighet och entydigt kontextval kontrolleras på nytt. |
| AK-014–AK-020 | Klubbprofil, separata sektionsinstruktioner, revisionskontroll och administratörsgränser i `AssistantProfileService`; gemensamma inställningskomponenter. Profilskrivning och UI provas med syntetiska data; samtliga rollkombinationer har inte egna riktade prov. |
| AK-021–AK-023 | Historik läses enbart genom kontots samtal. Nya svar och gamla förslag använder aktuell behörighet och nästa svar hämtar profilen på nytt. Inga gamla svar skrivs om. |
| AK-024–AK-028 | Avgränsade klubbfrågor, tydliga avsändare, parallella svar och ofullständig överblick vid delfel. `personal club replies keep profiles private…` verifierar separation och tillgängligt svar vid fel i andra klubben. |
| AK-029–AK-030 | Modelladaptern saknar webb-/researchverktyg och skrivverktyg; endast plattformsunderlag kan lämnas till modellen. |
| AK-031–AK-032 | Kontobundna personliga minnen, behöriga gemensamma mål och exakt text före knapp. Prov täcker separat bekräftelse, dubblettbekräftelse, andra konton och gamla redigeringsrevisioner. |
| AK-033 | Progressiva NDJSON-svar och separat svarar-indikering. Browserprov vid 320/390/768/1280 px i Next och Vite; backend har HTTP-prov med modellstub. |
| AK-034 | Behöriga aktiviteter, medlemsuppdrag, kallelser, dokument och historik. Historiken skiljer faktisk närvaro från svar och genomfört arbete, har gränsmarkering och separata summeringar. Datakällorna återanvänder målappens behörigheter. |
| AK-035 | Typade aktivitets-/serie-, påminnelse-, uppgifts- och minnesförslag; separata domänkommandon vid knapp. Datum/serier, notifieringar och behörighetsgränser omfattas av backendsviten. Fullt flöde med verklig modell är ej verifierat. |
| AK-036–AK-038 | Gemensamma bemötanderegler och verifierat eget åldersunderlag. Gränserna 12/13/17/18 och okänd ålder provas i `ApiTest`; faktisk svarston kräver modellprov. |

Källor: `backend/src/main/kotlin/se/forena/api/assistant/`, publika tjänster i
`activities` och `identity`, `src/components/persistent-assistant.tsx`,
`scripts/migration/assistant-browser.mjs` och `backend/src/test/kotlin/se/forena/api/ApiTest.kt`.
Inga liveprov, produktionsutskick eller driftsättningar har gjorts.

## Bekräftade beslut och motiv

- 2026-10-27, komplettering svar 1–3: Användaren bekräftade sakligt,
  tydligt och handlingsinriktat bemötande till ledare/funktionärer utan
  överdrivet beröm, samt varmare och mer förklarande hjälp till målsmän
  med konkreta nästa steg. Målsmän kan sakna kunskap om sporten och
  klubbens processer. Åldersgrupperna under 13 år, 13–17 år och från 18 år
  med föreslagna tonlägen bekräftades. Kraven finns i K-021–K-022.
- 2026-10-27: Användaren beställde en komplettering av denna spec med
  professionellt bemötande till ledare och andra funktionärer, mer
  tillmötesgående bemötande till målsmän samt åldersanpassad ton och
  uttryck för spelare. Kompletteringen tas fram med grill-me.

- 2026-10-26, svar 20: Användaren bekräftade slutlig sammanfattning och
  avgränsningar med ”ja”. Specen är Redo. Teknisk modell/provider och exakt
  visuell utformning väljs vid implementation inom kraven. Implementation
  har inte beställts.
- 2026-10-26, svar 19: Löpande svar per bot och tydlig ”svarar…”-indikering
  accepterades. Förena-boten får sammanfatta när underlaget är klart och
  måste ange saknade delar.
- 2026-10-26, svar 18: Personliga minnen ska vara kontobundna oberoende
  av klubb; gemensamma minnen ska ha ett bestämt klubb-/sektions-/lagmål.
  Exakt text och mål ska visas före separat ”Spara minne”-bekräftelse.
- 2026-10-26, svar 17: Användaren valde att vänta med webbsökning och
  fokusera på plattformens uppgifter. Undantaget gäller även befintlig
  evenemangsresearch och begränsar K-002:s ursprungliga likvärdighetsmål.
- 2026-10-26, svar 16: Tillgängliga svar ska visas vid delvisa fel med
  tydlig märkning av saknad klubb/del och återförsök. Delresultat får inte
  presenteras som komplett överblick.
- 2026-10-26, svar 15: Användaren accepterade den privata gruppchattmodellen
  med Förena-boten och klubb-botar, automatisk fördelning av tydliga frågor,
  @-omnämnanden och svar från bara relevanta botar. Direkta klubbsamtal kvarstår.
  Gemensam visning innebär inte gemensam klubbkontext eller åtkomst för andra medlemmar.
- 2026-10-26, svar 14: Svar från rätt klubbassistent i den personliga
  chatten accepterades med uttryckligt krav på tydlig märkning. Användaren
  föreslog därefter en chatt där klubbassistenterna syns som egna botavsändare;
  chattutformningen bekräftades därefter i svar 15.
- 2026-10-26, svar 13: Uppdaterade klubb-/sektionsinstruktioner gäller
  från nästa svar även i befintliga samtal. Gamla meddelanden behålls som
  historik och klubbidentiteten består.
- 2026-10-26, svar 12: Tidigare meddelanden ska finnas kvar som privat
  historik efter förlorad lag-/klubbåtkomst. Nya uppslag och gamla förslags
  bekräftelse kräver aktuell behörighet; gamla svar är inte verifierat nuläge.
- 2026-10-26, svar 11: Sektionsadministratörer får redigera egna sektionens
  instruktioner och klubbadministratörer alla sektioners inom klubben.
  Lagledar-/lagminnesbehörighet ger inte rätt att ändra sektionsinstruktioner.
- 2026-10-26, svar 10: Sektionsinflytande accepterades inom klubbprofilen.
  Klubben styr gemensam identitet/instruktioner, sektionen kompletterar för
  rätt verksamhet och laget bidrar genom lagminnen. Oklar sektion kräver
  följdfråga. Sektionsinstruktioner får inte åsidosätta överordnade regler.
- 2026-10-26, svar 9: Endast klubbadministratörer får ändra klubbens
  assistentnamn, personlighet och instruktioner. Lagminnesbehörighet ger
  inte denna rätt. Användaren lyfte därefter frågan om sektionsinflytande;
  sektionskonfigurationen bekräftades därefter i svar 10–11.
- 2026-10-26, svar 8 (”js”, tolkat som ja): Användaren accepterade egna
  klubbassistenter med konfigurerbart namn, personlighet och instruktioner
  samt separata samtal per klubb. Identiteten följer samtalet; personlig
  överblick har neutral profil. Gemensamma behörighets-, dataskydds- och
  bekräftelseregler gäller. Ersätter det tidigare klubböverskridande samtalsbeslutet.
- 2026-10-26, svar 7: Samma samtal får omfatta flera lag/klubbar och
  följa användaren vid sidbyte. Historik bevaras, aktuell arbetsyta visas
  tydligt och tvetydiga följdfrågor kräver förtydligande. Ersatt vad gäller
  klubböverskridande samtal i svar 8.
- 2026-10-26, svar 6: Samtal ska sparas privat på användarkontot för
  återupptagning efter omladdning och mellan enheter, med möjlighet att
  starta nya och radera gamla samtal.
- 2026-10-26, svar 5: Läsning och granskbara förslag tillåts, medan
  verksamhetsändringar kräver separat knappbekräftelse och ny kontroll av
  behörighet och aktuella uppgifter. Ett ja i chatten genomför ingen ändring.
- 2026-10-26, svar 4: Aktuell sida eller tidigare uttryckligt lagval får
  användas som arbetsyta. Kvarstående tvetydighet kräver följdfråga; klubb
  och lag ska alltid framgå i förslaget före bekräftelse.
- 2026-10-26, svar 3: Assistent på Min översikt accepterades, med
  förtydligandet att alla lag/klubbar användaren har rättighet till ska
  omfattas, inte bara egna och barnens klubbar/lag.
- 2026-10-26, svar 2: MCP och Telegram ska ha separata specar, men
  exempelvis Telegram-boten ska kunna använda assistentens funktionalitet.
  Gemensam funktionalitet och separata kanalflöden ska kunna kombineras.
- 2026-10-26, svar 1: Användaren förtydligade att specen gäller en
  AI-assistent, inte enbart migreringen, och bekräftade hela befintliga
  webbassistenten i React/Kotlin inklusive minnen och förslags-/bekräftelseflöden.
- 2026-10-26: Användaren beställde ytterligare en grill-me för migrering av
  AI-assistenten. Implementation har inte beställts.

## Obekräftade antaganden och förslag

Förslag i kompletteringen 2026-10-27, ännu inte bekräftade:

- Vid flera roller styr frågans sammanhang bemötandet.
- Spelarens egen registrerade ålder används om den är tillgänglig inom
  befintlig behörighet. Vid okänd ålder används enkelt, neutralt och
  respektfullt språk utan att gissa ålder från exempelvis lagnamn.
- Klubb- och sektionsprofilen får sätta sin prägel inom tonreglerna, men
  får inte åsidosätta roll- och åldersanpassningen.

Följande är implementationsval inom den tidigare bekräftade kravbilden:

- Exakt visuell utformning av botavsändare, exempelvis avatarer/emblem,
  väljs vid implementation inom kravet på tydligt namn och klubbtillhörighet.
- Arkitektur, språk för modellorkestrering och provider är inte valda genom
  intervjun. Befintlig Vercel AI SDK-kod är ett inventeringsunderlag.

## Öppna frågor

Inga blockerande produktfrågor återstår. Användaren godkände 2026-10-27
kompletteringen om aktuell uppgift, eget åldersunderlag och instruktionernas
förhållande till de gemensamma bemötandereglerna.

## Bekräftelse

Svar 1–20 är sparade med de uttryckliga ändringarna av samtalsmodell och
webbsökning. Användaren bekräftade slutlig sammanfattning och avgränsningar
2026-10-26 med ”ja” i svar 20. Den tidigare kravbilden är fortsatt bekräftad.
Specen återöppnades som Utkast 2026-10-27 för kompletteringen om bemötande;
tonlägen och åldersgrupper bekräftades i kompletteringens svar 1–3.
Användaren godkände 2026-10-27 den föreslagna kompletteringen och beställde
implementation av både AI-assistenten och Telegram enligt specarna.

## Ändringshistorik

- 2026-10-28: React/Kotlin-implementation, privat samtalslagring, klubb-/sektionsprofiler, delade tjänster och verifieringsmatris. Liveprov är separat kvarvarande aktiveringskontroll.

- 2026-10-27: Användaren godkänner kompletteringen av K-021/K-022; status Redo. Implementation beställd tillsammans med Telegram.

- 2026-10-27: Sparat kompletteringens svar 1–3. Preciserat K-021,
  lagt till K-022 och uppdaterat AK-036–AK-038 med bekräftade tonlägen,
  förklaringsbehov för målsmän och åldersgränser. Kvarvarande förslag
  gäller flera roller, okänd ålder och klubb-/sektionsinstruktioner.
- 2026-10-27: Återöppnat specen för intervju om roll- och åldersanpassat
  bemötande. Sparat användarens önskemål som K-021 och preliminära
  acceptanskriterier AK-036–AK-038, med förslag och öppna frågor åtskilda.

- 2026-10-26: Slutlig sammanfattning och avgränsningar bekräftade i svar 20.
  Markerat specen Redo. Implementation är fortsatt ej påbörjad.
- 2026-10-26: Sparat svar 19 om löpande botsvar med K-020 och AK-033.
  Konkretiserat bevarad Next-funktionalitet, AK-034–AK-035 och verifieringsplan
  inför slutlig bekräftelse. Inga nya kanaler eller webbsökning har lagts till.
- 2026-10-26: Sparat svar 18 om kontobundna personliga minnen och tydliga
  gemensamma minnesmål, med K-019 och AK-031–AK-032.
- 2026-10-26: Sparat svar 17 om att skjuta upp all webbsökning och
  fokusera på plattformens uppgifter, med K-018 och AK-029–AK-030.
- 2026-10-26: Sparat svar 16 om delvisa svar och tydliga fel/återförsök,
  med K-017 och AK-028.
- 2026-10-26: Sparat svar 15 om privat gruppchatt med Förena- och klubb-botar,
  @-omnämnanden och avgränsad kontext, med K-015–K-016 och AK-025–AK-027.
- 2026-10-26: Sparat svar 14 om tydligt märkt svar från rätt klubbassistent
  i personlig chatt, med K-014 och AK-024. Noterat förslag om flera synliga
  botavsändare som ännu inte bekräftad utformning.
- 2026-10-26: Sparat svar 13 om nya instruktioner från nästa svar,
  med K-013 och AK-023.
- 2026-10-26: Sparat svar 12 om fortsatt privat historikläsning efter
  förlorad åtkomst, med K-012 och AK-021–AK-022.
- 2026-10-26: Sparat svar 11 om redigeringsbehörighet för sektionsinstruktioner,
  förtydligat K-011 och lagt till AK-019–AK-020. Återupptar frågan om
  samtalshistorik efter förlorad verksamhetsbehörighet.
- 2026-10-26: Sparat svar 10 om sektionsinstruktioner inom klubbprofilen,
  med K-011 och AK-017–AK-018. Redigeringsbehörighet återstår att besluta.
- 2026-10-26: Sparat svar 9 om klubbadministration av assistentprofilen,
  förtydligat K-009 och lagt till AK-016. Öppnat frågan om sektionsinflytande.
- 2026-10-26: Sparat svar 8 om egna klubbprofiler och separata samtal.
  Ersatt K-008 och AK-012–AK-013; lagt till K-009–K-010 och AK-014–AK-015.
  Tidigare gemensamma samtal över klubbar är inte längre krav.
- 2026-10-26: Användaren tog upp separata klubbassistenter och risken att
  klubbrutiner blandas. Öppnat omprövning av K-008 utan att ändra tidigare
  beslut; pausat frågan om historik efter förlorad behörighet.
- 2026-10-26: Sparat svar 7 om samtal över arbetsyte- och sidbyten,
  med K-008 och AK-012–AK-013.
- 2026-10-26: Sparat svar 6 om privata beständiga samtal på kontot,
  återupptagning, nya samtal och radering, med K-007 och AK-010–AK-011.
- 2026-10-26: Sparat svar 5 om separat bekräftelse för ändringar, med K-006
  och AK-008–AK-009. Inventerat nuvarande samtalsstate inför nästa vägval.
- 2026-10-26: Sparat svar 4 om arbetsyta från sid-/samtalskontext,
  följdfrågor och tydligt mål i förslag, med K-005 och AK-006–AK-007.
- 2026-10-26: Sparat svar 3 om personlig assistent över alla behöriga
  lag/klubbar, med K-004 och AK-004–AK-005. Utökar tidigare arbetsyteavgränsning.
- 2026-10-26: Sparat svar 2 om separata kanalspecar och återanvändbar
  assistentfunktionalitet, med K-003 och AK-003.
- 2026-10-26: Sparat svar 1. Bytt namn och sökväg till `ai-assistent.md`
  för produktfokus. Bekräftat hela webbassistenten med K-002 och AK-002.
- 2026-10-26: Skapat utkast från specmallen. Inventerat webbassistent,
  minnesregler och M16/MCP-pilot inför första omfattningsfrågan.
