# Roadmap

## 1. Körbar produktgrund

- [x] Next.js, TypeScript och PWA-manifest
- [x] Första domänobjekten och domäntester
- [x] Interaktiv vy för aktivitet och kallelsesvar
- [x] Lokal Supabase-konfiguration och initial databasmigration
- [x] Grundläggande Row Level Security
- [x] Inloggningsflöde, passkey och sessionsuppdatering
- [ ] Databastester för RLS-policyer
- [x] Sektioner och roller på sektions- och lagnivå
- [x] Aktiv arbetsyta och lagcentrerad routing
- [x] Databasdriven lagdashboard med demo-fallback

## 2. Första kompletta föreningsflödet

- [x] Skapa förening och lag
- [x] Bjud in ledare direkt
- [x] Publik medlemsansökan med val av sektion och lag
- [x] Kansligodkännande före e-postverifiering och aktivering
- [x] Sökbar trupp med medlemsprofiler, namnredigering och mobilanpassade undergrupper
- [ ] Komplettera medlemsprofil med bildhantering och administration av verifierade målsmanskopplingar
- [x] Gemensam aktivitetstypskatalog med disciplinspecifika typer och systemadministration
- [x] Kodägt fotbollspaket v1 med separata objektscheman, sektionsuppslag och paketöversikt; se [disciplinpaket](disciplines.md)
- [x] Lagra och redigera fotbollens versionsrefererade värden för lag, lagmedlemskap, match och deltagande med native-formulär, behörighetskontroll och kopierade matchförval
- [ ] Flytta kvarvarande disciplinöverstyrningar till sektion efter konfliktkontroll; paketdefinitioner versionshanteras i kod, administration väljer och konfigurerar paket
- [x] Administrera aktivitetsförval med fältvis arv system/klubb/sektion/lag och revisionskontroll
- [x] Läsbara listval för relativa tider och valbara alternativ i disciplinförval med separat arv
- [x] Läs förval i aktivitetsdialog och ledarassistent; visa ursprung och bevara egna val
- [x] Spara alla schemalagda påminnelser atomärt för nya aktiviteter och serier
- [ ] Bekräftat assistentkommando för att ändra aktivitetsförval
- [x] Skapa och redigera en aktivitet
- [x] Skapa en aktivitetsserie med återkommande aktiviteter
- [x] Förhandsgranska en serie och dess genererade tillfällen före publicering
- [ ] Stöd utkast/publicering som separat livscykel
- [ ] Uppdatera ett tillfälle eller hela den återstående serien
- [x] Schemalägg kallelse, svarstid och påminnelsetid per aktivitet
- [x] Svara som vårdnadshavare för ett eller flera barn
- [x] Ändra eller ta bort ett tidigare kallelsesvar
- [x] Valfri kommentar till ja/nej-svar och kommentar i AI-konteksten
- [x] Modellera "inget svar" som det enda osäkra läget; obesvarade kan påminnas
- [x] Lista obesvarade kallelser och köa manuell påminnelse
- [x] Logga kallelse-, påminnelse- och svarshändelser i aktivitetshistoriken
- [x] Worker för notification outbox med claim, retries och backoff
- [x] Separat beständig schemaläggning för affärsuppgifter; outbox levererar färdiga meddelanden utan omprövning
- [x] Rensa avslutade notifieringar och leveransdetaljer efter 90 dagar när aktiviteten också har avslutats; behåll historikevent
- [ ] Före uppskalning: dimensionera notifieringskön för samtidiga utskick till stora föreningar (nu högst 25 mottagare per minut), parallella workers, lämpliga köindex och övervakning av köfördröjning
- [x] Kör notification worker i Supabase Edge Function
- [x] Schemalägg notification worker med Supabase pg_cron + pg_net
- [x] Leverera kallelser/påminnelser via mejl med Resend
- [x] Visa leveransstatus per kanal och mottagare i aktivitetsvyn
- [x] Skapa och lagra Web Push-subscriptions per användare och enhet
- [x] UI för att aktivera/inaktivera pushnotiser
- [x] VAPID-konfiguration för Web Push
- [x] Skicka Web Push från notification workern
- [x] Hantera ogiltiga/utgångna push-subscriptions (404/410)
- [ ] notificationclick öppnar rätt aktivitet i Förena (klick öppnar appen, men push-payloaden länkar ännu till startsidan)
- [x] Visa push-leveransstatus i aktivitetsvyn
- [x] Registrera närvaro som ledare
- [x] Prioritera oregistrerad närvaro för påbörjade aktiviteter i lagvyn
- [x] Välj personer för omedelbar kallelse och målgrupper för schemalagd kallelse
- [x] Lägg till kallelser när en aktivitet redigeras
- [x] Stöd flera schemalagda påminnelser per aktivitet

