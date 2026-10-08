# Signaler från capabilities

En capability returnerar en strukturerad `CapabilitySignal` från
`evaluateSignal(context)`: stabil typ, allvarlighetsgrad, rubrik, förklaring,
fakta och tillåtna applikationsåtgärder. Implementation och text ägs av
capability-koden. Den gemensamma infrastrukturen känner inte till sportregler
eller räknar fram spelarbrist med AI.

`targetTeamSize` är första implementationen. En publicerad, framtida match med
önskad truppstorlek och spelarkallelser ger en signal när för få spelare tackat
ja. Importerade aktiviteter och andra aktivitetstyper undantas. Inlånade
spelare med explicit deltagarroll ingår. Signalen fungerar även när
notifieringar är avstängda och efter att notifieringscheckpoints har förbrukats.
Den blir en varning under sista dygnet; tidigare visas den som information.

## Lagring och livscykel

`public.capability_signals` lagrar aktuell status, senaste fakta och åtgärder,
upptäckt/utvärdering, revision och episod. En unik nyckel för aktivitet +
disciplin + capability + signaltyp gör upprepade utvärderingar idempotenta.
`public.signal_actions` bevarar utförda påminnelser, fler spelarkallelser och
avfärdningar med aktör, tidpunkt, episod och resultat. Resultatet `queued`
betyder kölagt för leverans; det är inget bevis på mottagen push eller e-post.

- **active**: ett problem behöver fortfarande hanteras.
- **dismissed**: en behörig ledare har avfärdat signalen för hela laget.
  Fortsatta utvärderingar bevarar avfärdningen och nya signalnotiser undertrycks.
- **resolved**: capabilityn ger inte längre någon signal. Vid återkomst
  återaktiveras samma rad med en ny episod och tidigare avfärdning nollställs.

En påminnelse löser inte problemet. Senaste åtgärden visas och ny påminnelse
föreslås först efter en timme. Efter svarstid eller när alla spelare svarat
föreslås endast fler kallelser. Åtgärdshistoriken återanvänder befintliga
kommandons transaktioner; en klickad knapp registreras inte som utförd åtgärd.
Aktivitetens start, inställning, ändrad typ eller disciplin och borttagna
förutsättningar avslutar signalen vid nästa lyckade utvärdering. Fysiskt
borttagna aktiviteter tar bort tillhörande signaler/historik genom FK-cascade.

## Utvärdering och samtidighet

Aktiviteter, kallelsesvar/-roller, disciplinvärden, medlemskap och
sektionens disciplinändringar markerar aktivitetens enda beständiga
utvärderingsplats i `private.signal_evaluation_queue`. Befintliga framtida
aktiviteter inkluderas vid migreringen. Inga notifieringsregler skapas för dem.

`scheduled-task-worker` behandlar disciplinhändelser och därefter högst 500
signalaktiviteter per anrop, i batcher om högst 100. Cooldown gör att nästa
anrop fortsätter med andra aktiviteter. Framtida tillämpliga aktiviteter
utvärderas även periodiskt för svarstid, allvarlighetsgrad och åtgärdscooldown.
Startade aktiviteter och aktiviteter utan tillämpliga capabilities lämnar
kön. Senare förändringar kan lägga tillbaka dem.

Dataadaptern levererar aktuella, behörigt lästa fakta och det versionsbundna
paketets definition. Capabilityn bedömer dessa utan databasåtkomst. En tom
lyckad utvärdering avslutar tidigare signaler för aktiviteten. Saknad runtime
eller misslyckad läsning/sparning är ett fel, aldrig bevis på ett löst problem;
claimens cooldown lämnar arbetet möjligt att försöka igen.

Ändrade indata och nya claims ökar utvärderingsrevisionen. Sparandet avvisar
äldre resultat atomärt. Påminnelseknappen utvärderar capabilityn igen på servern;
den slutliga transaktionen verifierar både signalens och indatas revision,
behörighet och påminnelsens förutsättningar. Inga färdiga outbox-meddelanden
omprövas eller tas bort. Avfärdningen påverkar endast framtida notifieringsbeslut.

## Åtkomst och visning

Läsning och avfärdning kräver `invitation.manage` för signalens eget lag.
RLS begränsar även direkt läsning av båda offentliga tabellerna; klienter kan
inte skriva fakta, status eller historik direkt. Utvärderings-RPC:er kan bara
anropas av service role. Familjens kallelseåtkomst ger ingen signalåtkomst.

Lagöversiktens **För laget** visar rubrik, faktaförklaring, aktivitetslänk,
berörda åtgärder och senaste åtgärd. Närvaro behåller högsta prioritet.
Påminnelse och gemensam avfärdning granskas före utförandet. Fler kallelser
öppnar den befintliga aktivitetsdialogens deltagarval och förhandsgranskning.

Lagassistenten läser samma behörighetskontrollerade signaler som strukturerad
kontext. Den kan förklara och föreslå befintliga åtgärder; den får inget nytt
skrivverktyg. Utvärderingstid och begränsat urval följer med, och misslyckad
signalläsning markeras uttryckligen som otillgänglig.
