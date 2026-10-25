# Aktiviteter, serier och hela administrationskedjan

M09 omfattar också första systemadministratören, klubb, sektion, lag och
administratörstilldelning enligt användarens utökning 2026-10-23.
Implementation gäller React/Kotlin. Äldre Next-appen behåller sina separata
konton, databas och administrationsflöden.

## Från tom installation till första aktivitet

1. Serveransvarig anger `FORENA_INITIAL_SYSTEM_ADMIN_EMAIL` till den avsedda
   första systemadministratörens adress. Ingen standardadress eller automatisk
   förstaregistrerad administratör finns.
2. Personen registrerar och verifierar sitt konto med befintligt Spring-flöde,
   loggar in och öppnar **Administration** (`/administration`). Där visas
   **Aktivera systemadministration** endast för det verifierade, utpekade kontot
   när installationen saknar systemadmin och bootstrap aldrig har använts.
3. Personen bekräftar aktiveringen. En gemensam databasrad serialiserar bootstrap
   och alla administrativa skrivningar; parallella aktiveringar ger en vinnare.
   Aktiv session, engångstillstånd och verifierad adress kontrolleras före låset
   och kontrolleras igen under låset. Bootstrap har separata beständiga globala,
   klient- och kontobudgetar. Endast behöriga försök förbrukar denna budget;
   obehöriga konton kan inte tömma den gemensamma adminbudgeten.
   Efter aktiveringen styr databasen. Variabeln kan tas bort och kan inte
   återaktivera bootstrap efter att den har förbrukats.
4. Systemadmin skapar klubb med tidszon, unik adress och första sektion i den
   befintliga trestegsguiden. Ett första lag är valfritt. Klubb, sektion och det
   valfria laget sparas i samma transaktion.
5. Systemadmin utser klubbadmin genom en uttrycklig, bekräftad tilldelning till
   ett befintligt verifierat konto. Systemadmin kan ange sitt eget konto här,
   men blir aldrig automatiskt klubbadmin när klubben skapas.
6. Klubbadmin kan skapa fler sektioner och utse sektionsadmin. Klubb-/sektionsadmin
   skapar lag inom sin behörighet och utser lagadmin. Befintliga gemensamma
   klubb-, datum-, tidszon- och lagkomponenter återanvänds.
7. Lagadmin loggar in och öppnar laget under **Mina lag och föreningar**.
   På `/teams/:id` visas **Ny aktivitet** i sidans rubrik. Aktiviteter visas i
   den gemensamma agendan/kalendern; **Redigera** och **Ställ in** nås från
   aktivitetsdetaljerna. Laget följer sidan utan en separat lagväljare. Den äldre
   direktlänken `/activities/manage` fungerar fortfarande för sparade länkar.

Tilldelningen i denna leverans kräver ett redan registrerat och verifierat
konto. Det är en direkt, auditerad rolltilldelning, inte ett mejlinbjudningsflöde.
Ingen mejlinbjudan skickas eller påstås ha skickats. Inbjudningar till ännu
oregistrerade konton är fortsatt ett separat paritetsområde.

## Behörighetsgränser

- Systemadmin administrerar plattformsroller och klubbstruktur. Rollen ger
  ingen automatisk verksamhetsläsning eller rätt att skapa aktiviteter eller
  tilldela lagets verksamhetsbehörighet. Klubbrollen måste tilldelas uttryckligen.
- Klubbadmin har verksamhetsbehörighet inom sin klubb. Sektionsadmin är
  avgränsad till sin sektion; lagadmin till sitt lag och sina giltighetsdatum.
- Arbetsytorna i `/api/me/overview` inkluderar också lag som kontot får hantera
  enligt aktivitetsadministrationens aktuella behörighetskontroll, även tomma lag
  och konton utan egen personkoppling. Klubb-/sektionsroller och daterade
  lagrättigheter kontrolleras vid varje läsning. Systemrollen ensam ger ingen
  lagarbetsyta. Kallelser och personrader behåller sitt personurval;
  hanterbara lags kommande aktiviteter ingår i översikten. Aktiviteter utan
  personlig deltagare visas utan person-/svarsrader; läsrätten ger inga nya
  kallelsesvarsrättigheter.