### Nästa leverans: smart kallelseflöde

Aktivitets- och kallelsegrunden finns nu på plats. Nästa vertikala leverans ska
göra kallelser operativa hela vägen från schemaläggning till leverans och
uppföljning:

```text
Aktivitet / serie
  -> schemalagd kallelse
  -> notification outbox
  -> mejl / Web Push
  -> svar eller ändrat svar
  -> aktivitets-events
  -> bedömning av lagets läge
  -> föreslagen eller manuell påminnelse
  -> leveransstatus och historik
  -> närvaroregistrering
```

`activity_events` är den gemensamma historiken för kallelser, påminnelser,
svar och aktivitetsändringar. UI:t visar historiken i aktivitetsvyn. Ett ändrat
svar är en normal del av flödet och ska inte kräva att en ledare återställer
kallelsen.

Manuella påminnelser köas endast för obesvarade kallelser och endast efter
behörighetskontroll för laget. Transport-workern körs som en Supabase Edge
Function och triggas varje minut via `pg_cron` + `pg_net`. Den behandlar
`notification_outbox`, skickar e-post via Resend, gör retries med backoff och
skriver `invitation_sent` respektive `reminder_sent`. Leveransstatus visas i
aktivitetsvyn per kanal och mottagare.

Web Push använder samma leveransmodell. Varje användare kan ha flera aktiva
subscriptions, till exempel en iPhone PWA, en Android-enhet och en desktop-
webbläsare. Förena ska lagra subscriptions per användare/enhet och workern ska
skicka till samtliga aktiva subscriptions. Ogiltiga endpoints ska inaktiveras
automatiskt vid exempelvis HTTP 404/410. E-post fungerar som fallback när push
inte är aktiverat eller kan levereras.

Prioriteringen i **För laget** ska därefter bli kontextkänslig. Kallelsesvar är binära (ja/nej) och kan kompletteras med en frivillig kommentar; inget svar betyder att läget fortfarande är osäkert och kan påminnas. Kommentarer kan ge AI-lagret extra kontext, exempelvis önskemål om en annan matchdag. Antalet
obesvarade är inte i sig ett problem: systemet ska väga in exempelvis antal
ja-svar, tid kvar, aktivitetstyp/spelform och redan skickade påminnelser.
Deterministiska regler tar fram signalerna; AI kan rangordna dem, formulera
orsaken och föreslå en tillåten action som `Skicka påminnelse`.

Databastester för RLS-policyerna utvecklas parallellt. Testerna ska minst bevisa
att ledare kan administrera rätt lag, att vårdnadshavare kan svara och ändra
svar för sina kopplade barn, samt att påminnelser inte kan köas för andra lag.

## 3. AI-native arbetsyta

Förena ska inte vara ett traditionellt föreningssystem med en AI-chatt vid sidan
av. AI ska hjälpa användaren att förstå vad som är relevant just nu och översätta
användarens intentioner till säkra, typade systemåtgärder.

Domändata och affärsregler förblir deterministiska. Applikationen tar fram
strukturerade signaler, till exempel kommande match, obesvarade kallelser,
oregistrerad närvaro eller en klubbuppgift med deadline. En AI-baserad
relevansmotor kan rangordna och sammanfatta dessa utifrån användarens roller,
aktiva arbetsyta och aktuell tid. Kritiska signaler och deadlines får inte kunna
försvinna genom en modellbedömning utan ska även skyddas av deterministiska
regler.

Målet är ett flöde ungefär enligt:

