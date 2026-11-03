# PR-Agent med OpenAI

[Workflowen](../.github/workflows/pr-agent.yml) kör PR-Agent 0.49.0 i GitHub
Actions och använder OpenAI via en separat API-nyckel. Den är fristående från
appens AI-funktioner.

## Aktivera

1. Skapa en projektnyckel på [OpenAI API keys](https://platform.openai.com/api-keys).
   Projektet behöver API-fakturering och åtkomst till `gpt-6.1-sol`
   (reservmodell: `gpt-6-luna`). API-användning debiteras separat från ChatGPT.
2. Öppna [repots Actions-hemligheter](https://github.com/johkin/forena/settings/secrets/actions)
   och välj **New repository secret**. Ange `OPENAI_KEY` som namn och
   API-nyckeln som värde. Lägg aldrig nyckeln i kod, PR-kommentarer eller chatt.
   `GITHUB_TOKEN` skapas automatiskt av GitHub.
3. Merga workflowen till `main`. Öppna sedan en PR från en branch i samma repo,
   eller uppdatera en befintlig PR, och kontrollera körningen **PR Agent** under
   Actions. Kommentarskommandon fungerar när workflowen finns på `main`.

Om nyckeln saknas stannar körningen med ett tydligt konfigurationsfel.
Vid autentiserings-, modellåtkomst- eller kvotfel kontrolleras OpenAI-projektets
nyckel, modellbehörighet och API-fakturering. Modell och reservmodell anges i
workflowen och kan ändras där.

## Beteende

- Automatisk granskning på svenska när en PR öppnas, återöppnas, lämnar utkast
  eller får nya commits, även från botar. Utkast och PR:er från forks hoppas över.
- Bara granskning körs automatiskt. PR-beskrivningar skrivs inte om och separata
  kodförslag körs först på begäran, för att begränsa automatiska modellanrop.
- Ägare, organisationsmedlemmar och samarbetspartner kan kommentera en öppen PR
  med `/review`, `/ask "fråga"`, `/improve` eller `/describe`. Övrigas kommentarer
  och botkommentarer startar inte agenten. Ett betrott kommando kan även granska
  en fork-PR via GitHubs API.
- En ny körning ersätter en pågående körning för samma PR. Varje körning har
  högst 15 minuter.
- Granskningen ersätter inte tester eller mänskligt beslut om merge.

## Åtkomst och data

Agenten läser kod och PR-underlag via GitHubs API och skickar analysunderlaget
till OpenAI. Workflowen checkar inte ut eller kör PR-kod. GitHub-token har
läsåtkomst till kod och skrivåtkomst till issues och pull requests för att
publicera svar. Agenten har inga credentials till Förena, medlemsdata eller
produktionsdatabasen. Lägg aldrig personuppgifter eller andra hemligheter i
PR-underlaget.

Docker-imagen är låst till releasetaggen `0.49.0-github_action`, enligt
[PR-Agents versionspolicy](https://github.com/The-PR-Agent/pr-agent/blob/v0.49.0/SECURITY.md).
Uppdateringar görs genom en separat ändring av workflowen.
