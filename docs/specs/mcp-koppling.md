# MCP-koppling

- Status: Redo
- Senast uppdaterad: 2026-11-16
- Berörda dokument: [MCP](../mcp.md), [arkitektur](../architecture.md),
  [säkerhetsarkitektur](../security-architecture.md),
  [autentisering](../migration/authentication.md),
  [AI-assistenten](ai-assistent.md), [Mitt konto](mitt-konto.md),
  [Discipliner](discipliner.md)
- Implementation och verifiering: Kravintervju genomförd och specen godkänd. Ingen implementation
  beställd i denna intervju. Nuläget nedan är läst i kod och dokumentation,
  inte verifierat genom körning.

## Problem och mål

Medlemmar och föräldrar ska kunna använda ChatGPT för att få hjälp med egen
och familjens planering. Ledare ska kunna läsa lagets aktiviteter och
kallelseläge. Kopplingen ska ge läsåtkomst och en avgränsad skrivpilot för
att skapa en aktivitet. Bekräftelse ska i första hand ske direkt i MCP-klienten,
med bekräftelse i Förena som reserv när klientstödet saknas.

## Omfattning

### Ingår

- Kravintervju och löpande dokumentation av beslut om MCP-kopplingen.
- ChatGPT som första stödda klient.
- Läsning för familjens planering och behöriga ledares lagöverblick.
- Kommande aktiviteter med tid/plats och egna/barns kallelsesvar. Behöriga
  ledare får även antal ja/nej/obesvarade och namn på dem som tackat ja.
- Skrivpilot: skapa en enstaka aktivitet i ett behörigt lag utan att skicka
  kallelser. Uttrycklig bekräftelse i MCP-klienten när den stöder flödet,
  annars granskning och bekräftelse i Förena.
- Deklarativa åtkomstkrav på verktygsmetoder, användarberoende verktygslistning
  och verktygsbidrag från discipliner och capabilities enligt K-017–K-024.

### Ingår inte

- Implementation ingår inte i den aktuella beställningen.
- Skapa aktivitetsserier, redigera eller ta bort aktiviteter genom MCP-piloten.
- Historik, kontaktuppgifter, privata svarskommentarer och assistentminnen.
- Stöd för andra externa AI-klienter än ChatGPT som leveranskrav.

## Användare, roller och flöden

Målgrupper är medlemmar/föräldrar och ledare. Familjens planering respektive
lagets aktiviteter och kallelseläge är bekräftade användningsfall.
Varje läsning och skrivning ska följa aktuell verksamhetsbehörighet. Den befintliga AI-assistentspecen skiljer
webbassistenten från extern MCP och anger att
verksamhetslogik ska kunna återanvändas av andra kanaler.

### Befintligt underlag

- Kotlin har `/api/mcp` med `list_my_activities`: högst 50 kommande
  aktiviteter från den personliga översikten. Svaret innehåller aktivitetens
  id, titel, start, slut, organisation, lag och plats; inga personnamn,
  kontaktuppgifter eller svarskommentarer exporteras av verktyget.
- Spring Authorization Server äger den nya appens OAuth. Dokumenterat nuläge
  är explicit provisionerad klient, exakt redirect-URI, PKCE, samtycke,
  scope `mcp:read` och resource `${FORENA_WEB_ORIGIN}/api/mcp`.
  MCP-token och browsercookies används i skilda autentiseringsflöden.
- Den äldre Next-servern har `list_teams`, `get_team_overview`,
  `get_team_member_names`, `get_accepted_participant_names` och
  `prepare_activity_draft`. Aktivitetsutkast sparar inga aktiviteter.
- Next-appens `/connect` är dokumenterad anslutningssida. Förekomst av denna
  sida innebär inte att en extern klientanslutning är verifierad.
- `docs/mcp.md` beskriver huvudsakligen den äldre Next/Supabase-lösningen;
  dess installationssteg ska inte förväxlas med den nya Spring-lösningen.

Källor: [MCP-konfiguration](../../backend/src/main/kotlin/se/forena/api/mcp/McpConfiguration.kt),
[delade läsverktyg](../../backend/src/main/kotlin/se/forena/api/assistant/SharedActivityTools.kt),
[OAuth-resursmetadata](../../backend/src/main/kotlin/se/forena/api/mcp/McpMetadataController.kt),
`docs/migration/authentication.md`, `docs/mcp.md` och `docs/specs/ai-assistent.md`.