```text
Context
  -> Signals / candidates
  -> Deterministic priority rules
  -> AI relevance layer
  -> Personalized feed
  -> Actions / commands
```

UI:t renderar fördefinierade komponenter och actions. Modellen genererar inte
godtyckligt UI och får inte direkt databasåtkomst.

- [ ] Definiera ett strukturerat användar- och arbetsytekontext för AI
- [ ] Inför en Signal Engine med de första 5-10 signaltyperna, inklusive trupp-/kallelseläge
- [x] Definiera schema för AI-rankad personlig feed
- [x] Kombinera deterministiska prioritetsregler med AI-rankning
- [x] Låt lagdashboarden bli första PoC för den personliga feeden
- [x] Visa varför en signal prioriterats och vilken underliggande data den bygger på
- [x] Säkerställ att kritiska uppgifter och deadlines visas oberoende av modellens ranking

### Kontextuella dokument och instruktioner

Dokument ska inte bara ligga i ett dokumentarkiv som användaren själv måste leta
i. Instruktioner och annat innehåll ska kunna kopplas till ett sammanhang och
automatiskt bli relevant för de personer som berörs vid rätt tidpunkt.

Ett dokument kan till exempel beskriva hur ett café öppnas, var varor hämtas,
hur städning görs och hur lokalen låses. I stället för att koppla dokumentet
direkt till enskilda personer kopplas det till exempelvis förening, sektion,
lag, aktivitetstyp och målgrupp. När ett barn schemaläggs på ett cafépass kan
Förena därmed deterministiskt avgöra att barnet och dess vårdnadshavare berörs.

Kopplingen behöver mer än fria taggar. Metadata bör kunna beskriva både
tillämpning, målgrupp och tid, exempelvis:

```text
document: Caféinstruktion
scope: Fotboll
tags: cafe, opening, cleaning
activityType: cafe_shift
audience: assigned_player, guardians
visibleFrom: T-24h
visibleUntil: activity_end
```

Signal Engine kan utifrån detta skapa `DOCUMENT_RELEVANT_NOW` och låta
informationen ingå i den personliga feeden. Samma dokument kan då presenteras
olika beroende på tid: en översikt dagen före passet, öppningsinstruktioner nära
start och städ-/låsinstruktioner mot slutet.

AI kan användas när ett dokument läggs in för att föreslå klassificering,
taggar, aktivitetstyp, målgrupp och lämplig visningstid. En administratör
godkänner kopplingen. Därefter ska själva matchningen mellan dokument,
aktiviteter och mottagare vara strukturerad och deterministisk.

Denna modell bör kunna återanvändas för exempelvis matchvärd, kiosk,
sekretariat, cuper, fotbollsskola, materialförråd, nyckelhantering,
domarvärd, tvätt av matchställ och reseinstruktioner.

- [ ] Inför dokument med scope och strukturerad metadata
- [ ] Definiera taggar och dokumentkopplingar till aktivitetstyper
- [ ] Definiera målgruppsregler, exempelvis schemalagd spelare och vårdnadshavare
- [ ] Stöd tidsregler som T-24h, T-60m och aktivitetens slut
- [ ] Generera `DOCUMENT_RELEVANT_NOW` i Signal Engine
- [ ] Visa kontextuella dokument och checklistor i den personliga feeden
- [ ] Låt AI föreslå metadata och kopplingar när dokument läggs in
- [ ] Kräv administratörens godkännande innan AI-föreslagna kopplingar aktiveras

### LLM-infrastruktur

LLM ska behandlas som utbytbar infrastruktur, inte byggas in direkt i
domänlagret. För den första implementationen används Vercel AI SDK tillsammans
med Vercel AI Gateway. Det gör att samma kod kan användas lokalt och i Vercel
och att modell/provider kan bytas utan att domänlogiken ändras.

En snabb och kostnadseffektiv modell bör vara standard för ranking,
klassificering, sammanfattning och intent detection. Kraftigare modeller används
bara när uppgiften kräver mer resonemang. Modellval görs genom logiska profiler
som exempelvis `feed-ranking`, `assistant` och `complex-reasoning` i stället
för att sprida providerspecifika modellnamn i koden.

