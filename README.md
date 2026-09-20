# Förena

Förena är en öppen, AI-native plattform för föreningslivet. Målet är att samla
föreningens administration, kommunikation och vardagsarbete utan att ersätta
människorna som fattar besluten.

Projektet är i en tidig utvecklingsfas. Den första vertikala delen demonstrerar
flödet förening → lag → aktivitet → kallelse → svar.

## Kom igång

```bash
npm install
npm run dev
```

Öppna <http://localhost:3000>.

## Kommandon

```bash
npm run dev       # lokal utvecklingsserver
npm run build     # produktionsbygge
npm run lint      # statisk kodkontroll
npm test          # domäntester
npm run typecheck # TypeScript utan emit
```

## Principer

- Föreningens data är strukturerad; AI producerar validerade kommandon.
- Behörighet kontrolleras i applikationslagret, aldrig enbart i gränssnittet.
- Känsliga eller breda åtgärder kräver förhandsgranskning och godkännande.
- Viktiga förändringar ska kunna revisionsloggas.
- Plattformen byggs multi-tenant från början.

Se [docs/architecture.md](docs/architecture.md) för den första arkitekturen och
[docs/roadmap.md](docs/roadmap.md) för föreslagen ordning framåt.

## Licens

GNU Affero General Public License v3.0. Se [LICENSE](LICENSE).