## Krav

- K-001: Medlemmar och föräldrar ska kunna läsa kommande aktiviteter med
  tid/plats och egna/barns kallelsesvar för egen och familjens planering.
- K-002: Behöriga ledare ska kunna läsa lagets aktiviteter och kallelseläge
  genom MCP-kopplingen, inklusive antal ja/nej/obesvarade och namn på dem
  som tackat ja.
- K-003: ChatGPT ska vara den första verifierat stödda externa klienten.
- K-004: Skrivpiloten ska kunna skapa en enstaka aktivitet i ett lag där
  användaren har rätt att skapa aktiviteter. Operationen ska inte skicka
  kallelser.
- K-005: Före skapande ska användaren få granska exakt klubb, lag, titel,
  datum, tid/tidszon och plats och uttryckligen bekräfta i MCP-klientens
  gränssnitt. Direktflödet kräver verifierat klientstöd för användarinput,
  exempelvis MCP elicitation. Ett modellgenererat `confirmed: true` räcker
  inte som användarbekräftelse.
- K-006: Om ChatGPT saknar nödvändigt stöd för direkt bekräftelse ska
  användaren få en länk till Förena för granskning och uttrycklig bekräftelse
  där. Att öppna länken ska inte i sig skapa aktiviteten.
- K-007: Servern ska kontrollera aktuell behörighet igen vid genomförandet.
  Nekad eller avbruten bekräftelse och timeout ska inte skapa någon aktivitet.
- K-008: Bekräftelsen ska avse exakt granskat förslag och rätt användare.
  Samma bekräftade förslag får skapa högst en aktivitet även vid återförsök.
- K-009: Anslutning ska ske genom OAuth-inloggning och samtycke i Förena,
  utan att användaren manuellt kopierar token. Mitt konto ska visa användarens
  anslutningar och erbjuda återkallning. Återkallning ska stoppa nya anrop
  och genomförande av väntande skrivförslag för anslutningen.
- K-010: Läsåtkomst ska omfatta alla lag och klubbar som användaren har
  aktuell behörighet till, inom K-001 och K-002, utan separat urval vid
  anslutningen. OAuth-samtycke ger inga ytterligare verksamhetsbehörigheter.
- K-011: Skrivpiloten ska hantera lag, aktivitetstyp, titel, datum, start/slut,
  plats och valfri beskrivning. Befintliga aktivitetsregler och föreningens
  tidszon ska återanvändas. Oklara uppgifter ska klarläggas före bekräftelsen.
  Samtliga uppgifter som ska sparas ska framgå av granskningen. Serier,
  redigering och borttagning ingår inte i skrivpiloten.


- K-012: Utan angivet datumintervall ska läsning omfatta pågående och kommande
  aktiviteter under 30 lokala kalenderdagar, från början av dagens datum till
  början av datumet 30 dagar senare i respektive förenings tidszon. Avslutade
  aktiviteter ska inte ingå. Annat framtida datumintervall ska kunna anges.
  Resultat ska pagineras med högst 50 aktiviteter per sida och tydlig
  fortsättningsmarkör; inga ytterligare träffar får döljas som ett komplett svar.
- K-013: Ett obekräftat aktivitetsförslag ska gälla i 30 minuter från skapandet.
  Vid utgången giltighet får det inte genomföras. Ändrade uppgifter ska ge ett
  nytt förslag som måste granskas och bekräftas på nytt; tidigare bekräftelse
  får inte användas för de ändrade uppgifterna.
- K-014: Historik, kontaktuppgifter, privata svarskommentarer och assistentminnen
  ska inte exponeras genom MCP-kopplingen. Namn på dem som tackat ja får endast
  lämnas till behörig ledare enligt K-002, inte genom familjens läsåtkomst.
- K-015: Ett lyckat uppslag utan träffar ska skiljas från ett tekniskt fel.
  Partiella resultat ska markeras som ofullständiga. Efter ett osäkert
  skrivutfall ska status för samma förslag kunna kontrolleras och återförsök
  hanteras utan att en ny aktivitet skapas för samma förslag.