Automatiserade tester ska använda en deterministisk mock-provider och inte göra
riktiga LLM-anrop.

- [x] Lägg till Vercel AI SDK
- [x] Konfigurera Vercel AI Gateway för lokal utveckling och produktion
- [x] Skapa provideroberoende modellkonfiguration
- [x] Lägg till mock-LLM för automatiserade tester
- [x] Mät tokenanvändning och latens per AI-funktion samt kostnad via Gateway
- [x] Minimera och strukturera kontext innan data skickas till extern LLM

## 4. Föreningsassistent

Assistenten använder samma kontext, signaler och applikationskommandon som den
personliga arbetsytan. Skillnaden är att användaren själv uttrycker sin intention
i naturligt språk. AI:n får föreslå typade kommandon, men behörighetskontroll,
validering och krav på förhandsgranskning ligger alltid i applikationslagret.

- [ ] Inför gemensam rate limit för assistenten per användare och förening, över klubb-, sektions- och lagingångar och serverinstanser. Utvärdera även token-/kostnadsbudgetar; kontrollera gränser före modell-anrop och ge tydlig återkoppling om när användaren kan försöka igen.
- [x] Behörighetskontrollerade läsverktyg för laglista och anmälda deltagare
- [x] Skapa aktivitet som utkast, med webbsökning för externa evenemang
- [ ] Lista obesvarade kallelser via gemensamt applikationskommando
- [x] Föreslå, förhandsgranska och köa påminnelse via gemensamt applikationskommando
- [x] Använd tillämpliga sparade delade minnen i assistentens påminnelseförslag och visa minneskällorna före bekräftelse
- [ ] Återanvänd minnesstyrd påminnelsebedömning i Signal Engine och den proaktiva lagöversikten
- [ ] Stöd uttryckligen aktiverade strukturerade regler för automatiska kontextkänsliga påminnelser; fritextminnen aktiverar aldrig utskick
- [x] Beständiga capability-signaler med aktiv/löst/avfärdad status, återaktivering, åtgärdshistorik och revisionskontroll; första signalen gäller matchtrupp, visas under För laget och läses av behörig lagassistent
- [x] Återanvändbar `targetTeamSize`-capability: notifiera fotbollslagets kallelsehanterare vid för få ja-svar; ärvd aktivering och valbara kontrolltider från disciplin → sektion → lag, snapshot vid skapande, deduplicering och utvärdering före köläggning
- [ ] Anpassningsbart namn och visuell identitet
- [ ] Återanvänd Signal Engine och arbetsytekontext i assistenten
- [ ] Låt UI och assistent anropa samma typade applikationskommandon

### Deltagande, arbetsrotation och kandidatförslag

Grundprincip: kallelse, anmälan och faktiskt deltagande är olika saker.
Arbetspass tilldelas spelaren; familjen avgör vem som arbetar. Fördelning räknas
per spelare, inte per vuxen eller hushåll. Deltagande ger aldrig lagbehörighet.

Första etappen (denna ändring):

- [x] Sök personer på namn inom klubben från aktivitetsdialogen och visa deras aktuella lag
- [x] Kalla personer från andra lag utan att skapa lagmedlemskap; återanvänd personens målsmän
- [x] Spara roll per aktivitet: spelare, ledare, målsman eller funktionär; fråga när roll behöver väljas
- [x] Låt ledaren lägga till personer som anmälda med tydlig bekräftelse och registrerad avsändare
- [x] Ta med kallade personer från andra lag i närvarolistan och familjens personliga översikt
- [x] Skapa återanvändbara arbetsuppgifter per lag och tilldela dem till spelarnas kallelser
- [x] Visa tilldelad arbetsuppgift för familjen och registrera genomförande separat från kallelsesvaret
- [x] Visa de senaste 20 påbörjade arbetspassen och arbetsuppgifterna för en person inom hanterat lag

Fortsatt utveckling:

