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

## Dataminimering

Varje personfält ska kunna motiveras utifrån en produktfunktion. Förena ska
aktivt ifrågasätta behovet av exempelvis fullständigt personnummer, bostadsadress,
historiska kontaktuppgifter och annan information som inte krävs för den
aktuella verksamheten.

Information som inte lagras kan inte läcka från Förena.

## Säkerhet före pilot

Följande betraktas som blockerande säkerhetsarbete innan pilot med verkliga
medlemsuppgifter:

- [ ] Definiera dataklassningen PUBLIC/MEMBER/TEAM/PERSONAL/RESTRICTED
- [ ] Definiera Identity Vault och separationen mellan identitet och domändata
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
