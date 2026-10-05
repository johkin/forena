# Assistentminne: granskning och bekräftelse

Minnen kompletterar strukturerad verksamhetsdata. Faktiska aktiviteter,
medlemskap och behörigheter kommer fortfarande från domänmodellen.
Se även [arkitekturen](architecture.md), [designreglerna](design-spec.md)
och [säkerhetsarkitekturen](security-architecture.md).

## Modellens förslag är inte en skrivbehörighet

`remember` producerar enbart ett validerat förslag i det aktuella svaret.
Verktyget har ingen databasklient och kan varken spara eller bekräfta minnen.
Förslagen lagras inte som varaktig kunskap och tas inte med som sparade minnen
i senare modellkontext. Detta gäller även personliga minnesförslag.

Gränssnittet visar exakt text, nivå och mottagande arbetsyta samt knapparna
**Spara minne** och **Avvisa**. Texten visas som vanlig text, inte körbar HTML.
Ett befintligt minne med samma nyckel inom samma organisation, nivå och
disciplin uppdateras efter bekräftelse; nyckellösa minnen skapas separat.

Endast ett separat, autentiserat anrop från **Spara minne** får skriva.
Anropet validerar hela innehållet igen och kontrollerar aktuell användare,
föreningsmedlemskap, målets förening och rättigheten att hantera den valda
nivån. RLS kontrollerar skrivningen igen i databasen. Ett ja i chatten eller
instruktioner i kallelsesvar kan aldrig ersätta detta bekräftelsesteg.

Samma förslag utan nyckel behåller sitt ID vid ett nytt sparförsök så att
upprepad bekräftelse inte skapar dubbletter. Fel och noll träffade rader får
inte presenteras som lyckade ändringar. Ett avvisat förslag skrivs inte alls.

Bekräftelse ersätter inte dataminimering. Assistenten ska fortfarande inte
föreslå lagring av hälsodata, kallelsesvar eller andra känsliga uppgifter.

## Sektionsarv och systemadministration

Sektionsminnen kräver föreningsmedlemskap och åtkomst till just sektionen:
klubbadministration, sektionsuppdrag eller aktiv åtkomst till ett lag i sektionen.
Lagets deltagare och vårdnadshavare kan därmed ärva relevanta sektionsminnen,
men en medlem i en annan sektion får inte tillgång enbart genom klubbmedlemskap.

Systemminnen administreras separat under `/system`. Den vanliga
minneshanteringen och assistentens förslag ska inte ha en System-flik eller
kunna skriva på systemnivå. Centrala minnen får användas som bakgrundskontext
utan att det ger användaren administrativa rättigheter till dem.

## Minnesstyrda påminnelseförslag

Lagassistenten kan bedöma om en påminnelse behövs med `assessReminder` och
visa ett förslag med `proposeReminder`. Verktygen är skrivskyddade och erbjuds
bara användare med `invitation.manage` i det aktuella laget. Bedömningen läser
aktuella ja/nej/obesvarade svar, separata spelarantal, aktivitetstyp, start,
svarstid och senaste registrerade köade/skickade påminnelse. Namn och
kontaktuppgifter behövs inte i detta underlag.

Tillämpliga, sparade delade minnen kan påverka bedömningen, exempelvis lagets
önskade spelarantal eller rutin för uppföljning. Lag går före sektion, klubb
och system vid motstridiga preferenser; disciplin begränsar vilka minnen som
gäller. Personliga minnen ingår inte i påminnelseverktygens underlag och får
inte styra utskick till laget. Aktuell strukturerad data och behörighetsregler
har alltid företräde. Minnesförslag som ännu inte sparats räknas inte som minnen.

Förhandsgranskningen visar motivering, svarsläge, mottagarkategori och exakt
vilka minnestexter modellen hänvisade till. Ett separat klick på **Skicka
påminnelse** krävs. Ett ja i chatten, ett minne eller ett verktygsanrop kan
aldrig köa ett utskick. **Avvisa** skriver ingenting.

Bekräftelsekommandot läser om behörighet och kallelseläge. Ändrade mottagare,
svar, aktivitetstider eller senaste påminnelse kräver ett nytt förslag.
Opublicerade, inställda och påbörjade aktiviteter, aktiviteter utan obesvarade
kallelser och påminnelser som köats/skickats den senaste timmen blockeras i
detta assistentflöde. Det befintliga databas-kommandot löser aktuella obesvarade
personers konton och målsmän och kontrollerar behörighet igen. Köad leverans
presenteras som köad, inte redan skickad.

Automatiska minnesstyrda utskick ingår inte. De behöver uttryckligen aktiverade
strukturerade regler. Schemalagda påminnelser och aktiviteternas tidsförval
fortsätter använda sin befintliga deterministiska modell.