- K-016: Före leverans ska faktisk ChatGPT-anslutning i avsedd testmiljö med
  syntetiska data verifieras för OAuth, läsning, aktivitetsskapande,
  bekräftelse i Förena och återkallning. Direktbekräftelse ska verifieras i
  ChatGPT om stödet finns; annars ska ChatGPT använda reservflödet och
  direktflödet verifieras i en kompatibel testklient.
- K-017: Varje MCP-exponerad verktygsmetod ska uttryckligen deklarera sin
  åtkomstpolicy genom `@McpAccess`. Deklarationen anger nödvändigt OAuth-scope,
  verksamhetsbehörighet eller egen-/vårdnadshavaråtkomst samt hur anropets
  resurs bestäms. För lagbundna verktyg anger `team` vilket metodargument som
  identifierar laget; för aktivitetsbundna verktyg ska laget härledas genom
  verifierat resursuppslag. Saknad annotation innebär ingen MCP-exponering.
- K-018: Verktygets åtkomstkrav ska deklareras en gång. En gemensam generell
  tolkning av `@McpAccess` ska användas för både verktygslistning och
  anropsauktorisering, integrerad med Spring Security. Samma krav ska inte
  behöva upprepas i `@PreAuthorize` eller en separat verktygsspecifik
  behörighetstjänst. Tolkningen ska återanvända befintliga domänregler för
  användarens rättigheter och resursåtkomst; domänkontrollerna behålls.
- K-019: `tools/list` ska filtreras per autentiserad användare och aktuell
  OAuth-anslutning. Ett verktyg får visas endast om anslutningen har dess
  scope och användaren har deklarerad åtkomst i minst ett giltigt sammanhang.
  Scope ger ingen verksamhetsbehörighet. Ingen separat manuellt underhållen
  verktygsbehörighet per MCP-konto ska behövas.
- K-020: Varje anrop ska kontrollera samma policy på nytt mot aktuella
  rättigheter, anslutning och den konkreta resursen. Synlighet i en tidigare
  verktygslista ger aldrig anropsrätt. Återkallad behörighet eller anslutning
  ska stoppa efterföljande anrop även om klienten har cachat verktygslistan.
  Skrivscope ersätter inte K-005–K-008:s granskning och bekräftelse.
- K-021: Kodägda `DisciplinePackage` och `DisciplineCapability` ska kunna
  bidra med egna verktygsklasser till det gemensamma verktygsregistret utan
  att kärnans katalog behöver ändras för varje nytt paket. Bidragen ska kunna
  återanvändas av webbassistenten och MCP. MCP-exponering kräver K-017 och
  ska inte automatiskt omfatta alla interna assistentverktyg. Utökningsstödet
  utvidgar inte i sig den tillåtna datamängden eller skrivpiloten i denna spec;
  nya produktverktyg behöver egna godkända krav inom samma säkerhetsmodell.
- K-022: Registret ska härleda verktygets ägande disciplin och eventuell
  capability från paketregistreringen. Tillhörigheten ska inte behöva upprepas
  i varje metodannotation. Åtkomst kräver både deklarerad behörighet och att
  disciplinen gäller för resursen samt, för capabilityverktyg, att capabilityn
  är effektivt aktiverad där enligt befintligt arv, förval och överstyrningar.
  Kontrollerna ska gälla både listning och anrop, även efter inaktivering.
- K-023: En MCP-anslutning har inget implicit aktuellt lag. Utan verifierad
  lagavgränsning ska ett paketverktyg visas om det finns minst ett lag där
  användaren har rätt åtkomst och paketvillkoren enligt K-022 är uppfyllda
  samtidigt. Om servern har en uttrycklig verifierad lagavgränsning ska
  listningen begränsas till det laget utan att bredda K-010:s åtkomst.
  Anropets lag ska alltid kontrolleras separat; listning för ett behörigt lag
  ger inte åtkomst till andra lag. Något nytt lagvalsgränssnitt beställs inte
  genom denna komplettering.
- K-024: Registret ska valideras vid uppstart. Dubbla exponerade verktygsnamn,
  okända scopes eller behörighetsidentifierare, ogiltiga resurs-/argumentreferenser
  och saknad eller tvetydig pakettillhörighet för paketbidrag ska stoppa
  uppstarten med ett tydligt konfigurationsfel, inte medföra öppnare åtkomst.

