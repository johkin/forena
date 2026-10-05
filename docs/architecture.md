# Arkitektur

Förena byggs som en multi-tenant-applikation där varje skrivning går genom ett
validerat applikationskommando. Gränssnitt och AI-assistent använder samma
kommandon; AI:n får aldrig direkt databasåtkomst.

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

Återkommande aktivitetsutkast innehåller veckodagar och slutdatum och öppnar
aktivitetsdialogen i serieläge. Saknas slutdatum måste ledaren ange det innan
förhandsgranskningen. Utkastet valideras mot samma serieregler som dialogen och
sparas först efter ledarens granskning.

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

`activity_defaults` lagrar sparsamma override-värden, regelversion och revision.
`values.options` lagrar valbara interna tidsvärden per fält; listorna ärvs
oberoende av valda förval och ersätts helt vid lokal override.
`loadActivityConfiguration` är den gemensamma läsvägen för dialog och assistent;
`resolveActivityDefaults` är den rena domänfunktionen för fältvis arv.
Skrivkommandot kontrollerar mål och behörighet på både server- och databasnivå.
`reminder_send_ats` materialiseras atomärt till påminnelsescheman vid samma
aktivitetsskrivning. Se [aktiviteters tidsregler](activity-time-rules.md).
