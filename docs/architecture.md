# Arkitektur

Förena byggs som en multi-tenant-applikation där varje skrivning går genom ett
validerat applikationskommando. Gränssnitt och AI-assistent använder samma
kommandon; AI:n får aldrig direkt databasåtkomst.

## Lager

1. **Domän** – förening, lag, person, aktivitet, kallelse och medlemskap.
2. **Applikation** – kommandon, behörighetskontroll och transaktioner.
3. **Infrastruktur** – PostgreSQL, objektlagring, push, mejl och AI-provider.
4. **Gränssnitt** – server-renderad webbapp och installerbar PWA.

## Domänregler i första milstolpen

- Alla poster tillhör explicit en förening.
- Ett lag tillhör exakt en förening.
- En kallelse avser en aktivitet och en medlem.
- Ett första svar får inte skrivas över utan ett separat ändringskommando.
- Bred kommunikation förhandsgranskas innan den skickas.

## Persistens

PostgreSQL körs genom Supabase. Lokalt startar Supabase CLI en containerbaserad
stack med databas, Auth, Storage och Studio. Schemat hanteras med SQL-migrationer
i `supabase/migrations` och kan återskapas deterministiskt med `npm run db:reset`.

Den första migrationen innehåller `organizations`, `profiles`,
`organization_members`, `teams`, `people`, `person_guardians`, `memberships`,
`activities`, `invitations`, `push_subscriptions`, `notification_outbox` och
`audit_log`. Samtliga tabeller har Row Level Security. Hjälpfunktionerna
`is_organization_member` och `has_organization_role` används av policyerna för
att isolera föreningar och skilja vanliga medlemmar från ledare och administratörer.

Serverkod och webbläsarkod har separata Supabase-klienter. Service role-nyckeln
ska aldrig exponeras som en `NEXT_PUBLIC_`-variabel eller skickas till PWA:n.

## Assistenten

Assistenten översätter naturligt språk till typade verktygsanrop. Varje anrop
kontrolleras mot användarens roll och aktiv förening. Namn, avatar och tonalitet
kan anpassas per förening, men säkerhetsregler och systemprompt kan inte ersättas.