## Data, integrationer och kvalitetskrav

OAuth-inloggning, samtycke och återkallning följer K-009. Aktuell
verksamhetsbehörighet begränsar alla lag- och klubbuppslag enligt K-010.
Återkallning stoppar ny åtkomst men kan inte ta tillbaka uppgifter som redan
har exporterats till en extern klient.

Läsgränser, förslagsgiltighet, felhantering och leveransverifiering följer
K-012–K-016. Befintlig Spring-baserad OAuth är utgångspunkt i Kotlin-appen;
skrivpiloten kräver kompletterande auktorisering för just aktivitetsskapande.
Exakt scopeindelning och transport väljs vid implementation inom dessa krav.
Befintlig säkerhetsarkitektur och gemensamma verksamhetsregler är underlag;
inventerat nuläge är inte ett beslut att behålla varje begränsning.

### Annoterad åtkomst och paketbidrag

`scope`, `permission` och `team` har olika ansvar: anslutningens mandat,
användarens verksamhetsrättighet respektive bindningen till lagargumentet.
De ersätter inte varandra. Exempel på deklarationsformen för ett lagbundet
verktyg, inte befintlig kod eller ett nytt produktverktyg:

```kotlin
@Tool(name = "get_team_invitations")
@McpAccess(
    scope = "mcp:read",
    permission = Permission.INVITATION_MANAGE,
    team = "teamId",
)
fun invitations(teamId: UUID, context: ToolContext): ToolInvitations
```

För familjeverktyg behövs motsvarande uttrycklig deklaration av egen- och
vårdnadshavaråtkomst, inte en påhittad ledarbehörighet. Slutlig Kotlin-typning
och form för sådana deklarationer bestäms vid implementation inom K-017–K-018.
Aktör, OAuth-mandat och eventuell lagavgränsning hämtas från verifierad
serverkontext, aldrig från modellens påstående om identitet eller rättigheter.

Spring AI 2.0.2 och MCP SDK 2.1.0 i repots lokala beroenden har granskats:
`McpStatelessSyncServerCustomizer` kan registrera `addToolFilter` med
`McpSyncListFilter`, som får `McpTransportContext` och verktyget. Detta är
utgångspunkten för listfiltret. Den generella anropskontrollen ska fungera
även för Spring AI:s callbackanrop; faktisk integration behöver verifieras.
`McpAccess`, paketbidrag och policytolkning är ännu inte implementerade.

Nuvarande `AssistantToolCatalog` registrerar uttryckligen `SharedActivityTools`
och `AssistantReadTools`; disciplin-/capabilityinterfacen saknar verktygsbidrag.
Katalogen delar i dag fler läsverktyg än vad den ursprungliga inventeringen ovan
beskriver. Den gemensamma katalogen är inte i sig ett godkännande att exponera
allt via MCP; K-014 och den uttryckliga exponeringen enligt K-017 gäller som mål.

## Acceptanskriterier

- AK-001 (K-001, K-003): Givet en ansluten medlem eller förälder, när
  användaren frågar i ChatGPT om sin familjs kommande aktiviteter, ska svaret
  kunna baseras på aktuella uppgifter från Förena inom användarens åtkomst.
- AK-002 (K-002, K-003): Givet en ansluten behörig ledare, när användaren
  frågar i ChatGPT om lagets aktiviteter och kallelseläge, ska dessa uppgifter
  kunna hämtas från Förena inom användarens åtkomst.

- AK-003 (K-004): Givet en behörig användare som har slutfört det beslutade
  bekräftelseflödet, när skrivpiloten skapar en enstaka aktivitet, ska den
  sparas i det valda laget utan att kallelser skickas.
- AK-004 (K-005): Givet en klient med verifierat stöd för direkt bekräftelse,
  när en aktivitet förbereds, ska användaren få granska uppgifterna före
  bekräftelsen. Ett verktygsargument `confirmed: true` utan faktisk
  användarinteraktion ska inte ensamt kunna utlösa skapande.
- AK-005 (K-006): Givet att klienten saknar nödvändigt direktstöd, när
  användaren vill skapa aktivitet, ska en granskningslänk till Förena
  returneras. Aktiviteten skapas först efter bekräftelsen där, aldrig på GET.