- [ ] Gemensamt behörighetskontrollerat historikverktyg för träning, matcher och arbetspass, med tidsperiod och summeringar
- [ ] Skilj saknad närvarorapportering från frånvaro och räkna närvaro från spelarens medlemsstart
- [ ] Kontrollera aktivitetskrockar inklusive samlingstid vid kandidaturval och före kallelse; skilj anmäld från obesvarad kallelse
- [ ] Beskriv krockar som varningar och ”ingen känd krock”, aldrig garanterad tillgänglighet; begränsa detaljer från andra lag
- [x] Föreslå spelare till arbetspass utifrån få/inga genomförda pass och rotera tidigare arbetsuppgifter, exempelvis städning
- [ ] Föreslå matchuttagning utifrån träningsnärvaro, tidigare matchfördelning och krockar
- [x] Hitta registrerad träningsnärvaro för spelare från andra lag under vald period (historisk lagtillhörighet, inte bevis för ett formellt rotationsupplägg)
- [ ] Spara lagets urvalsprinciper och tidsperiod inom klubbens riktlinjer; visa underlag och motivering per kandidat
- [ ] Ge assistenten läs- och förslagsverktyg över samma applikationskommandon; ledaren granskar och justerar innan utskick
- [ ] Visa uppdateringsbar flödeshändelse för ordinarie ledare när spelare kallas till annat lag, svarar eller kallelsen återtas
- [ ] Stöd tidsbegränsat utlån (”lease”): avsändande ledare gör utvalda spelare direkt valbara för mottagande lag
- [ ] Bestäm utlånets giltighetsperiod, godkännande, återkallning och synlighet; utlån ska varken vara automatisk kallelse eller lagbehörighet
- [x] Separata uppgifter med tidsintervall, deadline eller ingen tid samt lediga platser
- [x] Generera bemanningsschema med passlängd, antal platser och öppnings-/stängningsinstruktioner
- [x] Familjer kan boka för egna barn och föreslå ändring genom ActivityDutyChangeRequest
- [x] Atomära byten, valbart ledargodkännande, självservicegräns, återtagning och revisionskontroll
- [x] Notifiera berörda familjer och ledare om ändringsförslag och beslut
- [x] Administrera namnändring/inaktivering och redigera/radera publicerade behov med bevarad historik
- [ ] Kalenderexport/prenumeration för enskilda arbetspass (uppskjuten)

För utlån är tills vidare arbetshypotesen att F2016:s ledare erbjuder en grupp
spelare till F2015 under en period. F2015 ser dem i personvalet utan namnsökning.
Detaljerna beslutas före implementation. Den första etappen skickar inte
flödesnotiser till andra ledare och innehåller inte AI-urval eller krockkontroll.

### Administrerbara skills per arbetsyta

Assistenten ska kunna använda versionshanterade skills: strukturerade
instruktioner som beskriver när ett föreningsflöde är relevant, vilka frågor
som behöver besvaras och vilka befintliga kommandon som kan föreslås. De är
vägledning för assistenten, inte nya behörigheter eller exekverbar kod.

Skills kan administreras på fyra nivåer: **plattform**, **klubb**, **sektion**
och **lag**. Plattformen tillhandahåller gemensamma flöden, medan behöriga
administratörer kan lägga till eller anpassa lokala rutiner. Assistenten får
bara läsa skills som gäller den aktiva arbetsytan och användarens behörighet.
Arv och företräde ska vara tydligt: lagets anpassning går före sektionens,
sektionens före klubbens och klubbens före plattformens för samma skill.
Säkerhetsregler, behörighetskontroll och krav på användarens godkännande kan
aldrig åsidosättas av en lokal skill. Administratören ska kunna förhandsgranska,
publicera, inaktivera och återgå till en tidigare version; ändringar loggas.

Exempel: En ledare skriver ”Jag vill skapa en intresseanmälan för att delta på
Aroscupen”. Assistenten känner igen cupflödet, undersöker befintlig information
om cupen och lagets lokala rutin, och frågar efter saknade uppgifter som lag,
åldersklass, datum, preliminär kostnad, svarstid och vem som ska tillfrågas.
Den föreslår ett utkast till intresseanmälan med tydlig skillnad mellan
**intresse** och bindande anmälan till arrangören. Ledaren granskar mottagare,
text och svarsalternativ före utskick. Därefter kan assistenten sammanställa
svaren och föreslå nästa steg, till exempel ett beslut eller en faktisk
cupanmälan. Den skickar inte kallelser eller anmäler laget externt på egen hand.

