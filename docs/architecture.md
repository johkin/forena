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

Assistenten översätter naturligt språk till typade verktygsanrop. Varje anrop
kontrolleras mot användarens roll och aktiv förening. Namn, avatar och tonalitet
kan anpassas per förening, men säkerhetsregler och systemprompt kan inte ersättas.
