# Roadmap

## 1. Körbar produktgrund

- [x] Next.js, TypeScript och PWA-manifest
- [x] Första domänobjekten och domäntester
- [x] Interaktiv vy för aktivitet och kallelsesvar
- [x] Lokal Supabase-konfiguration och initial databasmigration
- [x] Grundläggande Row Level Security
- [ ] Inloggningsflöde och sessionsuppdatering
- [ ] Databastester för RLS-policyer
- [x] Sektioner och roller på sektions- och lagnivå
- [x] Aktiv arbetsyta och lagcentrerad routing
- [x] Databasdriven lagdashboard med demo-fallback

## 2. Första kompletta föreningsflödet

- [ ] Skapa förening och lag
- [ ] Bjud in ledare och vårdnadshavare
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
- [ ] Definiera schema för AI-rankad personlig feed
- [ ] Kombinera deterministiska prioritetsregler med AI-rankning
- [ ] Låt lagdashboarden bli första PoC för den personliga feeden
- [ ] Visa varför en signal prioriterats och vilken underliggande data den bygger på
- [ ] Säkerställ att kritiska uppgifter och deadlines visas oberoende av modellens ranking

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

- [ ] Lägg till Vercel AI SDK
- [ ] Konfigurera Vercel AI Gateway för lokal utveckling och produktion
- [ ] Skapa provideroberoende modellkonfiguration
- [ ] Lägg till mock-LLM för automatiserade tester
- [ ] Mät tokenanvändning, latens och kostnad per AI-funktion
- [ ] Minimera och strukturera kontext innan data skickas till extern LLM

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