- [ ] Definiera skill-schema för trigger/intention, scope, frågor, källor, steg och tillåtna kommandon
- [ ] Bygg administration med rollstyrd publicering och versionshistorik på alla fyra nivåer
- [ ] Definiera arv, prioritet och konflikthantering för lokala anpassningar
- [ ] Välj relevanta skills från aktiv arbetsyta utan att blanda data mellan föreningar
- [ ] Stöd förhandsgranskning av assistentens plan och utkast före systemåtgärder
- [ ] Implementera intresseanmälan till cup som första genomgående exempel


### Plugins, disciplinscheman och utökningar

Planerad riktning: Förena ska kunna utökas av både egna och externa plugins
med data, funktionalitet och GUI. Börja med deklarativa utökningar och ett litet
förstapartstillägg som använder samma kontrakt som framtida externa tillägg.
Gröna kortet är en möjlig första kandidat; spelarutveckling är ett större exempel. Exekverbar tredjepartskod kräver separat isolering och ett
begränsat API; den ska inte få direkt databasåtkomst eller köras med Förena-
applikationens fulla rättigheter.

#### Scheman och administration

Ett versionshanterat disciplinpaket innehåller separata JSON Schema-definitioner
för sektion, lag, lagmedlemskap, aktivitet och aktivitetsdeltagande. Deltagande
kan innehålla matchposition och tröjnummer före matchen; faktisk närvaro är en
separat uppgift. Personer hålls klubbavgränsade och återanvänds mellan klubbens
lag; tröjnummer och ordinarie position hör normalt till lagmedlemskapet.

JSON Schema beskriver typer och validering. UI-metadata beskriver ordning,
etiketter och komponenter; serverstyrda applikationsregler hanterar behörighet,
förval och betydelsen för beräkningar. Spelformer och roller behöver stabila
identifierare. Ett nytt fält ger inte automatiskt ny domänlogik. Avstängningar
som påverkar uttagning behöver exempelvis en egen modell för giltighet och
omfattning, inte enbart ett extra datumfält.

Disciplinpaket och scheman versionshanteras i källkod och ändras genom granskade
leveranser. Administrationen ska erbjuda paketval, konfiguration,
förhandsgranskning och kontrollerade uppgraderingar; klubbarna väljer förval
och fyller i värden. En generell schemaeditor är uppskjuten. Schema per objekttyp ska
skiljas från arv av förval. Exempelvis kopieras lagets normala spelform till en
ny match; ändrade lagförval eller publicerade scheman skriver aldrig automatiskt
om befintliga aktiviteter.

#### Installationer, data och versioner

Varje klubb aktiverar en egen plugininstallation med konfiguration, beviljade
behörigheter, aktiverade funktioner och migreringsstatus. Utgångspunkten är
gemensamma extension-tabeller med separata namnutrymmen per plugin och klubb,
validerad JSONB och verifierade kopplingar till berörda objekt. En post anger
installation, datatyp, schemaversion, objekt, tidpunkt och avsändare. Kontrollera
både objektets existens, klubbtillhörighet och anroparens åtkomst; ett fritt
objekt-id är inte tillräckligt. Egna tabeller kan senare motiveras av särskilda
sök- eller volymbehov.

Första versionen kör en kodversion per plugin och Förena-instans, med uttryckligt
stöd för flera schema-/dataversioner. Klubbar kan använda olika konfigurationer
och migreras stegvis inom kodens stödda versioner. Manifestet anger kompatibla
Förena-API- och schemaversioner. Parallella kodversioner skjuts upp tills det finns
ett konkret behov. Återställning av kod återställer inte migrerade data.

#### Verktyg och MCP

Plugins ska kunna registrera typade läs-, analys- och förslagsverktyg i ett
gemensamt verktygsregister. Manifestet anger stabila verktygsnamn med pluginens
namnutrymme, in-/utdatascheman, nödvändiga rättigheter och eventuella sidoeffekter.
GUI och assistent använder samma applikationskommandon. Tillgängliga verktyg
filtreras efter aktiv installation, arbetsyta och användarbehörighet; varje
anrop kontrolleras på nytt på servern.

