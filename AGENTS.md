# Arbetsinstruktioner för agenter

Dessa instruktioner gäller hela repot.

## Projektdokumentation

Läs de dokument som berör uppgiften innan implementation. Håll dokumentationen
uppdaterad när ett beslut eller en gemensam princip ändras.

- [Arkitektur och systemdesign](docs/architecture.md) – lager, domänregler,
  persistens, assistentens struktur och gemensamma gränssnittskomponenter.
- [Gränssnittets designregler](docs/design-spec.md) – mobile-first, menyer,
  header, footer, formulär, dialoger och medlemsvyer.
- [Säkerhetsarkitektur](docs/security-architecture.md) – säkerhets- och
  behörighetsprinciper.
- [Assistentminne](docs/assistant-memory.md) – förslag, bekräftelse,
  sektionsarv och avgränsning mot systemadministration.
- [Aktiviteters tidsregler](docs/activity-time-rules.md) – datumuttryck,
  tidszoner, ärvda förval och återstående appintegration.
- [MCP-server](docs/mcp.md) – verktyg, behörigheter, transport och anslutning.
- [Roadmap](docs/roadmap.md) – planerad utveckling och prioriteringar.

Vid gränssnittsändringar ska både arkitekturen och designreglerna följas.
Menyer, header och footer ska återanvändas från centrala komponenter; skapa
inte egna kopior för enskilda sidor eller administrationsområden.

## Sammanhållna ändringar och pushar

- Läs relevanta filer och planera ändringen innan du börjar skriva. Samla kod,
  typer, migrationer, tester och dokumentation som hör till samma uppgift i en
  sammanhängande ändring.
- Arbeta lokalt när det är möjligt. Skapa en eller ett fåtal logiska commits per
  avgränsad uppgift eller granskningsomgång och pusha dem tillsammans. Undvik
  separata pushar för varje fil, liten rättning eller granskningskommentar.
- När ändringar görs via GitHub-verktyg ska flera relaterade filer samlas i en
  atomär commit, exempelvis genom Git tree/commit-operationer. Använd inte en
  serie individuella filuppdateringar som var och en startar en ny CI-körning.
- Kontrollera hela diffen före push. Kontrollera särskilt att inga filer,
  typer eller tester saknas och att orelaterade ändringar inte följer med.

## Validering före push

- Kör relevanta tester och kontroller före push. För kodändringar ingår normalt
  `npm test`, `npm run typecheck`, `npm run lint` och `npm run build`.
- Vid databasändringar ska migrationerna och databassäkerhetstesterna verifieras
  mot en lokal eller uttryckligen avsedd testdatabas med `supabase db reset` och
  `supabase test db`. Kör aldrig en databasåterställning mot produktion.
- För rena dokumentationsändringar räcker kontroll av diff, formatering och
  berörda länkar eller kommandon; kör inte appens tester enbart för att ändra text.
- Om miljön inte medger en kontroll, redovisa det tydligt. Använd inte CI som en
  ersättning för all lokal validering genom att pusha en rättning i taget.

## Låt CI bli färdigt

- Efter en push: följ körningen för den senaste committen och låt den bli färdig
  innan nästa uppdatering. Upprepade pushar avbryter den pågående körningen när
  `cancel-in-progress: true` används.
- Pusha inte kosmetiska småändringar medan CI kör. Samla i stället återstående
  ändringar till nästa granskningsomgång. En körning får ersättas när ett
  verifierat blockerande fel gör fortsatt körning meningslös, men även då ska
  rättningarna samlas och kontrolleras före nästa push.
- Hämta status vid relevanta tillfällen eller med rimliga intervall, inte i en
  tät pollningsloop. Om CI inte hinner bli klart under arbetstillfället, redovisa
  att det fortfarande pågår i stället för att påstå att verifieringen är klar.
- Behåll CI-skydden. Stäng inte av tester, obligatoriska kontroller eller
  `cancel-in-progress`, och använd inte CI-skip för att dölja ineffektiva pushar.

## Rapportera rätt resultat

- Knyt verifieringsresultatet till aktuell commit eller körning. Ett grönt
  resultat för en äldre commit verifierar inte senare ändringar.
- Skilj mellan godkända, misslyckade, överhoppade, pågående och ej körda kontroller.
- Sammanfatta vad som ändrats, var ändringen finns och vad som faktiskt har
  verifierats. Lova inte fortsatt bevakning om ingen sådan har satts upp.
