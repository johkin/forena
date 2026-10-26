# Arkitektur

## Kotlin: schemalagda kallelser och e-post

M06/M10 använder Spring Data JDBC, Spring-transaktioner och Moduliths JDBC
Event Publication Registry. `activities` äger schema, mottagarbeslut och
oföränderliga meddelandesnapshots; `notifications` äger idempotent överlämning,
transportförsök, providerkvitton och driftstatus. `identity` lämnar verifierade
mottagare med aktuell explicit personåtkomst. Resend är ett Spring HTTP Service
Client-interface registrerat via `@ImportHttpServices` i den befintliga
`email`-modulen, som också används av auth.

En separat autentiserad HTTP-arbetare driver scheman, återtag och e-post under
själva begäran. Ingen nödvändig kallelseleverans kräver en in-memory-lyssnare
efter HTTP-svaret. Kedjan är avstängd som standard och begränsad till
testmottagare; molnväckning och pilotgrindar återstår i M22G.
Se [transaktioner, återtag och driftgränser](migration/invitation-delivery.md).

Den nya React/Kotlin-appen använder [Spring-autentisering](migration/authentication.md)
som enda ordinarie auth-lösning. Backend äger konton, passkeys, mejllänkar,
OAuth och Spring Session JDBC. Supabase som PostgreSQL-leverantör är separat.
Den äldre Next-appen behåller sin befintliga Supabase Auth; beskrivningarna
av den äldre lösningen nedan innebär ingen omkoppling.


Den stegvisa målarkitekturen för Kotlin/Spring Boot på Vercel och Supabase finns i
[migreringsplanen](migration/README.md) och dess [beslut](migration/decisions.md).
Beskrivningen nedan avser nuvarande lösning och befintliga principer; målteknik
är inte införd bara för att den dokumenterats.

Spring-komponenter och standardflöden är förstahandsvalet i Kotlin (ADR-025).
Anpassningar görs via ramverkets gränssnitt; controllers återskapar inte
Spring Securitys autentiseringsflöden. Appen använder färdiga filter
för lösenord, passkeys, magic link och logout. Se [genomgången](migration/spring-security.md)
för kvarvarande kontoregler och sessions-/transportadaptrar.

Repots enda Kotlin/Spring Boot-kodbas finns direkt i `backend` (ADR-019).
M21/M22-teknikprovet är borttaget. Verksamhets-API:t hanterar
kallelseläsning och svar genom egen och delegerad personåtkomst med Spring Data JDBC-repositories, Liquibase och åtkomstkontroller i Kotlin (ADR-012). Det använder
ett nytt tomt `forena`-schema enligt ADR-010, utan gamla projektets testdata.
Enligt ADR-013 äger en Spring `@Service` med `@Transactional` hela svarslogiken,
inklusive historik och signalversion; inga verksamhetstriggers eller egna
procedurer används i det nya API-schemat. Nuvarande Next.js-app är ännu inte omkopplad. Se [API-underlaget](../backend/README.md)
för säkerhetsgränser, verifiering och återstående aktivering. REST-controllers
använder typade Kotlin data classes för svar. OpenAPI genereras med springdoc från controller-signaturer, DTO-annoteringar
och filter-endpointernas gemensamma typade metadata; TypeScript-typer härleds från
exporten i CI; kontraktsspecen underhålls inte separat för hand.
Kotlin-tjänster namnges med suffixet `Service`, exempelvis `InvitationService`.
Varje moduls interna databasmodeller samlas i `Entities.kt` och repository-
interface i `Repositories.kt`. DTO:er ligger i separata filer från tjänstelogiken;
modulen `activities` äger aktiviteter/kallelser och `identity` konto/session och
personåtkomst. Modulith verifierar beroendet `activities` → `identity` (ADR-015).

Kotlin-modulen `email` har ett leverantörsoberoende `EmailSender`-gränssnitt.
Resends REST-adapter och hemlighetskonfiguration är samlade i `email.internal`.
`identity` äger auth-mallar och krypterad mejlkö och beror bara på mejlmodulens
publika typer; mejlmodulen har inga beroenden till identitet eller verksamhet.
Den äldre Next-appens mejlintegration är separat och ändras inte av detta.