Utvalda verktyg ska även kunna exponeras genom Förena-MCP enligt
[MCP-serverns behörighetsmodell](mcp.md). Tools är funktionernas kontrakt och
MCP är ett sätt att göra dem åtkomliga för externa klienter; varje plugin behöver
inte en egen MCP-server. MCP-exponering väljs uttryckligen och får inte automatiskt
göra all intern plugindata tillgänglig. Befintligt MCP-stöd för läsning och utkast
utökas först när motsvarande behörighets- och bekräftelseflöden finns.

Utvärdera separat möjligheten att ansluta en extern plugins MCP-server som
verktygsleverantör till Förena. Sådana anslutningar behöver godkända endpoints,
separata begränsade autentiseringsuppgifter och tydliga regler för vilka data
som får lämna klubben. Förena-token eller privilegierade databasnycklar får
inte vidarebefordras. Verktygsresultat behandlas som data, inte instruktioner
som kan ändra behörigheter eller godkännandekrav.

Skrivningar och utskick följer Förena-kommandonas validering och krav på
förhandsgranskning/bekräftelse. Pluginverktyg får inte kringgå dessa via GUI,
assistent eller MCP. Planera revisionslogg, anropsgränser, timeout och återkallning
av åtkomst när en installation inaktiveras.

#### Första exempel

Gröna kortet är en möjlig liten första plugin: val av spelare på en match,
med separat aktivering och tydlig tilläggspanel. Den är uttryckligen uppskjuten
och ingår inte i fotbollsdisciplinens native-fält. Disciplinfält integreras i
ordinarie formulär; plugins visar namn och ursprung som tillägg.

Spelarutveckling är ett större efterföljande exempel.

En förstapartsplugin definierar färdigheter och skalor per disciplin, registrerar
daterade bedömningar och visar radardiagram (spider-diagram) samt utveckling över
tid. Bedömningar lagras som historiska poster med bedömare och version av
färdighetsmodellen. Ändrade skalor får inte ge sken av direkt jämförbara värden.
Synlighet för bedömningar styrs separat från åtkomst till den vanliga truppen.

Pluginen kan bidra med en utvecklingsflik på spelarprofilen, en lagvy och
verktyg för att läsa utveckling och föreslå kompletterande spelarkombinationer.
Förslagen visar underlag, osäkerhet och ledarens valda mål; ledaren granskar
och beslutar före eventuell uttagning eller kallelse.

- [ ] Definiera pluginmanifest, stabila ID:n, kompatibilitet och installation per klubb
- [x] Definiera första kodägda disciplinpaketet (fotboll) med separata objektscheman, UI-metadata och uttryckliga förval
- [ ] Bygg paketadministration för val, konfiguration och uppgraderingar; schemaändringar levereras via granskad källkod
- [ ] Inför extension-lagring och API med verifierade objektreferenser, schema-/dataversion och klubb-/lagisolering
- [ ] Definiera kontrollerade GUI-platser för flikar, paneler och actions; återanvänd mobile-first-komponenter
- [ ] Definiera typade pluginverktyg som delar kommandon med GUI och assistent
- [ ] Exponera uttryckligen godkända pluginverktyg via Förena-MCP med samma åtkomst- och bekräftelsekrav
- [ ] Utvärdera externa MCP-servrar som isolerade verktygsleverantörer med begränsad dataåtkomst
- [ ] Bygg installationsadministration för aktivering, behörigheter, uppgraderingar och inaktivering
- [ ] Definiera migrering, bakåtkompatibilitet, återställning samt export/radering vid avinstallation
- [ ] Verifiera isolering mellan klubbar och plugins samt nekade verktygsanrop efter återkallad åtkomst
- [ ] Implementera spelarutveckling med historiska bedömningar och radardiagram som större pluginexempel
- [ ] Lägg därefter till förslag på spelarkombinationer med synligt underlag och ledarbeslut

### Brand Kit och AI Content Studio

