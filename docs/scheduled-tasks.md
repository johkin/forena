# Schemalagda uppgifter och notifieringar

Affärsregler körs innan ett meddelande skapas. `notification_outbox` innehåller
redan beslutade utskick och ett färdigt `message` med subject, text, url och tag.
Leveransen hanterar push, mejlreserv och transportåterförsök. Den kontrollerar
inte kallelsesvar, matchtrupp, aktivitetens status eller mottagarens lagbehörighet.
Ett svar eller behörighetsbyte efter beslutet kan alltså ske före leverans.

`private.scheduled_tasks` är en separat beständig uppgiftskö. Service-only
`public.schedule_task(task_key, task_kind, scheduled_for, recurrence_seconds)`
skapar en engångsuppgift eller en återkommande uppgift. Samma task_key ger samma
ID utan att ändra ett befintligt schema. Uppgifter kan inte innehålla SQL eller
fritt valda endpoints. Nya typer behöver en registrerad handler i migrationen.

Första versionen registrerar tre återkommande utvärderingar varje minut:

| Typ | Underlag | Beslut |
|---|---|---|
| activity_invitations | aktivitetens kallelsetid och målgrupp | Materialisera aktuella personer och köa kallelser |
| activity_reminders | activity_reminder_schedules | Köa för aktuella obesvarade kallelser på publicerade framtida aktiviteter före deadline |
| discipline_notifications | privata capability-regler och kontrolltider | Köa matchtruppsnotiser vid aktuell brist till behöriga mottagare |

Aktiviteters exakta tider finns kvar i deras domänscheman. Dessa är inte
framtida meddelanden i outbox. Återkommande uppgifter läser förfallna tider;
framtida utveckling kan registrera enskilda domänuppgifter utan transportändring.
Direkta manuella utskick fattar beslut i användarens skrivtransaktion.

`scheduled-task-worker` och `notification-worker` anropas av två oberoende
pg_cron/pg_net-jobb med samma befintliga Vault-token. Leveransen väntar aldrig
på lyckad domänutvärdering. Uppgifter låses med FOR UPDATE SKIP LOCKED. Varje
SQL-handler körs i en subtransaktion; fel rullar tillbaka dess domänändringar och
outbox-INSERT men hindrar inte andra uppgifter. Ett avbrutet RPC rullar tillbaka
hela enqueue-transaktionen och frigör låsen; inga processing-rader lämnas kvar.
Disciplinernas rena capability-utvärdering sker i TypeScript före detta RPC.
Den läser fakta via service-only `load_capability_contexts`, följer dess cursor
och skickar högst 500 färdiga förslag. Lästa fakta är beslutsunderlaget; svar eller
behörighet kan ändras därefter. Enqueue-adaptern kontrollerar aktuell mottagarbehörighet
innan notifieringen skapas. Den försöker inte åstadkomma transaktionsisolering
mellan TypeScript-utvärderingen och senare ändrade kallelsesvar.
Misslyckad kontexthämtning eller utvärdering skickas som handlerfel till scheduler-RPC:n,
så disciplinuppgiften får beständig backoff medan andra uppgifter kan köras.

Misslyckade uppgifter får exponentiell backoff, högst fem försök. Därefter är
status failed och drift behöver undersöka last_error (SQLSTATE), rätta orsaken
och återställa status/attempts/run_at via betrodd databasadministration.
Vid lyckad återkommande körning återställs försöksräknaren och nästa körning
planeras från nu; missade minuter spelas inte upp som en burst.

Checkpoint för disciplinnotiser bevarar beslutet att köa, även efter rensning
av outbox och misslyckad leverans. Transporten behåller sina egna fem försök.
API-läsning av privata matchräknare kräver fortfarande aktuell behörighet.

Driftsättning applicerar migrationen före de nya arbetarna. Den nya transporten
behöver message och uppgiftsarbetaren behöver RPC:n. Den gamla
prepare_capability_notification finns tillfälligt som service-only kompatibilitet
under uppgraderingen men returnerar endast den sparade payloaden och fattar inga
beslut. Den nya transporten anropar den aldrig. Deploy production driftsätter båda arbetarna efter
lyckad migration och från samma CI-verifierade commit. Det separata
worker-workflowet finns som manuell återställningsväg från main.
Inga nya hemligheter behövs. pg_cron ger upp till cirka en minut till utvärdering
plus cirka en minut till leverans när de oberoende jobben kör i omvänd ordning.

Vid uppgradering till capability-implementationer fortsätter äldre arbetare
kallelse- och påminnelseuppgifter, men lämnar disciplinuppgiften förfallen tills
nya arbetaren är driftsatt. Gamla profilarrayer kan inte köa notifieringar eller
förbruka disciplinuppgiftens schema. Inga redan köade meddelanden ändras.


Disciplinuppgiften konsumerar först `private.discipline_activity_events`. Registrerad `onActivity` returnerar atomärt applicerade värde- och schemaoperationer; därefter laddas förfallna `private.discipline_operations` för capability-utvärdering. Händelser för samma aktivitet är ordnade och leased; fem fel kräver återställning av operatör. Andra aktiviteters arbete fortsätter. Se [disciplinernas livscykel](disciplines.md#disciplinkatalog-och-aktivitetshändelser).
