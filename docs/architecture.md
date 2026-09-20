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

## Planerad persistens

PostgreSQL med Row Level Security. En kommande migration inför tabellerna
`organizations`, `teams`, `people`, `memberships`, `activities`,
`invitations`, `push_subscriptions`, `notification_outbox` och `audit_log`.

## Assistenten

Assistenten översätter naturligt språk till typade verktygsanrop. Varje anrop
kontrolleras mot användarens roll och aktiv förening. Namn, avatar och tonalitet
kan anpassas per förening, men säkerhetsregler och systemprompt kan inte ersättas.
