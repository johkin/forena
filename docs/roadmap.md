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
- [ ] Skapa återkommande aktiviteter
- [ ] Skicka kallelser via Web Push och mejl
- [ ] Svara som vårdnadshavare
- [ ] Registrera närvaro som ledare

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
- [ ] Inför en Signal Engine med de första 5-10 signaltyperna
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

- [ ] Behörighetskontrollerade läsverktyg
- [ ] Skapa aktivitet som utkast
- [ ] Lista obesvarade kallelser
- [ ] Förhandsgranska och skicka påminnelse
- [ ] Anpassningsbart namn och visuell identitet
- [ ] Återanvänd Signal Engine och arbetsytekontext i assistenten
- [ ] Låt UI och assistent anropa samma typade applikationskommandon

## 5. Pilot

- [ ] Import av medlemmar
- [ ] Revisionslogg och GDPR-funktioner
- [ ] Leveransstatus för notiser
- [ ] Mobil tillgänglighetsgranskning
- [ ] Pilot med ett lag