- `activity.manage` och `invitation.manage` kan också tilldelas separat enligt
  M09:s personbundna rättighetsmodell. Vanligt lagmedlemskap och fristående
  läsåtkomst ger inte skrivrätt. Målsmans-/delegerad personåtkomst ärver inga
  administrativa rättigheter.
- En lagadmintilldelning använder en uttrycklig egen personkoppling. Om kontot
  saknar sådan i klubben skapas en ny, namngiven person. Befintliga okopplade
  personer matchas aldrig automatiskt via e-post. Flera aktiva egna identiteter
  i samma klubb ger konflikt och kräver separat handläggning.
- Återkallning av en sektions-/lagadmin som saknar tilldelning är en tom åtgärd:
  inga personer, personkopplingar eller behörighetsrader skapas.
- Rollens läsbehörighet har en egen tilldelningsrad; återkallning påverkar inte
  andra, oberoende läsrättigheter. Återkallad egen personkoppling nekar lagadmin.
- Alla adminändringar kontrollerar aktiv session och behörighet före det globala
  låset och igen efter låsväntan. Övriga adminändringar har egna beständiga
  globala, klient- och kontobudgetar, separat från bootstrap och inloggning.
  En skrivskyddad behörighetskontroll sker före budgetuttag.
- Backend kontrollerar aktiv session och aktuella rättigheter igen efter låsväntan.
  Webben binder anrop till aktuellt konto och behåller Origin-/CSRF-skydden.
- Sista systemadmin och sista klubbadmin kan inte återkallas. Sista sektionen,
  sektioner med beroenden och lag med medlemmar eller sparat underlag skyddas.

Den nya kedjan har gemensam/allmän verksamhet och fotboll som disciplinval.
Full katalogadministration och övriga disciplinpaket flyttas separat. Sektionens
namn, adress och disciplin kan redigeras; disciplinbyte blockeras av befintliga
lag/förval. Lagets adress bevaras när namn eller säsong ändras.

## Aktivitet och schemaläggning

`POST /api/activities`, `PUT /api/activities/{id}` och
`DELETE /api/activities/{id}` använder en transaktion per kommando. Skapandet
validerar typens ägare/disciplin, datum, längd, samling, deltagare och explicit
målgrupp före persistering. Aktivitetsredigeraren återanvänds med en adapter
som skickar endast Kotlin-kontraktets fält och använder kontobunden transport.
Next-klientens befintliga kontrakt och serieflöden ligger kvar.

Aktiviteter, omedelbara personkallelser, schemaposter, audit och signalversion sparas atomärt. Kallelser till direkt valda personer kan besvaras i appen efter skapandet; extern leverans sker fortfarande separat. Tidsregler
följer samma begränsade grammatik som TypeScript, med kalenderdagar i klubbens
IANA-tidszon och faktisk tid för timmar/minuter. Passerad kallelsetid blir
förfallen nu; passerade påminnelser hoppas över. Samtliga framtida påminnelser
sparas, inte bara den första. Förval läses fältvis från gemensam profil,
sektion och lag; inga sparade aktivitetstider räknas om när förval ändras.

Redigering bevarar befintligt kallelseschema om **Behåll befintliga** är valt.
Uttryckligt val av mottagare eller nytt schema sparas atomärt med aktiviteten,
under samma revisions- och behörighetskontroll. Nya personkallelser är
dubblettsäkra och bevarar tidigare svar och kommentarer. Ett nytt schema
ersätter väntande schemaposter men döljer aldrig redan skickade kallelser. En flytt får inte lägga aktivitetsstarten före den bevarade sista svarstiden. Webbens revisionsvillkor nekar överskrivning
av en nyare ändring och bevarar utkastet. Äldre anrop utan revision fungerar.