Spring-profilen `local` startar PostgreSQL via Spring Boots Docker Compose-stöd,
med samma schema-bootstrap, separata owner-/runtime-roller och Liquibase som
övrig Kotlin-runtime. Spring-autentisering och en loggande `EmailSender` gör det möjligt
att utveckla utan Supabase Auth eller Resend. Data ligger kvar i en lokal volym.
Se [körinstruktioner](../backend/README.md#lokal-utveckling).

Ett avskilt [browserflöde](migration/browser-participation.md) återanvänder
inloggning, sidskal och kallelsesvar genom de befintliga Next-rutterna till
Kotlin. Backend väljs endast i servermiljön och är `legacy` som standard.
Testläget använder nya seedens ID:n och gör ingen fallback efter ett misslyckat
Kotlin-anrop. Ordinarie översikt är fortsatt inte omkopplad.

Den separata [browser-frontendens pilot](../frontend/README.md) i `frontend/`
återanvänder gemensamt sidskal, header, meny, sidfot och kallelsesvar men kör
React/Vite utan Next-server. Spring hanterar kontoregistrering, e-postverifiering,
lösenord, passkeys, magic links, återställning och logout. Spring Session JDBC
äger lagring, cookie och inaktivitet; sessionsinnehållet är strängar med identitet
och generation. Browsern skickar endast en ogenomskinlig HttpOnly-cookie via
API-proxyn. Backend äger behörigheter och sessionskontroll. Publik config
innehåller version och valfri provaktivitet. Se [webbsessioner](migration/web-sessions.md)
och ADR-026. OAuth/MCP går genom Spring Authorization Server med separat
token-/resourcekontroll.


[Actions-deployen för Kotlin-sajten](migration/actions-deployment.md) bygger
statisk frontend och Java 25-API i en gemensam Vercel Services-deployment.
Intern navigering i Vite-appen använder React Router och en routeradapter i
de gemensamma länkkomponenterna. Dokumentet och sidskalet behålls mellan
aktivitetsvyer; sessionen startas inte om vid varje intern länk.
Ingen privat frontend → backend-binding behövs i browserpiloten. Bara de nya
rutterna ändras i detta projekt; gamla sajtens projekt och Next-deploy är
separata. Den äldre Next → Kotlin-adaptern ligger kvar som historiskt prov.

Förena byggs som en multi-tenant-applikation där varje skrivning går genom ett
validerat applikationskommando. Gränssnitt och AI-assistent använder samma
kommandon; AI:n får aldrig direkt databasåtkomst.

Den nya webbens startsida visar **Min översikt** via `GET /api/me/overview`.
`PersonalHome`, `PersonalOverview` och `TeamCalendar` delas med Next-appen.
Sidan har Agenda/Kalender, kombinerbara filterchips för Behöver svar och lag,
en gemensam aktivitetslista och Mina lag och föreningar. Varje berörd person
har en rad, även utan kallelse. Filtren begränsar samma underlag i båda vyerna;
svarsräknaren räknar aktiviteter inom valt lag, inte personer.
`needsInvitationResponse` delar urvalsvillkoret med kallelsesidan: obesvarad,
inte inställd och ännu inte avslutad. Passerad svarstid stänger inte svar. Lag identifieras
med ID från aktivitetsunderlaget, även för gästkallelser utan laggenväg.
Bekräftade svar uppdaterar urval och räknare; ett gemensamt skrivlås hindrar
samtidiga svar för samma kallelse.

`PersonAccessService` härleder egen och delegerad personåtkomst; familj är inte
ett backendbegrepp. `team_membership` ger datumgiltig aktivitetsläsning för
behöriga personer. `team_access_assignment` används bara för kontots egna
personer, inte som en ärvd fullmakt genom delegation. `organization_member`
ger föreningsroller i genvägarna. Inget av detta utökar personens svarsrätt.
Datum jämförs med aktivitetens start i föreningens `time_zone`.

En read-only repeatable-read-transaktion ger aktiviteter, personrader,
kallelser och genvägar från samma behöriga snapshot. Det finns ingen
90-dagarsgräns eller 50-postersräknare i den nya översikten. Fler än 20 000
aktiviteter ger 503 i stället för missvisande deldata. Metadata och relationer
läses i gemensamma repository-frågor, utan per-aktivitet-anrop. Bara skickade
personliga kallelser lämnas ut. `GET /api/activities/{id}` separerar rätt att
läsa detaljer från rätt att svara och fungerar även utan en kallelse.

Förenings-/laglänkar öppnar en avgränsad personlig aktivitetsvy i Kotlin-webben.
Lagets sida komponerar dessutom `ActivityManagement` med sidans lag-ID;
serverns hanterbara lag avgör om administrativa aktiviteter och skapande visas.
Den personliga kalendern behåller sitt personurval. Headerns klocka öppnar aktuella kallelser, inte en ny push-
leverans. AI/MCP-anslutning, extern notifiering och arbetspass återstår i sina
migreringsuppgifter. Det gamla `/api/me/activities` finns kvar för kompatibilitet.

Kotlin-reglerna i AGENTS.md och ADR-022 gäller gemensamt: standardundantag för
vanliga fel, ramverkets undantag för Auth/transport och `*Entity` för alla
klassmappningar av tabeller. HTTP översätts i advice/filter med fasta, säkra
feltexter. Läsprojektioner är inte tabellentiteter.

ADR-021 inför en gemensam dataroll för befintliga/framtida datatabeller.
ADR-023 låter Liquibase köra korta migreringar som owner före HTTP-start, med
separat anslutning från runtime-kontots pool. Runtime saknar DDL och
migrationsmetadata. Rättigheter och sessionsschema verifieras en gång efter
Liquibase; fel stoppar start. Löpande DB-health använder Spring Boots
anslutningskontroll. Tunga dataflyttar körs separat i återupptagbara batcher.

## Lager

1. **Domän** – förening, lag, person, aktivitet, kallelse och medlemskap.
2. **Applikation** – kommandon, behörighetskontroll och transaktioner.
3. **Infrastruktur** – PostgreSQL, objektlagring, push, mejl och AI-provider.
4. **Gränssnitt** – server-renderad webbapp och installerbar PWA.

## Gränssnitt och skärmstorlekar

Alla vyer utformas mobile-first. Utgå från en smal telefon i stående läge,
inklusive installerad PWA på iPhone, och bygg ut layouten för större skärmar.
Det gäller även administration, formulär, kalender, dialoger och nya funktioner.

- Sidans bredd ska följa viewporten utan horisontell scroll vid 320, 375 och
  390 CSS-pixlar. Testa även 768 pixlar och desktop.
- Rutnät och flexinnehåll måste kunna krympa (`min-width: 0`, `minmax(0, 1fr)`);
  långa namn, e-postadresser och annan dynamisk text ska brytas eller avkortas
  där det är begripligt. Dölj inte sidans overflow för att maskera ett fel.
- Flera kolumner, knapprader och täta tabellrader ska staplas eller radbrytas på
  telefon. Kalendern ska fortfarande gå att använda utan att sidan blir bredare.
- Dialoger ska rymmas i både bredd och höjd och ha nåbara åtgärdsknappar.
  Kontrollera även tangentbord, större text och tryggt tryckbara mål.
- Granska varje ny eller ändrad vy i telefonbredd och desktop, med realistiskt
  långa värden. Kontrollera `document.documentElement.scrollWidth <= innerWidth`
  och åtgärda det element som orsakar overflow.

### Designtokens

[DESIGN.md](../DESIGN.md) och referenserna under `public/design` styr den visuella
riktningen. `globals.css` äger gemensamma färg-, typografi- och ytvariabler.
Primär åtgärdsfärg är separat från textfärg. Rotlayouten laddar lokalt paketerade
Newsreader och Plus Jakarta Sans. Se [designreglerna](design-spec.md) för hur
skillnader mellan referensens YAML, text och HTML har lösts.

### Direkta kallelsesvar i översikten

`PersonalOverview` grupperar familjens serverfiltrerade aktiviteter och renderar
`OverviewInvitationResponse` per person. Samma kort används i lag- och
familjeöversikten. Endast aktivitetsrubriken öppnar detaljer. Varje svar går till
det befintliga autentiserade `respond`-API:t med exakt kallelse-ID; utelämnad
kommentar bevarar den tidigare kommentaren. API:t kontrollerar att en rad faktiskt
uppdaterades innan det returnerar framgång. Familjeavgränsningen behålls. Befintlig RLS styr åtkomsten och en privat
trigger nekar svar/kommentarer för inställda eller avslutade aktiviteter;
triggerns aktivitetslås skyddar även samtidiga livscykeländringar.
Bekräftade svar visas lokalt och föräldravyn uppdateras från servern. Väntande
skrivning och fel är avgränsade till personens rad.

### Gemensamma komponenter

Menyer, header och footer ska implementeras som centrala, återanvändbara
komponenter under `src/components`. Ett gemensamt sidskal komponerar dem i
layoutlagret. Enskilda sidor ska ange sitt innehåll och sin kontext, inte
implementera egna kopior av navigation, sidhuvud eller sidfot.

- En central menykomponent ska rendera navigationen från gemensamma
  menydefinitioner. Länkar, etiketter, ordning, aktivt val och synlighetsregler
  ska inte dupliceras mellan sidor eller mellan mobil- och desktopmenyer.
- Header och footer ska ha var sin gemensam komponent. Skillnader mellan
  publik vy, konto, förening, sektion, lag och systemadministration uttrycks
  genom kontext och definierade varianter, inte parallella implementationer.
- Behörighetsstyrda menyval ska utgå från serververifierad åtkomst. Gemensamma
  komponenter innebär inte gemensamma rättigheter: systemadministration
  förblir separat skyddad. Dolda menyval ersätter aldrig serverns kontroller.
- Layouten ansvarar för att header, meny och footer inte renderas dubbelt i
  nästlade vyer. Responsivt beteende och tillgänglighet hanteras i de gemensamma
  komponenterna så att rättningar får genomslag i alla berörda vyer.

Se [gränssnittets designregler](design-spec.md) för utformning och kontroll av
menyer, header och footer.

## Domänregler i första milstolpen

- Föreningsdata tillhör explicit en förening; profiler och push-prenumerationer
  tillhör i stället användaren.
- Ett lag tillhör exakt en förening.
- En kallelse avser en aktivitet och en medlem.
- Ett första svar får inte skrivas över utan ett separat ändringskommando.
- Bred kommunikation förhandsgranskas innan den skickas.

## Persistens

### Personlig arbetsyta över föreningar

Rotrutten `/` använder `getPersonalDashboard` och det centrala `AppShell` utan
organisationskontext. Den autentiserade användarens egna personposter och
`person_guardians` härleder familjen över samtliga föreningar. Läsningen filtrerar
kallelser uttryckligen på familjens person-ID:n även om användaren är ledare och
RLS tillåter mer. Aktiviteter hämtas via familjens lagmedlemskap, egen lagåtkomst,
personliga kallelser och auth-bundna `my_activity_duty_links`, över alla lag
och föreningar. Medlemskap och lagåtkomst kontrolleras vid aktivitetens lokala
datum. Sidindelning med exakt radantal
och batchade ID-uppslag hindrar tyst trunkering vid PostgREST:s radgräns.
Fel ger inte en falskt tom kalender. Inga service credentials, nya grants eller
ändrade RLS-policyer används.

Lagen under Mina lag härleds från aktiva familjemedlemskap och egna
åtkomsttilldelningar på klubbens lokala datum. En kallelse till ett annat lag
gör aktiviteten synlig men ger varken lagmedlemskap eller nya behörigheter.
Föreningsgenvägar bygger på egna föreningsmedlemskap och familjens kopplingar.
Aktivitetsdialogen återanvänds i familjeläge med aktivitetens verkliga klubb,
lag och tidszon; administration sker inne på lagets sida. Stängning, push och
återgång till appen uppdaterar serverunderlaget.

PostgreSQL körs genom Supabase. Lokalt startar Supabase CLI en containerbaserad
stack med databas, Auth, Storage och Studio. Schemat hanteras med SQL-migrationer
i `supabase/migrations` och kan återskapas deterministiskt med `npm run db:reset`.

Databasen innehåller `organizations`, `profiles`,
`organization_members`, `teams`, `people`, `person_guardians`, `memberships`,
`activities`, `invitations`, `push_subscriptions`, `notification_outbox` och
`audit_log`. Samtliga tabeller har Row Level Security. Hjälpfunktionerna
`is_organization_member` och `has_organization_role` används av policyerna för
att isolera föreningar och skilja vanliga medlemmar från ledare och administratörer.

Sektioner finns i datamodellen även när föreningen bara har en. Gränssnittet
döljer automatiskt sektionsnivån när det finns exakt en sektion, medan lagen
behåller kopplingen för behörighet, sidor och framtida rapportering. Roller kan
tilldelas på förenings-, sektions- och lagnivå genom `organization_members`,
`section_staff` och `team_staff`.

Den inloggade applikationen använder kanoniska arbetsyterutter som
`/o/ursvik-ik/t/f2016`. Framtida egna publika domäner kan peka ut samma förening
utan att ändra interna identiteter eller appens routing.

Serverkod och webbläsarkod har separata Supabase-klienter. Service role-nyckeln
ska aldrig exponeras som en `NEXT_PUBLIC_`-variabel eller skickas till PWA:n.

## Assistenten

Inloggade klubb-, sektions- och lagsidor visar en gemensam flytande assistent
via `AppShell` och `FloatingAssistant`. Dialogen bevarar samtalet vid minimering
och markerar nya svar. Byte av arbetsyta startar ett separat samtal; aktuell
sidrutt och en kort sidetikett skickas som kontexthint, aldrig sidans DOM,
personuppgifter eller en behörighetsgrund. Sidor kan ange en tydligare etikett,
exempelvis kalender. Detta är grunden för framtida sidanknutna verktyg.

`/api/ai/workspace-assistant` verifierar medlemskap och arbetsytans organisation
och sektion. Klubb- och sektionsassistenten kan läsa en begränsad lista av
publicerade kommande aktiviteter utan uppställning eller kallelsesvar. Ett
uttryckligt lagval delegeras till lagassistenten med förnyad lagbehörighetskontroll.
Medlems- och uppdragsfrågor använder `readWorkspaceMembers` över klubbens eller
sektionens lag, med förnyad `roster.manage`-kontroll för varje lag. Uppdragstyper
hämtas från `listWorkspaceResponsibilityTypes`. Summering räknar unika personer
per medlemsroll; uppdrag som kassör är separata från behörighetsprofiler.
Endast aktiva tilldelningar på klubbens lokala datum ingår. Om åtkomsten är
begränsad anges antalet lästa lag och svaret är uttryckligen ingen klubbtotal.
Omfattningen är laganknutna personer, inte klubbmedlemskap utan lag eller
målsmans-/kontoroller. Andra privata frågor över flera lag kräver att användaren
väljer ett lag. Medlemssvar formuleras från verifierade resultat på servern;
modelltext kan inte ersätta antal, namn eller omfattning. Aktivitetsutkast öppnar den gemensamma
redigeraren med serverhämtad lagkontext och sparas först efter granskning.
Redigerarens truppdata skickas inte till modellen.

Lagassistentens HTTP-adapter i `src/app/api/ai/team-assistant/route.ts` hanterar
request-validering och HTTP-svar. `withAuthenticatedRoute` verifierar sessionen
och ger anropet en användaridentitet och en Supabase-klient. `proxy.ts` uppdaterar
sessionens cookies; API-säkerheten förutsätter inte att anropet passerar proxyn.

AI-flödet finns i `src/lib/ai/team-assistant.ts`. Kontext och lagbehörighet,
skrivskyddade verktyg, utkast-schema och promptar ligger i separata moduler i
samma katalog. Promptarna väljer professionell, saklig ton för användare med
ledaråtkomst till laget, och varm, enkel ton för spelare och målsmän. Tonvalet
kommer från serverns lagbehörigheter och kan inte väljas i requesten.

Påminnelseverktygen läser aktuellt läge via `assessActivityReminder` och
returnerar ett skrivskyddat utkast med referenser till sparade delade minnen.
`confirmAssistantReminder` är ett separat autentiserat serveranrop efter ett
knapptryck; det kontrollerar behörighet och förhandsgranskningens fingeravtryck
innan `queueActivityReminder` köar utskicket. Samma skrivkommando används av
aktivitetsvyn. Ingen modell har ett verktyg för själva köningen. Se
[assistentminne](assistant-memory.md) för omfattning och skydd.

Kodägda disciplinpaket kan komponera deklarativa `capabilities`. Förmågan
`targetTeamSize` används av fotboll för matchtruppsnotiser till lagets
kallelsehanterare vid spelarbrist. Samma beroendefria TypeScript-definition används
av paketet och Supabase-arbetaren; databasadaptern verifierar disciplin, aktivitet,
aktuella spelarroller och mottagarbehörigheter. Aktivering och kontrolltider ärvs genom disciplinförval och kopieras vid
aktivitetens skapande. Regelkopior och beständig deduplicering lagras privat. Notiserna föreslår åtgärder men skickar inga extra
spelarpåminnelser utan ledarens bekräftelse. Se [discipliner](disciplines.md).

Återkommande aktivitetsutkast innehåller veckodagar och slutdatum och öppnar
aktivitetsdialogen i serieläge. Saknas slutdatum måste ledaren ange det innan
förhandsgranskningen. Utkastet valideras mot samma serieregler som dialogen och
sparas först efter ledarens granskning.
Arbetsflödet väljs av ett separat strukturerat modellanrop i
`team-assistant-intent.ts`, med aktuell fråga och samtalshistorik. Modellen väljer
aktivitetsutkast, kallelser, närvarohistorik, påminnelse, vanlig dialog eller
följdfråga och kan göra ett kort följdsvar självständigt med samtalets uppgifter.
Servern validerar resultatet och tillämpar behörigheter innan nästa steg.
Klassificeringen får inga medlemsdata, minnen eller skrivverktyg. Vid fel görs
ingen regexbaserad reservklassificering och inget efterföljande verktygsanrop.
Veckoupprepning och behov av extern evenemangsresearch väljs i samma anrop.
Kalenderberäkning och validering av datumformat förblir deterministiska.
Det extra anropets tid och tokenförbrukning loggas separat utan samtalstext.
Jev kan senare utvärderas som alternativ klassificerare mot svenska testfall;
den här versionen använder samma modell som resten av assistenten.

Assistenten översätter naturligt språk till typade verktygsanrop. Varje anrop
kontrolleras mot användarens roll och aktiv förening. Namn, avatar och tonalitet
kan anpassas per förening, men säkerhetsregler och systemprompt kan inte ersättas.

## MCP

`src/app/api/mcp/route.ts` är HTTP-adapter till en stateless MCP-server.
`src/lib/mcp/auth.ts` verifierar explicit användar-token och skapar en
request-lokal Supabase-klient utan service role eller browser-cookies.
`src/lib/mcp/server.ts` registrerar typade verktyg som återanvänder
lagassistentens kontext och aktivitetsutkastens validering. Läsningar kräver
applikationsbehörighet och omfattas dessutom av RLS. MCP-svar är dataminimerade;
privata kommentarer och assistentminnen exporteras inte. Verktygsanrop loggas
på metadata-nivå. Första versionen läser och förbereder utkast utan skrivningar.
Se [MCP-server och anslutning](mcp.md) för verktyg, autentisering och nästa steg.

Lagdashboarden och truppen använder `AppShell`. Den komponerar `AppHeader`
och vänstermenyn från samma `AppMenuContent`, med `TeamMenu` som central
lagnavigation. Vid 768 CSS-pixlar växlar hela navigationen mellan vänsterspalt
och mobilens dialogmeny; den visas aldrig på båda sidor samtidigt.
`/components` är en publik komponentreferens med enbart syntetiska data och
aktivitetsredigeraren i demoläge. Aktivitetshändelser lagras fortsatt, men
renderas inte som teknisk historik i den vanliga aktivitetsdialogen.

## Aktivitetstyper och gemensamma förval

`activity_types` innehåller systemets gemensamma katalog (utan organisationsägare)
med valfri `discipline_id`; äldre lokala specialtyper förblir föreningsägda.
Typreferenser använder identitet, medan en databas-trigger kontrollerar lokalt
ägarskap och lagets effektiva disciplin. Dokumentkopplingar förblir tenantbundna.

Disciplinens TypeScript-profil äger grundförval. `section_discipline_defaults` och
`team_discipline_defaults` lagrar sparsamma överstyrningar med riktiga mål-FK:er,
disciplinidentitet, paketversion och revision. Arvet är disciplin → sektion → lag;
klubb- och systemförval finns inte. Sektionen är ensam källa till lagets disciplin.
`values.options` lagrar valbara interna tidsvärden per fält; listorna ärvs
oberoende av valda förval och ersätts helt vid lokal override.
`loadActivityConfiguration` är den gemensamma läsvägen för dialog och assistent;
`resolveDisciplineDefaults` är den rena domänfunktionen för fältvis arv.
Skrivkommandot kontrollerar mål och behörighet på både server- och databasnivå.
`reminder_send_ats` materialiseras atomärt till påminnelsescheman vid samma
aktivitetsskrivning. Se [aktiviteters tidsregler](activity-time-rules.md).


## Schemalagda uppgifter och utgående kö

`private.scheduled_tasks` lagrar när registrerade uppgifter ska köras.
`scheduled-task-worker` utvärderar kallelser, påminnelser och disciplinregler
oberoende av leveransarbetaren. Beslut och köläggning sker atomärt; texten
materialiseras vid INSERT i outbox. `notification-worker` läser det generiska
`message`-fältet och hanterar transport och återförsök utan domänläsningar eller
omprövning. `scheduled_at` i outbox gäller enbart transportens återförsök.
Se [schemalagda uppgifter](scheduled-tasks.md).

## Deltagande och arbetsuppgifter

`invitations.activity_role` beskriver rollen i just aktiviteten och ger aldrig
behörighet. `add_activity_participants` är det atomära kommandot för att lägga
till klubbpersoner och köa deras ordinarie mottagare; vid ledaranmälan sparas
`registered_by` och inget utskick görs. Befintliga svar skrivs inte över.
Namnsökningen är kopplad till en aktivitet och kräver `invitation.manage`.

`activity_duty_types` är en återanvändbar katalog per lag med stabila ID:n.
`activity_duty_series` lagrar ett gemensamt uppgiftsupplägg inom aktiviteten;
`activity_duties` är sparade instanser som kan regenereras med bibehållna ID:n
för kvarvarande passnummer. Platser och ändringsförslag finns i separata
tabeller. Seriemallar ändrar inte bokningar utan förhandsgranskning och
genomförda uppgifter är låsta. Alla passändringar invaliderar seriens revision. Bokning och tilldelning är fristående från kallelsesvar.
Se [bemanningsschema](activity-duty-schedule.md) för datamodell, migration,
självservice, atomära ändringar och aktuella avgränsningar.

Uppgiftsschemat gäller alla lagaktiviteter, inklusive importerade matcher.
Assistentens `activity-duties`-flöde läser ett verifierat aktivitetsurval och
föreslår en uppgift per aktivitet. Endast separat knappbekräftelse får anropa
det atomära batchkommandot; kvitton för återförsök ligger privat utan klientgrants.
Lokala uppgifter kan följa ändrade aktivitetstider utan att importen eller
kallelserna skrivs om. Batch-ID förbereder framtida gemensam redigering.

Bemanningsförslag använder lagavgränsad statistik via `activity_duty_fairness`
och en deterministisk rangordning. Ledaren bekräftar ändringsbara förslag genom
samma atomära kommando som manuella tilldelningar. Schemaskrivning och köläggning
av bemanningsnotiser sker i samma databastransaktion.

### Kallelser mellan lag

Frågor om antal kallade och anmälda använder `listInvitationTeams` och
`readActivityInvitations`, avskilt från närvarohistoriken. Källaget anger vilka
spelare som räknas; mottagarlaget anger var aktiviteten hålls. Namngivna lag och
träningskategori tolkas från aktuell fråga före modellens argument. Ingen period
betyder pågående och kommande publicerade aktiviteter, utan påhittad historikperiod.
En angiven månad eller relativ period använder serverns kalenderberäkning.
Kallad omfattar alla svar; anmäld/tackat ja filtrerar `accepted`. Spelarens
medlemskap i källaget kontrolleras på aktivitetens lokala datum, även om spelaren
också tillhör mottagarlaget. Unika spelare och kallelsetillfällen summeras separat.
Läsningar sidindelas så att PostgREST:s radgräns inte ger en falsk exakt total;
för stort eller misslyckat underlag ger ett fel. Svarets antal och lista kommer
från verifierad läsning och kan inte ersättas med modellens påståenden.

### Historik och relativa perioder

Namngivna månader tolkas på servern: september utan år avser senaste förekomsten,
innevarande månad begränsas till dagens datum och uttryckligt år respekteras.
Den säkert tolkade perioden från aktuell fråga gäller före modellens datumfält,
så ett saknat slutdatum i verktygsanropet inte blockerar läsningen. Tvetydiga
månadsintervall och enskilda datum lämnas till det explicita datumflödet.
Historikens aktivitetsknappar hämtar aktuella detaljer med användarens session,
RLS och ny behörighetskontroll för aktivitetens faktiska lag. Den befintliga
aktivitetsdialogen öppnas i läsläge, liksom aktivitetslänkar från notiser, med
aktivitetens egen förening, lag och tidszon. Chatten finns kvar bakom dialogen.

Lagkontexten innehåller både lagnamn och `teamId`; aktuellt lag är historikens
förval när inget annat efterfrågas. Explicita historikfrågor kräver ett riktigt
`listHistoryTeams`-anrop och, när en period anges, ett `readActivityHistory`-anrop
genom SDK:ns `prepareStep`/`toolChoice`. Modellen får inte ersätta anropen med
kodtext. Utan lyckad läsning visas ingen obekräftad historiksammanfattning.
Historikflödet erbjuder inga minnes- eller påminnelseförslag. Metadata loggas
med verktygsnamn och antal resultat, utan frågor eller historikdata.

Aktivitetsutkast innehåller valfritt `activityTypeId` från lagets tillgängliga
katalog. Träningsbegäranden väljer en typ med kategorin `session`, även för
serier. Modellen kan inte föreslå ett okänt katalog-ID. Dialogen behåller typen
vid konfigurationsladdning och tillämpar dess förval på orörda nya fält; ett
utkast vars typ blivit otillgänglig kräver ett nytt uttryckligt typval.
Begäranden som ”Jag vill ha träningar varje fredag” går direkt till utkastflödet.
En serie som påbörjats men fortfarande pågår begränsas till aktuellt lokalt
datum före förhandsgranskning; veckodagar och sluttid bevaras och ledaren ser
att passerade datum hoppas över. Enstaka eller helt passerade serier nekas.

Historikverktyget tolkar `relativeDays` från organisationens aktuella datum.
”De senaste tre veckorna” betyder 21 kalenderdagar inklusive idag; datumgränser
räknas i organisationens tidszon och visas i svaret. Vanliga svenska relativa
perioder förtolkas från den aktuella frågan, aldrig från äldre chattmeddelanden.
Databasen beräknar unika personer och deltagartillfällen före 200-postersgränsen.
Träning/match kräver registrerad närvaro, arbete kräver genomförandemarkering.
Fullständiga summeringar och aktivitetslistor kan visas även när personutdraget
är begränsat. Uppgifterna returneras separat från modellens fritext; åtkomst och
loggning följer samma kontroller som övrig aktivitetshistorik.

### Notislänkar och svar i aktivitetsmodal

Push för en aktivitet länkar till `/activities/{id}`. Inloggningen bevarar
returadressen. Sidan läser aktiviteten med användarens session och öppnar
samma detaljmodal som översikten. Befintliga appfönster navigeras och fokuseras
vid tryck; mottagen push uppdaterar data utan att öppna en modal.
Översikten visar svarsstatus. Svar och kommentar lämnas i modalen, vars API
bara returnerar den egna personens och de egna barnens kallelser, även för
ledare. Översikten uppdateras när modalen stängs.
Ändrad kommentar kan sparas utan att välja svar igen. Inkommande push hämtar
även om svaren i en öppen modal, utan att kasta osparad kommentarstext.

### Redigering av befintlig serie

Ledaren väljer ett tillfälle eller detta och kommande tillfällen. RPC:n
förhandsgranskar och sparar samma urval atomärt med en kontrolltoken.
Passerade, inställda, importerade och individuellt ändrade tillfällen hoppas
över; den valda aktiviteten är utgångspunkt. Äldre skillnader i innehåll och
tider respekteras också. Datumförskjutning sker i klubbens lokala tidszon.
Aktivitetstyp ändras per tillfälle. Befintliga kallelsetider, svar och seriens
ursprungliga skapandemall bevaras. Tidsändring med uppgiftsschema kräver
separat anpassning och blockeras i seriekommandot. Nya enskilda ändringar
markeras med `series_exception` för kommande serieredigeringar.

Serieomfattningen gäller även borttagning. `delete_activity_series_from` använder
samma urvalsregler men validerar inte tider som inte ändras. Antal och datum
förhandsgranskas separat innan bekräftelse. Kontrolltoken och låsning skyddar
mot ändrat urval; hela borttagningen sker i en transaktion med auditlogg.
Varje tillfälle använder `delete_or_cancel_activity`: publicerade aktiviteter
med svar ställs in, övriga tas bort. Historik och undantag lämnas kvar.

### Tomma arbetsytor och gemensamt sidskal

En behörig lagarbetsyta finns även utan kommande aktiviteter. Dataladdningen
returnerar då `activity: null` och tomma aktivitets-/kallelselistor, men behåller
behörigheter, trupp, uppgifter, familjeaktiviteter och saknad historisk närvaro.
Översikten visar ett tomt läge med assistenten och behörighetsstyrd skapandeåtgärd.
Ett databasfel får inte tolkas som ett tomt lag eller publik åtkomst.

Alla sidtyper använder `AppShell`, även publika vyer, konto, ansökningar och
administration. Skyddade systemsidor får skalet från systemlayouten; den delade
inställningsvyn skapar därför inget extra skal i systemläge. `AppFooter`
renderas en gång i rotlayouten. `OrganizationMenu` och `NavigationLinks` samlar
föreningslänkar och aktiv sidmarkering; serverkontroller avgör administrativa val.

### E-postverifiering av medlemsansökan

Den publika serveråtgärden sparar ansökan som `draft` och skickar en separat
verifieringslänk till målsman 1 via Resend. `start_membership_application` är
serverbegränsad och sparar ansökan och tokenhash i samma transaktion. En redan
inloggad föreningsmedlem slipper verifieringen endast om Auth-databasens
bekräftade e-postadress matchar målsman 1. Användar-ID hämtas från `getUser`,
inte formuläret. Inget konto, spelare eller medlemskap skapas vid verifiering.

Länken gäller 24 timmar och måste bekräftas med POST på en sida med det
centrala sidskalet. GET är skrivskyddad för att hantera mejlskanning. Verifiering
promoverar ansökan till `submitted` och sparar adress, tidpunkt och auditlogg.
Förbrukade länkar ger samma bekräftelse vid nytt tryck. Omskick kan begäras utan
att fylla i ansökan igen; det ersätter föregående länk och begränsas till ett
utskick per minut och tre per timme per mottagare över alla föreningar, inklusive nya ansökningar.
Misslyckad mejlleverans lämnar ansökan sparad och erbjuder omskick. Ett gemensamt
tak på 100 verifieringsutskick per timme omfattar alla föreningar, mottagare och
serverinstanser. Reservationen görs atomärt i databasen före mejlanropet.

Kansliet visar källa, inskickad tid, verifieringsunderlag och ansöknings-ID under
hopfällbara detaljer. Äldre ansökningar behåller sin status och märks som
`legacy`, utan fabricerade verifieringstidpunkter. De kan granskas som tidigare.

Historiksvar formuleras från verifierade summeringar, inte modellens slutsatser om fysisk närvaro. Namn hämtas endast från `attendance=present`. Frågor om ledare/spelare filtreras med medlemsrollen på aktivitetens lokala datum, inom samma organisation och lag med anroparens RLS. Rollsummeringar kräver kompletta detaljposter och komplett medlemsuppslag; vid trunkering ombeds användaren begränsa perioden. Saknad närvaroregistrering är inte bevisad frånvaro.

## Kodägda disciplinpaket

Fotboll har ett versionshanterat paket med separata schemastrukturer för sektion,
lag, lagmedlemskap, aktivitet och deltagande. Paketet kopplas via sektionens
katalognyckel och exponeras i aktivitetskonfigurationen. Systemadministrationen
visar kodägda definitioner skrivskyddade. Befintliga katalogdiscipliner och
äldre överstyrningar fungerar fortsatt; en konflikt mellan sektion och effektiv
lagdisciplin ger inget paket. Se [disciplinpaket](disciplines.md) för leveransens
omfattning och den verifierade UIK-kopplingen.

Disciplinernas värden lagras versionsrefererat i `private.discipline_values` med
disciplinreferens, objektankare, validerande och behörighetskontrollerad RPC samt optimistisk
revision. Matchförval kopieras av en insert-trigger; äldre tillfällen förändras
inte av nya lagförval. Se [disciplinpaket](disciplines.md) för API och native-vyer.


Disciplinernas editors och definitioner ligger i `src/disciplines/<key>`. Generella vyer och API:er väljer registrerat paket utan sportvillkor. Aktivitetens generella databashändelse anropar disciplinens runtime via schemaläggningsarbetaren; bounded operations sparar värden och flyttar/avbryter capability-kontroller atomärt. Se [discipliner](disciplines.md#disciplinkatalog-och-aktivitetshändelser).


## Beständiga capability-signaler

Capabilities kan lämna strukturerade signaler separat från notifieringsförslag.
Gemensam lagring hanterar aktiv/löst/avfärdad status, återkomst, revisionskontroll
och åtgärdshistorik. Utvärderingen körs genom schemaläggningsarbetaren, och
outbox ansvarar fortsatt endast för leverans. Se [signalernas modell och flöde](capability-signals.md).

Signalernas lyckade utvärderingar schemalägger endast nästa tidsgräns;
minutjobbet plockar förfallna jobb. Ändrade kallelsesvar publicerar det privata,
beständiga eventet `activity.invitation_response_changed` i skrivtransaktionen.
Signalprenumeranten kvitterar och kölägger atomärt; RPC:n är service-only och
händelsetabellen har RLS utan klientgrants. Se [signalflödet](capability-signals.md).

Alla datum- och tidsval återanvänder `ActivityDatePicker`, `ActivityRangeCalendar`,
`ActivityTimeStepper` och kompositionen `DateTimeRangeFields`. Kalenderkomponenterna
arbetar med lokala datumsträngar; tidszonskonvertering ligger kvar hos anroparen.
Tidsreglagen stegar 15 minuter och bevarar exakt minut vid direktinmatning.
Månadsvyn väljer start och slut i två klick; en ny sekvens återställer intervallet.
Datumfält bevarar namn, obligatoriskhet och gränser för formulärinlämning. `PersonSelectionList` är den gemensamma
kontrollerade listan för kallelsemottagare och närvaro. Varje vy äger sitt urval
och skickar fullständiga person-ID:n; filtrering ändrar bara synliga rader.
Roll- och undergruppssnabbval återanvänds i närvaro och Skicka nu. De påverkar
bara visade, tillåtna personer och behåller dolda val. Undergrupper hämtas
lagavgränsat med den autentiserade RLS-klienten efter befintlig behörighetskontroll.

Min översikts kalender och agenda visar alla publicerade kommande aktiviteter
i familjens lag, via medlemskap eller användarens egen lagåtkomst vid aktivitetens
lokala datum. Personliga gästkallelser och bokade uppgifter inkluderas också.
Läsning använder användarens session och RLS; klubbmedlemskap ensamt fyller inte
kalendern med andra lag. Osända kallelser ger inga svarsknappar eller svarstatus.

`invitationAvailable` delar kallelsetidens regel mellan personlig översikt,
aktivitetsdialogens personliga kallelse-API och svar-API. Framtida kallelser
returneras inte från dialogens API; svar och kommentarer nekas med 409 tills
kallelsetiden infaller. Null kallelsetid behåller direkt-/äldre kallelsers beteende.
Kontrollen avser appens schemalagda kallelsetid, inte leveranskvittens från mejl.

### Klubbstruktur och onboarding

`/system/organizations` ger plattformsadministratörer metadataadministration av
klubbar och sektioner. Klubbägare och klubbadministratörer använder samma
komponent via `/o/[slug]/admin/sections`. Dessa rättigheter ger inga extra
läsrättigheter till persondata, kallelser eller lagadministration.
Systemlänken visas i den gemensamma kontomenyn först efter en databasverifierad
plattformroll.

`/setup` och systemets klubbskapande delar ett trestegsformulär: klubb,
första sektionen med disciplin, granskning. Ett första lag är valfritt.
`create_club_workspace` sparar hela strukturen i en transaktion utan
exempelaktiviteter. Självregistrering ger skaparen ägarrollen. Systemets
hanterade klubbskapande ger inte systemadministratören klubbmedlemskap.
Klubbskapandet skapar strukturen utan mejl. Första klubbadministratören kan
sedan tilldelas eller bjudas in från klubbens sida i systemadministrationen.

Metadata-RPC:er har invoker-wrappers och avgränsade definer-kommandon i det
icke exponerade schemat `administration`. Varje kommando verifierar identitet,
plattformroll eller klubbroll, och binder sektioner till klubben. Ändringar
loggas i `audit_log`. Sektionens URL bevaras vid namnbyte; byte av disciplin
med lag eller sparat sektionsunderlag kräver en separat migrering.

Databastriggers stoppar borttagning av sista sektionen och sektioner med
lag, ansvariga, medlemsansökningar, förval eller minnen. Discipliner kan bara
tas bort utan kopplingar, sparade disciplinvärden, historik eller installerade
kodpaket. Skydden gäller även direkta tabellkommandon, inklusive relationer
som tidigare hade `ON DELETE SET NULL`.

Klubbens adressnamn kan ändras via samma metadata-RPC. Unikhetsvillkoret i databasen
förhindrar samtidiga dubletter. `club_slug_available` returnerar bara en boolean
för inloggade användare; undantag för egen klubb kräver administratörsbehörighet.
Byte av adressnamn ändrar URL:er och kräver att äldre länkar uppdateras.
Disciplinkategorier är en separat katalog med RLS, läsning för inloggade och
skrivning endast för systemadministratörer. Främmande nyckel hindrar borttagning
av använda kategorier; kategori är gruppering och styr ingen domänlogik.

`club_structure` returnerar `canChangeDiscipline` per sektion. Den privata
hjälpfunktionen `section_discipline_change_allowed` används av både läsningen
och sparkommandot, så att formulärets låsning följer databasens regel för lag,
sektionsförval och sektionsminnen. Äldre svar utan flagga behandlas som låsta.

Äldre sektioner med `discipline_id = null` kan behålla null vid namnbyte, även
om disciplinvalet är låst. Nya sektioner kräver fortfarande disciplin, och en
befintlig disciplin kan inte tömmas. Databasen kontrollerar det sparade värdet.

### Versionskontroll i öppna sidor

`npm run build` genererar ett unikt bygg-ID i `public/app-version.json` via
`prebuild`. Next-konfigurationen bäddar in samma ID i klientpaketet.
`AppUpdateNotice` i rotlayouten jämför det inbäddade ID:t med den statiska filen
vid öppning, var femte minut på synliga online-sidor samt när sidan blir synlig
eller anslutningen återkommer. Filen hämtas utan klient-/CDN-cache och innehåller
inga användaruppgifter; service workern cachar den inte. Klientens ursprungliga
ID ändras inte vid RSC-uppdatering eller navigation. Avvikande ID omfattar även
återställning till tidigare version. Nätverksfel ignoreras och inga omladdningar
sker automatiskt. Kontrollen stannar när notifieringen visas och städar timers,
lyssnare och pågående anrop vid avmontering. Utvecklingsservern kontrollerar inte
versioner. Bygg alltid via `npm run build`, även vid egen drift.

Systemets klubblista använder `system_clubs`, en invoker-wrapper runt ett
auktoriserat kommando i `administration`. Det returnerar enbart id, namn, slug
och totalt antal för sökning och sidindelning. Plattformrollen ger inte bred
läsning av `organizations` eller medlemsdata; vanliga RLS-regler behålls.

### Klubbadministratörer och publik översikt

Systemadministratörer hanterar klubbadministratörer i alla klubbar via
`system_club_admins`, oberoende av klubbmedlemskap. De kan tilldela sitt eget
verifierade konto, bjuda in och ta bort administratörsrollen. Borttagning
bevarar klubbmedlemskap och övriga lagkopplingar; även sista administratören
kan tas bort av systemadmin och därefter återställas via systemvyn.

Inbjudningar finns i en privat RLS-tabell utan klientgrants. En ny inbjudan
ersätter äldre väntande länkar till samma adress i klubben. Accept kräver
verifierad adress från `auth.users`, rätt tokenhash, en aktiv och giltig
inbjudan samt att inbjudaren fortfarande är systemadmin. Mottagaren ser
klubbnamnet före accept. Transaktionen låser klubb före inbjudan, skriver
medlemsroll och audit och förbrukar token. Inga systemroller tilldelas.

Publika klubb-, sektions- och lagöversikter kan visas för en inloggad
ickemedlem via en cookie-fri klient med befintliga anon-grants. Den läser
bara publika metadata och publicerade aktiviteter. Kontot behålls i headern
och assistenten visas bara vid inloggning, även i publik vy. Saknade klubbar/sektioner ger 404 och
skickas inte till login, vilket förhindrar redirect-loopen för inloggade.

Administratörsinbjudningar börjar i `prepared`, som inte kan förhandsvisas
eller accepteras. Ett bekräftat och registrerat utskick övergår till
`pending`. Misslyckad eller avbruten statusregistrering lämnar länken
inaktiv; ett nytt utskick ersätter den förberedda inbjudan.

### Lagadministration inom sektion

`/o/[klubb]/s/[sektion]/admin/teams` använder samma `AppShell` och
`SectionTeamAdministration` som det syntetiska exemplet på `/components`.
Hantera lag nås från sektionsraderna i både klubb- och systemadministrationen
och från sektionens översikt för behöriga användare. Detta gäller även
klubbar med en enda sektion. Sektionens befintliga `section_admin`-roll,
klubbens `owner`/`admin` och plattformens `system_admin` kan skapa lag,
ändra namn/säsong och ta bort tomma lag. Rolltilldelning för sektionsadmin
har ännu inget gränssnitt.

Publika ID-uppslag löser rutten för systemadmin utan medlemskap; själva
administrationsunderlaget hämtas alltid genom ett autentiserat kommando.
Privata kommandon i `administration` verifierar klubb och sektion tillsammans.
Lagets disciplin ärvs från sektionen, och adressen bevaras vid redigering.
Sparande låser klubb → sektion → lag och auditerar ändringen. Borttagning
skyddas även vid direkt tabellåtkomst: en trigger kontrollerar alla FK-ankrade
lagdata (även historik och privata tabeller) samt lagets scope-bundna minnen.
Ingen aktivitet, medlem eller lagbehörighet skapas automatiskt med laget.

Lagadministrationens läsning hämtar FK-katalogen en gång per
`section_team_structure` och återanvänder listan för alla lag.
Borttagningskontrollen hämtar alltid aktuella referenser på nytt; ingen
beständig cache kan missa kopplingar från senare migrationer eller tillägg.
Hjälpfunktionerna är privata och tar inte emot referenslistor från klienter.

## Telegram-prototyp

Telegram skapar frysta meddelanden per mottagare och kallad person i samma
transaktion som köläggningen. Leveransordningen är Telegram → push → e-post.
Privata kontokopplingar, engångsbevis och knappreferenser saknar klientgrants.
Knappsvar kontrollerar aktuell personåtkomst och aktivitetens livscykel under lås.
Gruppchattar får bara navigationslänkar, aldrig privata kallelser eller svar.
Vid köläggning sparas personurvalet per mottagare; snapshots får inte utökas till
andra syskon. Äldre köposter utan personurval ger en generell navigationsnotis.
Se [Telegram](telegram.md).


Telegrams kallelsepresentation delas mellan notifieringsworker och webhook.
Frysta meddelanden innehåller också disciplinnyckel och aktivitetskategori;
formatteringen använder aldrig aktuell aktivitet för att identifiera barnet.
Båda vägarna HTML-escapar verksamhetsdata och använder svenska datum utan
att konvertera redan frysta lokala tider en gång till. Svarskvittot och den
markerade knappen bygger endast på ett lyckat svar från `respond_telegram`.
Botens privata hjälpsvar leder till profilen via en vanlig länk utan
Telegram-identitet eller bevis. Kopplingen börjar först i den verifierade
inloggade användarens profil genom ett uttryckligt klick på Aktivera Telegram,
med samtyckestext vid knappen. Efter lyckat API-anrop öppnas den personliga
Telegram-länken direkt i samma flik; en reservlänk finns kvar. När användaren
återvänder hämtas status genom fokus-, pageshow- och visibilitychange-händelser.
Status hämtas automatiskt under väntan och stoppas vid aktiv koppling,
avmontering eller efter tio minuter. Vid utgång visas en ny
aktiveringsknapp och möjlighet att skapa en ny länk utan omladdning.

### Telegram som privat assistentkanal

Telegram-webhooken kan delegera privata frågor till `answerTeamAssistant` via
`telegram-assistant.ts`. En service-only RPC härleder kontot från verifierad
koppling och begränsar frekvens samt dubbletter. Dataverktygen använder ett
internt kortlivat användar-JWT och en klient med vanlig RLS. Service-klienten
överlämnas aldrig till assistenten. Grupper har en uttryckligt vald roll men
ingen verifierad komplett publik; därför körs inte assistenten i grupper.
Konfiguration, begränsningar och granskningsflöde finns i [Telegram](telegram.md).

## M09: struktur, roller och enstaka aktiviteter i React/Kotlin

Den nya appen har nu modulen `administration` för bootstrap, klubb-/sektions-/lagstruktur och administrativa roller. Den använder identitetsmodulens publika katalog för verifierade konton och uttryckliga egna personkopplingar. `activities` äger aktivitetens kommandon, typer, förval, schemaposter, audit och signalversion. Inga interna repositories anropas över modulgränser och inga modulcykler införs.

Alla administrativa skrivningar serialiseras mot en gemensam låsrad och kontrollerar session/rättigheter efter låsväntan. Aktivitetsskrivningar använder samma livscykellås som kallelsesvar. Struktur och rollfakta lagras i det privata Liquibase-schemat; äldre Next-appens databas och auth är separata. [Flöden och gränser](migration/activity-management.md).

### Aktivitetsserier och ledarens översikt i React/Kotlin

Aktivitetshanteringen skapar veckoserier i en transaktion via
`POST /api/activity-series`. Kotlin beräknar lokala datum och tider, validerar
hela urvalet och sparar tillfällen med gemensamt `series_id`. Individuell
redigering kan uttryckligen lägga till kallelser eller ersätta väntande schema
i samma transaktion. Befintliga svar och kommentarer bevaras.

Översiktens läsurval omfattar även lag där kontot har `activity.manage`,
kontrollerat genom samma aktuella rättighetskälla som aktivitetskommandona.
Personrader och svarsrätt behåller sitt separata urval. Kort utan personlig
deltagare visar enbart aktivitetsuppgifter; ingen låtsasdeltagare visas.
Redigeraren öppnas från aktivitetsdetaljer och Ny aktivitet ligger i lagrubriken.

### Gemensam Next/React-Kotlin-design

Next-appen är den kanoniska förlagan även när en funktion flyttas till Kotlin.
Båda browseringångarna importerar `src/app/ui-styles.css`, med samma stilmallar
i samma ordning. `ApplicationMenu`, `NavigationLinksView`,
`SystemAdministrationHome` och `ClubStructureAdministration` delar menyer,
översikt och klubb-/sektionsformulär. Routrarnas egna länkadaptrar och
server-/API-kommandon tillför transport utan att återskapa markup eller CSS.

React/Kotlin samlar administrationsåtkomst i en kontobunden
`AdministrationProvider`. Meny och sidor använder samma verifierade snapshot,
som laddas om vid administrativ navigation, fokus och synlighetsbyte. Kontobyte
avmonterar cachen. Läsfel döljer tidigare administrativt underlag. Backend
kontrollerar fortfarande varje skrivning och inga rättigheter härleds från menyn.

`/system` visar samma översikt som Next. Klubblista, klubbdetaljer och
systemadministratörer har separata sidor. Föreningsadministratörer går genom
`/administration` och sina förenings-/sektionsrutter, utan systemroll. Lag öppnas
via **Hantera lag**. `/administration` är fortsatt kompatibel ingång.
Katalogadministration, assistentminnen, full profil, assistentens klubbnamn och
mejlbaserade administratörsinbjudningar är ännu inte flyttade; sådant ska inte
presenteras som fungerande Kotlin-funktioner.

Den gemensamma aktivitetsdialogen jämförs visuellt mellan Next och Vite vid
320, 390, 768 och 1280 px. CI sparar skärmbilder. Klockslag får inte radbrytas;
de smalaste skärmarna staplar tidsmodulerna i båda apparna.
