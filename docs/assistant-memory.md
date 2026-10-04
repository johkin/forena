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
