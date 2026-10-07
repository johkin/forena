# Säkerhetsarkitektur

Förena hanterar uppgifter om barn, vårdnadshavare, ledare och andra medlemmar.
Det kan även finnas personer med skyddade personuppgifter. Säkerhet och
integritet är därför en del av domänarkitekturen och inte enbart ett lager runt
applikationen.

Målet är defence in depth: ett fel i ett säkerhetslager ska inte automatiskt
innebära att information exponeras.

## Grundprinciper

- Samla bara in personuppgifter som behövs för en konkret funktion.
- Ge varje användare minsta nödvändiga behörighet.
- Härled organisation och åtkomst från den autentiserade användaren; lita inte
  på ett organization-, team- eller person-id enbart för att klienten skickar det.
- Kontrollera behörighet både i applikationslagret och i databasen med RLS.
- Logga säkerhetsrelevanta läsningar, inte bara ändringar.
- Använd inte produktionsdata i utvecklings- eller testmiljöer.
- Skicka minsta möjliga mängd persondata till externa tjänster, inklusive LLM.
- Behandla skyddade personuppgifter som en särskild säkerhetsklass.

## Dataklassning

Information bör klassificeras så att åtkomstregler kan uttryckas utifrån både
användarens roll och informationens känslighet.

```text
PUBLIC
  Publik klubb- och föreningsinformation.

MEMBER
  Information avsedd för föreningens medlemmar.

TEAM
  Lagets aktiviteter, deltagare och intern information.

PERSONAL
  Kontaktuppgifter, vårdnadshavarkopplingar och annan personlig information.

RESTRICTED
  Skyddade personuppgifter och annan information som kräver särskilt begränsad
  åtkomst.
```

Behörighetskontrollen bör därför utvecklas mot ABAC i kombination med RLS:

```text
WHO?       user, role, organization, section, team
WHAT?      data classification
WHY?       purpose / operation
CONTEXT?   normal access / elevated access / break-glass
```

## Separera identitet från verksamhetsdata

Domändata ska så långt som möjligt referera till opaka identifierare i stället
för att duplicera namn, personnummer, adress och kontaktuppgifter.

```text
                    Förena
                      |
             +--------+--------+
             |                 |
       domain data        Identity Vault
             |                 |
       activities etc.   identity/contact
             |           restricted data
             +---- opaque person_id ----+
```

En aktivitet behöver normalt känna till `person_id` eller `participant_id`,
inte personnummer eller bostadsadress. Identitetsuppgifter hämtas separat först
när den aktuella funktionen och användarens behörighet kräver det.

Det bör utredas om Identity Vault ska vara en logisk säkerhetsgräns i samma
databas eller en starkare fysisk separation. RESTRICTED-data ska inte spridas
till den vanliga domänmodellen.

## Skyddade personuppgifter

Skydd får inte implementeras enbart som en flagga på en vanlig medlemsrad.
Systemet ska kunna begränsa vilka uppgifter som över huvud taget exponeras.

En ledare kan exempelvis behöva se att en spelare deltar och kunna initiera
kontakt via Förena utan att få tillgång till adress, personnummer eller privata
kontaktuppgifter.

När RESTRICTED-data verkligen behöver visas bör Förena stödja ett kontrollerat
break-glass-flöde:

```text
request restricted data
        |
step-up authentication / MFA
        |
purpose / reason
        |
authorization
        |
minimum necessary data
        |
security audit event
```

Åtkomst till RESTRICTED-data ska kunna följas upp. Auditloggen bör registrera
vem som läste vilken typ av uppgift, när, i vilket sammanhang och med vilket
angivet syfte, utan att själv duplicera den känsliga informationen.

Även indirekta uppgifter måste betraktas som potentiellt avslöjande. Lag,
skola, aktivitet, plats, familjerelationer, telefonnummer och kommande
aktiviteter kan tillsammans avslöja en persons identitet eller vistelseort.

## Multi-tenant-isolering

RLS är en viktig säkerhetsgräns men ersätter inte applikationsbehörighet.

```text
Browser
   |
Authentication
   |
Next.js / application layer
   |-- authorization / ABAC
   |-- domain rules
   |
Supabase
   |-- RLS
   |-- constraints
   +-- protected storage
```

CI ska innehålla negativa isolationstester. Exempel:

- användare i organisation A kan inte läsa organisation B,
- lagledare för F2016 kan inte automatiskt läsa F2015,
- gissade eller manipulerade UUID:n ger inte åtkomst,
- API-routes kan inte kringgå RLS,
- Storage-filer följer samma tenant- och behörighetsmodell,
- RESTRICTED-data kräver uttrycklig förhöjd behörighet.