Inställning använder samma aktivitetslås och låsordning som kallelsesvar,
bevarar svar/historik och markerar väntande schemaposter som inställda.
M09:s nya knapp heter **Ställ in**; den raderar inte aktivitetshistorik.
Äldre Next-appens Ta bort/inställ-flöde ändras inte.

Schemaposterna är beständigt domänansvar, inte påstådd mejlleverans.
M06/M10 implementerar materialisering och extern leverans. UI:t säger
uttryckligen att externa meddelanden inte skickas ännu. Import, närvaro,
fullständiga disciplinpaket och inbjudan till oregistrerade konton återstår.

## Persistens och modulgränser

Migration 013 inför aktivitetstyper, lagrättigheter, audit, schemaposter,
sektion/disciplinreferens, fältvisa förval och målgrupper. Migration 014 inför
administrativa roller, bootstrap-lås, adresser/säsong och administrativ audit.
Ingen verksamhetslogik placeras i triggers, procedurer eller RLS; runtime har
samma separata dataroll utan DDL eller Liquibase-åtkomst.

`administration` äger struktur-/rollkommandon och anropar `identity` via en
publik identitetskatalog. Identitetsmodulen äger verifierade konton och egna
personkopplingar. `activities` äger aktivitetstyper, förval, urval och livscykel;
den läser de lagrade rollfakta som behövs för sina egna behörighetskontroller.
Ingen modul anropar en annan moduls interna repository och ingen cykel införs.

## Verifiering

Exakta resultat redovisas i [status](status.md). Kör exempelvis:

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run frontend:build
backend/mvnw -f backend/pom.xml verify
```

Med frontend på localhost:3002 kan de riktiga Chromium-/PostgreSQL-proven köras:

```sh
FORENA_M09_BROWSER_TEST=true backend/mvnw -f backend/pom.xml '-Dtest=ApiTest#browser*' test
```

CI kör samma browserprov samt paketerad JVM-/native-kontroll. `local-smoke.py`
provar också administrationskedjan och aktivitetskommandon via HTTP mot vald
runtime. Molnprovisionering, produktionsbootstrap och driftsättning ingår inte.

Lagets aktivitetshantering öppnar redigeraren på samma sida efter kontroll mot
`GET /api/me/managed-teams`. Den äldre direktlänken med `team` och `create=1`
stöds fortsatt, med samma behörighetskontroll.

`scripts/migration/team-activity-navigation-browser.mjs` kontrollerar den riktiga
frontendens menyrader, aktivitetsskapande från laget, fokus, nekad behörighet och
overflow vid 320, 375, 390, 768 och 1280 px. Provet använder lokala API-fixturer
och körs mot frontendservern på port 3002, utan verksamhetsskrivningar:

```sh
node scripts/migration/team-activity-navigation-browser.mjs
```

## Återkommande aktiviteter

`POST /api/activity-series` skapar en veckoserie med vald start-/slutdag,
veckodagar och lokalt startklockslag i föreningens tidszon. Den gemensamma
redigeraren visar samma förhandsgranskning som äldre appen. Backend beräknar
och validerar själv tillfällena: högst 366 dagars period och 100 tillfällen.
Startklockslag i en sommartidslucka avvisas; vid överlapp väljs den tidigare
tidpunkten. Varje tillfälle får egna tider, samling och eventuellt kallelseschema.

Alla tillfällen, schemaposter, audit och signaler sparas i samma transaktion.
Migration 015 lägger till en beständig `series_id` på aktiviteterna. Tillfällen
kan redigeras eller ställas in individuellt; massändring av kommande tillfällen
är ännu inte exponerad i React/Kotlin. Extern leverans och materialisering av
schemalagda målgrupper är fortsatt M06/M10 och påstås inte fungera av denna ändring.