- AK-006 (K-007): Givet ett förslag, när användaren nekar, avbryter eller
  bekräftelsen löper ut, ska ingen aktivitet skapas. Detsamma gäller om
  användaren förlorat sin behörighet innan genomförandet.
- AK-007 (K-008): Givet ett bekräftat förslag, när genomförandet upprepas
  eller görs parallellt, ska högst en aktivitet skapas. En annan användare
  ska inte kunna använda bekräftelsen för att genomföra förslaget.

- AK-008 (K-009): När användaren ansluter ChatGPT ska inloggning och samtycke
  kunna slutföras utan manuell tokenkopiering. Nekat samtycke ska inte ge åtkomst.
- AK-009 (K-009): Givet en anslutning och ett väntande aktivitetsförslag, när
  användaren återkallar anslutningen i Mitt konto, ska efterföljande läsningar
  och genomförande av förslaget nekas, även via en tidigare utfärdad länk.
- AK-010 (K-010): Givet behörighet till flera lag/klubbar, när användaren
  frågar om deras aktiviteter, ska uppgifter kunna hämtas från samtliga inom
  K-001 och K-002 utan separat anslutning per lag. Ett lag utanför aktuell
  behörighet ska nekas även om dess id anges direkt i verktygsanropet.
- AK-011 (K-011): Givet oklart lag, aktivitetstyp eller tidsangivelse, när
  ett förslag förbereds, ska oklarheten klarläggas före bekräftelsen.
  Förslaget ska visa aktivitetens uppgifter och föreningens tidszon.
- AK-012 (K-011): När klienten försöker skapa en serie, redigera eller ta
  bort en aktivitet genom piloten, ska ingen sådan ändring genomföras.

- AK-013 (K-012): Utan datumintervall ska svaret följa det definierade
  30-dagarsintervallet i föreningens tidszon och inte innehålla avslutade
  aktiviteter. Ett uttryckligt annat framtida intervall ska användas i stället.
- AK-014 (K-012): Vid 51 tillgängliga aktiviteter ska första sidan innehålla
  högst 50 och en fortsättningsmarkör; nästa sida ska ge den återstående
  aktiviteten utan bortfall i en oförändrad datamängd.
- AK-015 (K-013): Vid exakt 30 minuter efter skapandet ska ett ännu inte
  genomfört förslag vara utgånget. Ändras exempelvis tid eller lag ska gamla
  förslaget inte kunna användas för att genomföra det nya innehållet.
- AK-016 (K-014): Vid läsning ska inga kontaktuppgifter, privata kommentarer
  eller minnen returneras. Historiska aktiviteter ska inte returneras genom
  ett historiskt intervall. Familjeåtkomst ska inte ge andra deltagares namn
  eller svar; behörig ledaråtkomst får ge uppgifterna enligt K-002.
- AK-017 (K-015): Ett datakällefel ska ge fel, inte ett tomt lyckat resultat.
  Om bara en del av uppgifterna kan hämtas ska ofullständigheten framgå.
- AK-018 (K-008, K-015): Om svar uteblir efter att en aktivitet sparats ska
  statusuppslag för samma förslag visa att den skapats och dess aktivitets-id.
  Återförsök för samma förslag ska inte skapa en dubblett.
- AK-019 (K-003, K-016): Leveransredovisningen ska innehålla resultat från
  faktisk ChatGPT-anslutning med testdata för de flöden som K-016 anger,
  inklusive vilket bekräftelseflöde klienten stöder. Enbart protokolltester
  eller en syntetisk klient uppfyller inte ChatGPT-verifieringen.
- AK-020 (K-017–K-019): Givet ett internt `@Tool` utan `@McpAccess` ska det
  inte exponeras genom MCP. För ett annoterat verktyg ska saknat scope eller
  saknad verksamhetsåtkomst utesluta det från `tools/list`.
- AK-021 (K-017–K-018): En ändring av verktygets deklarerade behörighet ska
  påverka både listning och anrop utan ändring av en parallell regel eller
  separat `@PreAuthorize` på verktygsmetoden. Prov ska gå genom de faktiska
  Spring AI-callbacks som MCP-servern använder.