När CMS-liknande innehåll och visuell identitet finns på plats ska Förena kunna
använda samma profil både i gränssnittet och för kommunikationsmaterial. Ett
**Brand Kit** definieras på plattforms-, klubb-, sektions- och lagnivå med
kontrollerat arv. Det kan innehålla logotyper, färgpalett, typografi,
bildmanér, tonalitet och regler för grafiska element.

AI ska kunna analysera exempelvis en uppladdad klubb-/lagbild eller logotyp och
föreslå strukturerade design tokens. Förslaget ska förhandsgranskas och
godkännas innan det publiceras. AI:n ska inte generera godtycklig CSS; Förena
applicerar godkända tokens genom sitt designsystem och validerar bland annat
kontrast och tillgänglighet.

Samma Brand Kit ska kunna användas i ett **AI Content Studio** för att skapa
enhetligt PR- och kommunikationsmaterial: matchannonser, resultatbilder,
cupmaterial, rekryteringsinlägg, fotbollsskola, webb-banners och affischer.
Generativa bildmodeller kan skapa bakgrunder/illustrationer, medan text,
datum, logotyper och sponsorlogotyper läggs på deterministiskt från mallar så
att innehållet blir korrekt och konsekvent. En kampanj ska kunna renderas till
flera format, exempelvis Instagram-inlägg, Story, webb och A4.

Design/rendering ska ligga bakom ett provideroberoende gränssnitt, exempelvis
`DesignProvider`. Förena kan ha en egen enkel renderer och integrera externa
tjänster utan att domänmodellen blir beroende av dem. **Canva** är en möjlig
första extern provider: Förena fyller Brand Templates med strukturerad
förenings- och aktivitetsdata och användaren kan därefter fortsätta redigera
designen i Canva.

Assistenten ska kunna använda detta kontextuellt, exempelvis ”Gör ett
Instagraminlägg om söndagens match”. Förena hämtar då korrekt aktivitet,
lag/motståndare, tid, plats och Brand Kit, skapar text och eventuell bild,
väljer mall och visar resultatet för granskning före export eller publicering.

- [ ] Definiera Brand Kit-schema med logotyp, design tokens, typografi, bildmanér och tonalitet
- [ ] Stöd arv och overrides för Brand Kit på plattform/klubb/sektion/lag
- [ ] Låt AI föreslå tema/design tokens från uppladdad logotyp eller referensbild
- [ ] Validera tillgänglighet och kontrast innan ett AI-föreslaget tema kan publiceras
- [ ] Bygg mallbaserad Content Studio för match-, cup-, rekryterings- och kampanjmaterial
- [ ] Stöd AI-genererade bakgrunder/illustrationer separat från deterministisk text och logotyp-layout
- [ ] Rendera samma innehåll till flera format (sociala medier, webb och utskrift)
- [ ] Definiera provideroberoende `DesignProvider` för externa design-/renderingtjänster
- [ ] Utvärdera Canva Brand Templates/Autofill som första externa designprovider
- [ ] Låt assistenten skapa utkast till PR-material från befintlig aktivitets- och föreningsdata
- [ ] Kräv förhandsgranskning före export/publicering och logga publiceringsåtgärder

## 5. Pilot

- [ ] Import av medlemmar
- [x] Aktivitetsspecifik eventhistorik för kallelser och svar
- [ ] Full revisionslogg och GDPR-funktioner
- [x] Leveransstatus för e-postnotiser
- [x] Web Push-transport och push-leveransstatus i koden
- [ ] Testa Web Push på iPhone PWA, Android och desktop
- [ ] Verifiera e-postfallback när push saknas eller misslyckas
- [ ] Mobil tillgänglighetsgranskning
- [ ] Pilot med ett lag


Assistenten har läsverktyg för behöriga lags historik: träning/match via
`attendance.manage`, arbetspass via `invitation.manage`. Frågan avgränsas till
366 dagar och högst 200 person/aktivitetsposter med explicit begränsningsflagga.
Automatiskt kandidaturval, närvaroprocent och fullständiga nollistor återstår.

- [x] Ersätt `activity_defaults` med kodägda disciplingrundförval och separata sektions-/lagtabeller med mål-FK, disciplinversion och revisionskontroll; ingen värdemigrering före drift.