Dessa tester är säkerhetskrav och ska köras kontinuerligt.

## AI och externa modeller

AI får inte ha direkt databasåtkomst. AI använder strukturerat kontext som
byggts av Förena efter vanlig behörighetskontroll.

Feed-ranking behöver normalt inte känna till en persons riktiga identitet:

```json
{
  "signal": "ACTIVITY_SOON",
  "participant": "child-42",
  "startsInHours": 22,
  "userRelationship": "guardian"
}
```

Grundregeln är att personuppgifter inte skickas till extern LLM om den aktuella
funktionen inte behöver dem. RESTRICTED identity data skickas aldrig till extern
LLM som standard.

AI-kontext ska vara:

1. behörighetsfiltrerat,
2. dataminimerat,
3. strukturerat,
4. kortlivat,
5. möjligt att auditera på metadata-nivå.

Provideravtal, lagringspolicy, geografisk behandling och eventuell användning av
kunddata för modellträning måste granskas innan riktiga medlemsuppgifter skickas
till en extern AI-provider.

## Notiser, e-post och dokument

Pushnotiser och e-post kan exponera information utanför Förena, exempelvis på en
låsskärm. För känsliga sammanhang ska notisen därför kunna vara generell:

```text
Du har ny information om en aktivitet i Förena.
```

Detaljer visas efter autentisering i applikationen.

Dokument och bilder ska använda åtkomststyrd lagring och kortlivade signerade
länkar där det är lämpligt. Uppladdade bilder bör saneras från metadata som GPS-
och annan EXIF-information när sådan metadata inte uttryckligen behövs.

## Autentisering och sessionssäkerhet

Inför pilot med riktiga användare bör minst följande finnas:

- MFA eller passkeys för privilegierade roller,
- stöd för step-up authentication för särskilt känsliga operationer,
- kortlivade och revokerbara sessioner,
- säkra HttpOnly/Secure/SameSite-cookies,
- rate limiting och skydd mot credential stuffing,
- CSRF-skydd och strikt Content Security Policy,
- möjlighet att snabbt återkalla användarsessioner och andra credentials.

Supabase service-role credentials och motsvarande privilegierade nycklar får
aldrig exponeras i browsern.

## Miljöer och drift

Produktion, test och utveckling ska vara separerade. Produktionsdatabaser och
backuper får inte kopieras till utvecklingsmiljö som bekvämlighetslösning.
Tester använder syntetiska personer.

Driften bör ha:

- krypterade och åtkomstkontrollerade backuper,
- secret scanning och dependency scanning i CI,
- loggning och larm för misstänkta åtkomstmönster,
- larm för ovanligt stora medlemsregisterläsningar,
- möjlighet att snabbt begränsa eller stänga komprometterade konton,
- definierad incidenthantering,
- regelbunden återställningstest av backup,
- säkerhetsgranskning och penetrationstest före bred lansering.

## Personnummer, LOK-stöd och dataminimering

Förena behöver kunna hantera fullständigt personnummer när det finns ett
konkret verksamhetskrav, särskilt för underlag och rapportering av LOK-stöd.
Dataminimering innebär därför inte att personnummer alltid kan undvikas, utan
att uppgiften isoleras och endast används av de funktioner som behöver den.

Personnummer ska behandlas som identitetsdata i Identity Vault och inte vara en
vanlig egenskap som sprids genom domänmodellen. Aktiviteter, kallelser,
närvarolistor, cafépass, den personliga feeden och AI-funktioner ska normalt
arbeta med opaka `person_id` och inte läsa personnummer.

Ett LOK-flöde kan däremot ges en särskild, snäv behörighet:

```text
LOK-underlag / rapportering
        |
authorized application service
        |
Identity Vault ---- personnummer
        |
attendance / activity data
        |
LOK-underlag
```

Vanliga användare behöver inte få se personnumret bara för att Förena behöver
lagra det. UI:t bör där det är möjligt visa exempelvis att en persons identitet
är verifierad eller att nödvändiga LOK-uppgifter finns, utan att exponera själva
personnumret.

Personnummer bör skyddas med applikations- eller fältnivåkryptering så att ett
rent databasläckage inte automatiskt exponerar klartextvärden. Krypteringsnyckeln
ska hållas separat från databasen och åtkomst till dekryptering ska vara
begränsad till uttryckligen behöriga tjänster och operationer. Exakt
nyckelhantering och krypteringslösning ska beslutas innan verkliga personnummer
lagras.