- AK-022 (K-019–K-020, K-023): Givet rättighet i lag A men inte B ska ett
  verktyg kunna listas för A medan direkt anrop mot B nekas. Återkallad
  rättighet eller OAuth-anslutning ska neka nästa anrop trots cachad lista.
- AK-023 (K-021–K-022): Ett syntetiskt disciplin-/capabilitypaket ska kunna
  bidra med ett annoterat verktyg utan ändring av kärnkatalogen. Ägande paket
  ska härledas från registreringen och samma bidrag kunna användas av
  webbassistenten med dess aktuella behörighet och arbetsyteavgränsning.
- AK-024 (K-022–K-023): Givet att användaren har behörighet i A med capabilityn
  avstängd och saknar behörighet i B med capabilityn aktiverad ska verktyget
  inte listas. När båda villkoren uppfylls i A får det listas. Uttrycklig
  lagavgränsning till A ska inte visa verktyget enbart på grund av aktivering i B.
- AK-025 (K-020, K-022): Givet ett tidigare listat capabilityverktyg ska ett
  nytt anrop nekas när capabilityn har inaktiverats för mållaget, även om
  användaren behåller behörigheten. Prov ska omfatta ärvt förval, överstyrning
  samt ett mål där ägande disciplin inte gäller.
- AK-026 (K-017, K-020): Vid aktivitetsargument ska servern härleda det
  verkliga laget och neka åtkomst till främmande aktivitet även om klienten
  också anger ett eget behörigt lag. Egen-/familjeverktyg ska fortsatt neka
  åtkomst till personer som användaren inte företräder.
- AK-027 (K-024): Uppstartsprov ska neka dubbla verktygsnamn, okända
  scope-/behörighetsidentifierare, ogiltig argumentbindning och tvetydigt
  ägande paket. Saknad `@McpAccess` ska ge utebliven MCP-exponering.
- AK-028 (K-014, K-020–K-021): Paketbidrag ska inte automatiskt exponera
  historik, kommentarer, kontaktuppgifter eller assistentminnen. Ett skrivverktyg
  med rätt scope ska fortfarande kräva ordinarie granskning och bekräftelse.

## Bekräftade beslut och motiv

- 2026-11-02: Användaren har beställt grill-me och specarbete för MCP-koppling.
- 2026-11-02, omgång 1: Målgruppen och användningsfallen i K-001 och K-002
  accepterades med ”ja”. ChatGPT valdes som första klient.
- 2026-11-02, omgång 1: Läsning bekräftades. Användaren öppnade för ”kanske
  någon enstaka skriv-operation för att testa hur det fungerar”; detta är inte
  ett beslut om vilken operation som ska ingå eller hur den ska bekräftas.
- 2026-11-02, omgång 2: Föreslagen läsomfattning accepterades med ”ja”.
  Användaren valde ”skapa aktivitet” som skrivoperation. Förslaget avsåg en
  enstaka aktivitet utan utskick av kallelser.
- 2026-11-02, omgång 2: Användaren frågade om kontrollfråga kan ställas via
  MCP-servern. Bekräftelse i Förena är inte accepterat som obligatoriskt flöde.
- 2026-11-02, omgång 3: Användaren accepterade föreslaget direktflöde med
  granskning, uttrycklig användarbekräftelse, ny behörighetskontroll och
  skapande en gång. Nej, avbrott och timeout ska inte skapa något.
  Bekräftelse i Förena accepterades som reserv när ChatGPT saknar stödet.
- 2026-11-02, omgång 4: Användaren accepterade OAuth-anslutning och
  återkallning i Mitt konto, alla behöriga lag/klubbar utan separat urval,
  samt föreslagna aktivitetsfält, befintliga aktivitetsregler och föreningens
  tidszon. Serier, redigering och borttagning avgränsades bort.

## Bekräftade beslut från sista frågeomgången

- 2026-11-02, omgång 5: Användaren accepterade 30 dagars läsförval,
  annat framtida intervall på begäran och högst 50 aktiviteter per sida.
- Förslag ska gälla i 30 minuter och ändringar kräver ny bekräftelse.
- Historik, kontaktuppgifter, privata svarskommentarer och assistentminnen
  avgränsades bort. Föreslagen felhantering och faktisk ChatGPT-verifiering
  med testdata före leverans accepterades.

### Komplettering 2026-11-16: verktygsåtkomst och paketbidrag

