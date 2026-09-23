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
- [x] Leverera kallelser/påminnelser via mejl med Resend
- [ ] Leverera även via Web Push när aktiv subscription finns
- [x] Visa leveransstatus per kanal och mottagare i aktivitetsvyn
- [ ] Registrera närvaro som ledare

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
behörighetskontroll för laget. Transport-workern behandlar nu `notification_outbox`, skickar e-post via Resend,
gör retries med backoff och skriver `invitation_sent` respektive
`reminder_sent`. Leveransstatus visas i aktivitetsvyn per kanal och mottagare.
Workern körs via Vercel Cron.
Web Push använder samma leveransmodell men själva push-transporten återstår.

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

- [x] Behörighetskontrollerade läsverktyg för laglista och anmälda deltagare
- [ ] Skapa aktivitet som utkast
- [ ] Lista obesvarade kallelser via gemensamt applikationskommando
- [ ] Föreslå, förhandsgranska och köa påminnelse via gemensamt applikationskommando
- [ ] Anpassningsbart namn och visuell identitet
- [ ] Återanvänd Signal Engine och arbetsytekontext i assistenten
- [ ] Låt UI och assistent anropa samma typade applikationskommandon

## 5. Pilot

- [ ] Import av medlemmar
- [x] Aktivitetsspecifik eventhistorik för kallelser och svar
- [ ] Full revisionslogg och GDPR-funktioner
- [x] Leveransstatus för e-postnotiser
- [ ] Web Push-transport och push-leveransstatus
- [ ] Mobil tillgänglighetsgranskning
- [ ] Pilot med ett lag