För personer med skyddade personuppgifter ska vanliga användare inte heller
behöva se skyddsstatus eller orsaken till att vissa uppgifter är begränsade.
LOK-funktioner och andra uttryckligen behöriga processer kan hantera nödvändig
identitetsinformation utan att den exponeras i den normala användarupplevelsen.

Varje personfält ska fortfarande kunna motiveras utifrån en produktfunktion.
Bostadsadress, historiska kontaktuppgifter och andra uppgifter ska inte samlas in
enbart för att de kan vara användbara senare.

Information som inte lagras kan inte läcka från Förena, och information som
måste lagras ska hållas inom minsta möjliga säkerhets- och behörighetsgräns.

## Säkerhet före pilot

Följande betraktas som blockerande säkerhetsarbete innan pilot med verkliga
medlemsuppgifter:

- [ ] Definiera dataklassningen PUBLIC/MEMBER/TEAM/PERSONAL/RESTRICTED
- [ ] Definiera Identity Vault och separationen mellan identitet och domändata
- [ ] Definiera kryptering och separat nyckelhantering för personnummer
- [ ] Begränsa personnummer till särskilt behöriga identitets- och LOK-flöden
- [ ] Definiera särskild modell för personer med skyddade personuppgifter
- [ ] Implementera och testa tenant-isolering och RLS med negativa tester
- [ ] Inför central applikationsbehörighet ovanpå RLS
- [ ] Inför audit av läsningar av RESTRICTED-data
- [ ] Inför step-up/break-glass för särskilt känslig åtkomst
- [ ] Inför AI-dataminimering och regler för extern LLM
- [ ] Säkra Storage, dokument och signerade länkar
- [ ] Definiera säker notis- och e-postpolicy
- [ ] Inför secret/dependency scanning och säkerhetslarm
- [ ] Definiera incidenthantering och återkallning av sessioner
- [ ] Genomför säkerhetsgranskning och penetrationstest före bred lansering

## Fortsatt arbete

Den här arkitekturen ska hållas synkroniserad med datamodell, RLS-policyer,
AI-arkitektur och roadmap. Nya funktioner som introducerar personuppgifter ska
beskriva vilken dataklass de använder och varför informationen behöver lagras.

## MCP-åtkomst

MCP-adaptern verifierar explicit bearer-token för en användare och använder en
request-lokal Supabase-klient med publishable key och samma token. Cookie-auth
eller service role accepteras inte. Verktygen kontrollerar aktuell lagbehörighet
och RLS gäller för samtliga läsningar. Familjer får endast egna kallelsesvar;
trupp- och deltagarnamn kräver särskilda lagbehörigheter. Privata kommentarer,
kontaktuppgifter, personnummer och assistentminnen exporteras inte. Verktygen
skriver inte verksamhetsdata och aktivitetsförslag kräver granskning i appen.

MCP-anrop loggas med verktygsnamn, användar-id, utfall och latens utan token,
argument eller medlemsdata. Origin begränsas till appens konfigurerade URL och
svar får inte cachas. Bearer-token-stöd är första steget; klientbundet OAuth,
scopes, samtycke och omedelbar sessionsåterkallning återstår. Se [MCP](mcp.md).


## Aktivitetsdeltagare över laggränser

Klubbens namnsökning kräver `invitation.manage` för målaktivitetens lag och
returnerar endast person-ID, namn, aktuella lagnamn och rollförslag. Den ger
inte tillgång till andra lags kallelsesvar, kontaktuppgifter eller historik.
Sökningar loggas med aktivitet och antal träffar, utan söksträng eller namn.
Samma förening verifieras igen i det atomära skrivkommandot. En aktivitetsroll
skapar aldrig medlemskap eller åtkomstprofil. Familjens svarsrätt består.

En trigger skyddar kallelsens identitet och nya deltagarmetadata mot ändring
av familjer via Data API. Arbetsuppgift måste tillhöra aktivitetens lag och
förening; genomförande kräver ett påbörjat, ej inställt arbetspass. Namnkatalogen
har RLS, explicita grants och saknar direkt uppdaterings-/raderingsrätt för
klienter, så tidigare historik kan inte oavsiktligt döpas om eller raderas.

Bemanningsschemats tabeller saknar direkta klientgrants. RPC:er filtrerar
familjeidentiteter, verifierar rätt att boka för personen och låser aktiviteten
under varje ändring. Förslag gäller specifika platsrevisioner och kan inte
återanvändas mot senare tilldelningar. Se [bemanningsschema](activity-duty-schedule.md).