Användaren bad uttryckligen att MCP-specen uppdateras med samtalets modell:
en deklaration av åtkomstkravet, återanvänd vid listning och anrop, samt
verktyg från discipliner och capabilities. `scope`, `permission` och
lag-/resursbindning har separata betydelser. Pakettillhörigheten härleds
från registreringen; aktivering kontrolleras tillsammans med behörigheten
för samma lag. Utan ett verifierat aktuellt lag används minst ett giltigt
lag som listvillkor. Besluten dokumenteras i K-017–K-024 och AK-020–AK-028.
Ingen implementation beställs genom denna specuppdatering.

## Tekniska förutsättningar och återstående verifiering

MCP:s `elicitation/create` i form-läge är en möjlig mekanism för direkt
bekräftelse när klienten annonserar stöd. Stödet i målversionen av ChatGPT är
inte verifierat. MCP-servern litar på klientens förmedling av användarens svar;
elicitation ger inget fristående kryptografiskt bevis för användarinteraktionen.
Om direktstödet saknas ska reservflödet enligt K-006 användas.

Protokollunderlag: [MCP elicitation 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation).
Läst 2026-11-02 från specifikationens officiella GitHub-källa. Protokollet
kräver att klienten annonserar stöd för respektive elicitation-läge och
bestämmer inte hur klientens gränssnitt ser ut. Befintlig Kotlin-pilot har
bara JSON-svar; stöd för serverinitierad input och lämplig transport behöver
utredas och verifieras om detta flöde väljs.

## Öppna frågor

Inga blockerande produktfrågor återstår. Sammanfattningen är slutbekräftad.
Klientstöd och faktisk ChatGPT-anslutning är kvarstående verifieringspunkter
för implementation och leverans enligt K-016, inte redan verifierade funktioner.

## Bekräftelse

2026-11-02: Användaren bekräftade den slutliga sammanfattningen med
”den är redo”. Specen med K-001–K-016 och AK-001–AK-019 är godkänd och
markerad Redo. Implementation har inte beställts.

2026-11-16: Användaren beställde uppdatering med samtalets åtkomstmodell och
paketbidrag. Kompletteringen K-017–K-024 och AK-020–AK-028 ingår i specen;
status är fortsatt Redo. Nya konkreta paketverktyg och deras datamängder
godkänns separat enligt K-021.

## Ändringshistorik

- 2026-11-16: Lagt till K-017–K-024 och AK-020–AK-028 för `McpAccess`,
  gemensam policytolkning, scope-/resurskontroll, användarberoende listning
  och disciplin-/capabilitybidrag med aktiveringskontroll för samma lag.
  Dokumenterat skillnaden mellan aktuellt lag och kontoövergripande listning,
  uppstartsvalidering och kvarstående implementation/verifiering.
- 2026-11-02: Skapat utkast från projektets specmall efter läsning av befintlig
  MCP-pilot, äldre MCP-dokumentation och närliggande specar. Första frågeomgången
  gäller målgrupp, användningsfall, klientstöd och läs-/skrivomfattning.
- 2026-11-02: Sparat svar från omgång 1, lagt till K-001–K-003 och preliminära
  acceptanskriterier. Skrivpilot är fortsatt ett öppet omfattningsbeslut.
- 2026-11-02: Sparat omgång 2 med accepterad läsomfattning och aktivitet som
  skrivpilot (K-004). Dokumenterat elicitation som teknisk möjlighet och
  ChatGPT-stöd/bekräftelseflöde som öppna frågor.
- 2026-11-02: Sparat omgång 3 och K-005–K-008 med acceptanskriterier för
  direktbekräftelse, reservflöde i Förena och skapande högst en gång.
- 2026-11-02: Sparat omgång 4 och K-009–K-011 med acceptanskriterier för
  OAuth, återkallning, åtkomst och avgränsad aktivitetsskrivning.

- 2026-11-02: Sparat omgång 5, K-012–K-016 och AK-013–AK-019. Sammanställt
  specen inför slutbekräftelse; inga nya produktfrågor identifierade.
- 2026-11-02: Användaren slutbekräftade specen. Status ändrad till Redo;
  klientstöd och faktisk ChatGPT-anslutning återstår att verifiera vid implementation.