Bemanningsändringar och fördelningsförslag använder explicita lagbehörigheter,
aktivitetslås och revisionskontroller. Statistik lämnas bara till ledare för
aktuellt lag och räknar enbart dess genomförda uppgifter. Den tidigare
kommandofunktionen ligger privat utan klient-EXECUTE så att inaktiverade platser
inte kan nås via en äldre RPC. Notifieringsköer skapas i samma transaktion som
ändringen, dedupliceras per händelse och mottagare och innehåller inga andra
familjers namn. Avbokning sparar tidigare platser i audit-loggen.

## Lagets kontaktlista

`team_contact_directory` ger en avgränsad kontaktlista till inloggade
föreningsmedlemmar med aktuellt eget lagmedlemskap, aktuell målsmanskoppling
till lagmedlem eller `roster.manage`. Andra lag och anonyma besökare nekas.
Listan innehåller namn, lagroller, ledarens e-post och målsmännens namn,
e-post och registrerade telefonnummer. Spelares konto-e-post, användar-ID,
födelsedata och kallelsesvar ingår inte. Befintlig RLS för person- och
målsmanstabeller breddas inte. Läsningar auditeras utan kontaktdata.

## Assistentens kallelser mellan lag

Kallelseläsningen kräver `invitation.manage` för både källag och mottagarlag i
aktuell klubb, verifierat vid varje anrop. Den använder användarens Supabase-klient
med RLS, organisationsfilter och minimerade kolumnurval. Person-ID används endast
internt för summering; modellen får antal och aktivitetsinformation, inte
kontaktuppgifter eller svarskommentarer. En familjs åtkomst till sitt barns
kallelse ger inte åtkomst till ett fullständigt lagantal. Nekad åtkomst och
misslyckad läsning rapporteras som fel, aldrig som noll kallade.

## Assistentens aktivitetshistorik

Historikverktygen kontrollerar lagbehörighet vid varje anrop. Träning och match
kräver `attendance.manage`; arbetspass kräver `invitation.manage`. Assistenten
kan bara välja tillåtna lag i aktuell klubb. RPC:n verifierar också behörighet
själv. Kontaktuppgifter, födelsedata, svarskommentarer och konto-ID skickas inte
till modellen. Historiska lagnamn hämtas inom samma klubb, och mottagarlagets
händelser ger inte åtkomst till andra lags aktivitetshistorik. Läsningar
auditeras med period och kategori, utan namn eller resultatdata.

Svaret skiljer rapporterad närvaro, oregistrerad närvaro, obesvarad/ja/nej-kallelse
och genomförda arbetsuppgifter. Saknad rapport är okänd närvaro. Högst 200
poster returneras med totalantal och `truncated`; assistenten måste redovisa
begränsningen. Det finns ingen skrivfunktion eller automatisk kallelse.

## Verifiering före ansökningsgranskning

Ansökningar med `review_status = draft` och deras målsmän är osynliga även för
kansliet genom RLS. Gamla publika `submit_membership_application` är återkallad
för `anon` och `authenticated`; serverns RPC:er kan endast köras med service role.
Verifieringsbevis och källa kan inte ändras av kansliet genom tabell-UPDATE.
Servern härleder identiteten från verifierad session. Undantaget för befintliga
medlemmar kontrolleras mot `auth.users.email_confirmed_at`, adress och faktisk
föreningstillhörighet; inga användarredigerbara metadata används.

256-bitars slumpmässiga verifieringstoken skickas endast via mejl. Databasen
lagrar SHA-256-hash, giltighetstid, förbrukning och ersättning; tabellen har RLS
utan klientpolicyer eller klientgrants. Länkförbrukning och omskick låser ansökan
före token för att undvika samtidiga verifieringar/rotationer. Utskicksgränserna
serialiseras gemensamt över alla föreningar. Omskick ger samma publika svar för okänd ansökan,
fel adress och överskriden gräns. Verifieringssidan skickar ingen Referer och är
markerad för att inte indexeras. Mejlet innehåller inga barnuppgifter och loggar
innehåller inte token, mejladress eller mejlleverantörens svarskropp.

Verifiering visar tillgång till målsman 1:s adress, inte identitet eller att andra
uppgifter är riktiga. Målsman 2 verifieras fortfarande separat vid aktivering
efter kansliets godkännande. Äldre ansökningar undantas för att bevara redan
påbörjad granskning och får tydlig markering om saknat verifieringsunderlag.
Service role krävs nu även för att spara den publika ansökan. Konfigurera
`SITE_URL` till appens kanoniska adress och behåll `RESEND_API_KEY` och
`RESEND_FROM_EMAIL`; inga nya hemligheter behövs.

### Gemensam budget för verifieringsmejl

`prepare_membership_application_verification` reserverar utskicket i samma
transaktion som token. Både nya ansökningar och omskick delar ett rullande tak
på **100 verifieringsmejl per timme för hela installationen**. Varje mottagare
har dessutom en minuts spärr mellan utskick och högst tre per timme över alla
föreningar. Gränserna kan inte multipliceras genom byte av klubb, mottagare,
appinstans eller nya ansöknings-ID:n. Ett globalt transaktionslås serialiserar
kontroll och reservation; det hålls inte under nätverksanropet till Resend.
Misslyckade leveranser och ersatta/förbrukade länkar räknas också i budgeten.
Inga klientuppgivna gränsvärden eller IP-adresser används. Taket är ett medvetet
kostnads-/missbruksskydd; en eventuell höjning görs genom en granskad migration.
Vid fullt tak skickas inget mejl och inga länkar ersätts. Ett nekat nytt inskick
rullar tillbaka hela ansökan. Omskick behåller sitt generiska publika svar.

### Driftsättning och återställning av verifieringsflödet

Detta är en inkompatibel ändring för appversioner före verifieringsflödet:
den tidigare appen anropar `submit_membership_application` med en klientroll
som migrationen avsiktligt återkallar. Att enbart återställa den äldre appen
återställer därför inte ansökningsfunktionen.

1. Verifiera i CI både hela migrationskedjan och appbygget. Kontrollera före
   produktionskörning att service-nyckel, Resend-konfiguration och `SITE_URL`
   finns i servermiljön. Förbered den verifierade appversionen före cutover.
2. Planera ett kort underhållsfönster för publika medlemsansökningar. Vid behov
   blockeras tillfälligt POST till ansöknings- och verifieringssidorna i driftens
   ingress/firewall. Den gamla appen är inte kompatibel mellan migration och
   appbyte; lova inte att inskick fungerar under detta intervall. Övriga
   medlems-/lagfunktioner berörs inte av dessa RPC-ändringar.
3. Kör det befintliga `Deploy production`-flödet: databasjobbet applicerar
   migrationer innan appjobbet publicerar bygget. Verifiera efteråt i avsedd
   testmiljö att en anonym ansökan sparas osynligt, att bara mejlets bekräftelse
   visar den för kansliet och att omskick respekterar budgeten. Ta sedan bort
   eventuell tillfällig blockering.
4. Om apppubliceringen misslyckas efter migrationen, behåll service-only-grants
   och draft-isolering. Rätta felet och kör deployjobbet igen med en kompatibel
   verifieringsversion. Återställ inte offentligt EXECUTE och gör inte utkast
   synliga för att få den äldre appen att fungera.
5. Efter cutover kan appen bara återställas till en version som fortfarande
   använder verifieringsflödets server-RPC:er. Budgetmigrationen är kompatibel
   med första verifieringsversionen (`8eb9d37`). Behöver annan äldre funktionalitet
   återställas, backporta den med verifieringsadaptern bevarad och kör CI innan
   publicering. Inga nedmigrationer eller raderingar av sparade ansökningar,
   token eller verifieringsbevis ingår i återställningen.

## Assistentens medlems- och uppdragsverktyg

Klubb- och sektionsverktygen verifierar föreningsmedlemskap och `roster.manage`
för varje läst lag vid varje anrop. Arbetsytans serverhämtade laglista begränsar
modellens lagval. Alla läsningar använder användarens klient med RLS och explicita
organisationsfilter; inga grants eller policyer breddas. Partiell lagåtkomst
redovisas med omfattning och får inte beskrivas som en total för klubben.
Läsningar sidindelas med exakt radantal och stabil sortering; fel eller för stort
underlag ger okänt resultat, aldrig noll.

Summering läser inga namn. Listor returnerar högst 200 person/lag-poster med
visningsnamn, medlemsroll och aktuella uppdrag; person-ID används internt.
Kontaktuppgifter, konto-ID, födelsedata, målsmanskopplingar och svar ingår inte.
Saknade personuppgifter under RLS ger fel i stället för en ofullständig lista.
Läsningar loggas på servern med verktyg, användare, organisation och antal utan
namn, söktext eller resultatdata.
