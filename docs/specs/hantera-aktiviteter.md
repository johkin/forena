# Skapa och redigera aktiviteter

- Status: Redo
- Senast uppdaterad: 2026-10-27
- Berörda dokument: [Aktivitetshantering i React/Kotlin](../migration/activity-management.md), [Arkitektur](../architecture.md#redigering-av-befintlig-serie), [Designregler](../design-spec.md), [Tidsregler](../activity-time-rules.md), [Bemanningsschema](../activity-duty-schedule.md), [Kalender](kalender-vy.md), [Närvaro](narvaroregistrering.md), [AI-assistent](ai-assistent.md)
- Implementation och verifiering: Kravspecen är godkänd. Ingen implementation beställd för denna spec. Befintlig funktion och tidigare lokal iOS-anpassning är separata från nya krav.

## Problem och mål

Användaren vill ha en samlad spec för aktivitetshantering med befintlig funktion
som utgångspunkt. Intervjun följer på problem med att skapa en aktivitetsserie
på iOS/Safari från lagets sida och upptäckten att serieändringar saknas i den
nya appen. Målet är samlad aktivitetshantering i den nya appen, med äldre
appens befintliga funktion som underlag och uttryckligt granskade begränsningar.

## Omfattning

### Ingår

- Skapa och redigera enstaka aktiviteter och serier i den nya appen.
- Förlänga eller förkorta en befintlig serie och ändra dess veckodagar.
- Ställa in och ta bort enstaka tillfällen eller serier.
- Regler för hur ändringar påverkar kallelser, svar och påminnelser.
- Kopplingarna till kalender, närvaro och AI-assistent.

### Ingår inte

- Att genomföra intervjun innebär inte en beställning av implementation.
- Kalenderns, närvaroregistreringens och AI-assistentens egna funktioner
  behåller sina separata specar. Endast kopplingarna till aktivitetshanteringen
  ingår här.
- Återaktivering av inställda aktiviteter ingår inte.

## Användare, roller och flöden

### Beslutat huvudflöde

1. En behörig användare öppnar **Ny aktivitet** från lagets sida eller öppnar
   en befintlig aktivitet för redigering, inställning eller borttagning.
2. Vid skapande väljs enstaka aktivitet eller veckoserie, med disciplinstyrd
   förvald aktivitetstyp. Vid ändring väljs endast tillfället eller detta
   och kommande. Enskild efterregistrering följer K-045.
3. Användaren anger eller ändrar uppgifter, serieupplägg och vid behov
   kallelseinställningar. För bokad bemanning görs uttryckliga val per aktivitet.
4. Förhandsgranskningen visar tillfällen, följder för svar och utskick,
   bemanningsval och överhoppningar. Ogiltiga datum, scheman eller konflikter
   måste rättas före sparande.
5. Efter uttrycklig bekräftelse kontrolleras aktuellt underlag och behörighet
   igen och hela ändringen sparas tillsammans med meddelandeuppdragen.
6. Användaren får tydlig spar-/leveransstatus. Utkast behålls vid sparfel
   och konflikt, medan ett senare leveransfel inte återställer sparad data.

### Kartlagt nuläge – inte automatiskt beslutade framtida krav

- Behöriga användare öppnar **Ny aktivitet** från lagets sida. Redigering,
  inställning och eventuell borttagning nås från aktivitetens detaljer.
- Enstaka aktiviteter har typ, titel, plats, valfri beskrivning, datum,
  start/slut och samling. Samma dag och flerdagars stöds.
- Veckoserier har start-/slutdatum, valda veckodagar, starttid och passlängd.
  Skapandet förhandsgranskas och sparas atomärt. Nuvarande gränser är
  366 dagars period och högst 100 tillfällen.
- Kallelseval vid skapande är ingen kallelse, direkt valda personer eller
  schemaläggning. Serier använder schemaläggning, inte Skicka nu.
  Schemaläggning har målgrupper, sista svarstid och påminnelser.
- Enskild redigering i React/Kotlin kan behålla befintliga kallelser eller
  uttryckligen lägga till personer/ersätta väntande schema; tidigare svar och
  kommentarer bevaras.
- Äldre Next-appen erbjuder **endast denna aktivitet** eller **denna och
  kommande aktiviteter** vid redigering och borttagning av en serie.
  Den nya React/Kotlin-appen skapar serier men exponerar bara enskild redigering.
- Äldre serieändring hoppar över passerade, inställda, importerade och
  individuellt ändrade tillfällen. Den förhandsgranskar urvalet, bevarar
  kallelsetider/svar och blockerar tidsändring som kräver anpassning av uppgifter.
- Skickade kallelser skyddar historiken: aktiviteten ställs in i stället för
  att raderas. Den beslutade målbildens livscykelregler anges i kraven nedan.

## Krav

### Omfattning, grundformulär och behörighet

- K-001: Den nya appen ska stödja skapande och redigering av både enstaka
  aktiviteter och serier samt inställning och borttagning av enstaka tillfällen
  eller serier, enligt urvals- och livscykelreglerna nedan.
- K-002: Specen ska fastställa hur aktivitetsändringar påverkar kallelser,
  tidigare svar och påminnelser. Kalender, närvaro och AI ska behålla sina
  separata specar; kopplingarna till aktivitetshanteringen beskrivs här.
- K-027: Befintlig behörighetsuppdelning ska behållas. Aktivitetsbehörighet
  (`activity.manage`) krävs för att skapa, redigera, ställa in och ta bort.
  Kallelsebehörighet (`invitation.manage`) krävs för mottagarval,
  kallelseinställningar och bemanning. Automatiska ändringsmeddelanden och
  krav på nya svar ska följa en i övrigt tillåten aktivitetsändring utan ett
  separat manuellt utskicksbeslut. Om ändringen kräver ett bemanningsval enligt
  K-020–K-023 krävs även kallelsebehörighet. Vanligt medlemskap eller personlig
  kallelse ska inte ge administrativa rättigheter. Behörigheten ska fortsatt
  begränsas till användarens klubb, sektion eller lag enligt befintlig modell.
- K-030: Grundformuläret ska behållas: aktivitetstyp, titel och plats ska vara
  obligatoriska och beskrivning valfri. Datum, start-/sluttid och samling ska
  anges. Enstaka aktiviteter ska stödja samma dag och flerdagars. Serier ska
  återkomma veckovis på valda dagar under en angiven period med gemensam tid,
  längd, samling och plats enligt K-024. Kallelse ska vara valfri. Enstaka
  aktiviteter ska kunna kalla valda personer direkt eller schemalägga;
  serier ska använda schemaläggning.
- K-031: Förvald aktivitetstyp vid skapande ska kunna styras av disciplinen.
  Detta avser vilken typ som initialt väljs i formuläret, inte enbart typens
  tidsförval. Arv och fallback regleras av K-032.
- K-032: Förvald aktivitetstyp ska väljas i ordningen lagets eget val,
  sektionens val och disciplinens standardtyp. Användaren ska alltid kunna
  välja en annan tillåten aktivitetstyp för aktiviteten. Om inget giltigt
  förval finns ska **Övrigt** användas; om även den typen saknas ska användaren
  behöva välja typ. Ett ogiltigt eller otillåtet typförval får inte sparas
  som aktivitetens typ.
- K-033: Vid skapande ska vald aktivitetstyp ge förval för längd, samling
  och kallelsetider. Om typen byts ska endast fält som användaren ännu inte
  själv ändrat uppdateras med nya förval. Ändrade disciplin-, sektions- eller
  lagförval får inte räkna om redan sparade aktiviteter. Vid redigering ska
  aktivitetens sparade värden behållas tills användaren uttryckligen ändrar dem.
- K-034: En serieperiod som skapas eller ändras får omfatta högst 366 dagar
  och högst 100 planerade tillfällen inom perioden. Vid förlängning ska
  upplägget från det valda tillfället framåt kontrolleras; tidigare tillfällen
  och historik ska ligga kvar utan att hindra förlängningen. En aktivitets
  längd ska vara minst 1 minut och högst 7 dygn. En aktivitet får ha högst
  5 påminnelser. Överskridna gränser ska nekas före sparande.
- K-045: En behörig användare ska kunna efterregistrera en enstaka aktivitet
  som redan avslutats. Den ska skapas utan kallelser eller andra utskick,
  visas direkt i läsläge efter sparandet och tillåta närvaroregistrering
  enligt närvarospecen. Serier ska däremot endast skapa framtida tillfällen.
  Efterregistrering ska omfattas av samma behörighetskontroll, granskning och
  giltiga aktivitetsuppgifter som övrigt skapande.

### Serieomfattning, undantag och livscykel

- K-003: Vid redigering, inställning och borttagning i en serie ska användaren
  välja **Endast detta tillfälle** eller **Detta och kommande tillfällen**.
  Omfattningen utgår från det öppnade tillfället; tidigare tillfällen lämnas
  orörda. Ett separat val för hela serien inklusive tidigare tillfällen ingår inte.
  Tidsgränser följer K-014/K-043 och individuella undantag K-004.
- K-004: Vid redigering, inställning och borttagning av **Detta och kommande
  tillfällen** ska redan
  individuellt ändrade aktiviteter hoppas över helt. Skyddet gäller hela
  aktiviteten, inte bara dess individuellt ändrade fält. Till exempel ska en
  aktivitet med individuellt ändrad tid behålla även sin gamla plats när
  seriens plats ändras. Det uttryckligen öppnade utgångstillfället är undantaget
  från detta skydd enligt K-005.
- K-005: Det uttryckligen öppnade tillfället ska omfattas av redigering,
  inställning eller borttagning även om det redan ändrats individuellt.
  Detta gäller båda omfattningsvalen. Vid **Detta och kommande tillfällen**
  ska övriga individuellt ändrade tillfällen fortfarande hoppas över enligt
  K-004. Övriga livscykel- och behörighetsregler gäller fortfarande.
- K-014: Före aktivitetens start ska både enskild redigering och serieändring
  vara tillgängliga enligt övriga behörighets- och urvalsregler. Från och med
  starttiden och fram till sluttiden ska aktiviteten kunna redigeras enskilt,
  men serieändring får inte erbjudas från det pågående tillfället. Från och med
  sluttiden ska aktivitetens uppgifter vara i läsläge. Närvaro får fortfarande
  korrigeras enligt närvarospecen. Serieändringar får bara omfatta tillfällen
  vars starttid ännu inte har inträffat och får inte ändra pågående eller
  avslutade aktiviteter.
- K-043: Samma borttagningsregel ska gälla vid manuell borttagning som när
  tillfällen tas bort genom serieändring: utan skickade kallelser ska en
  aktivitet kunna tas bort; med skickade kallelser ska den endast kunna
  ställas in med bevarad historik. Inställda och avslutade aktiviteters egna
  uppgifter ska visas i läsläge. Ett ännu inte påbörjat bemanningspass med
  egen senare tid kan fortfarande bokas enligt den i bemanningsintervjun
  bekräftade regeln i [bemanningsspecens K-015](arbetspass-och-bemanning.md).
  Inställd aktivitet stänger dock all självservice. Närvarokorrigering ska
  fortsatt följa närvarospecen.
  Återaktivering av inställda aktiviteter ingår inte i denna leverans.
- K-046: Inställda och enskilt borttagna tillfällen ska skyddas mot
  automatisk återkomst när serien senare förlängs eller dess veckodagar
  ändras. Aktiviteterna, kallelserna och bokningarna får inte automatiskt
  återskapas eller återaktiveras. Berörda sådana tillfällen ska visas som
  överhoppade i förhandsgranskningen. Om ett nytt tillfälle behövs på samma
  datum ska användaren uttryckligen skapa det som en ny aktivitet.

### Serieupplägg och ändringar

- K-006: Användaren ska kunna förlänga en befintlig serie genom att ändra
  dess slutdatum och ändra seriens återkommande veckodagar enligt K-007–K-013.
  Att förkorta en serie genom tidigare slutdatum ska också stödjas enligt K-012.
- K-007: När en återkommande veckodag byts, exempelvis tisdag till onsdag,
  ska befintliga aktiviteter flyttas och behålla sin identitet, historik och
  kopplingar till kallelser och svar. De ska inte ersättas med nya aktiviteter.
  Individuellt ändrade tillfällen skyddas enligt K-004 och K-005. Hur flera
  gamla/nya veckodagar matchas regleras av K-010 och veckokopplingen av K-035.
  Hantering vid periodgränser regleras av K-036.
  Bevarade svar innebär bevarad historik och koppling; aktuella svar kan
  återställas enligt K-016.
- K-008: När en extra återkommande veckodag läggs till ska nya aktiviteter
  skapas för den dagen inom ändringens omfattning och seriens period.
  När en återkommande veckodag tas bort ska dess berörda aktiviteter tas bort
  om inga kallelser har skickats, annars ställas in med bevarad historik.
  Individuellt ändrade tillfällen hoppas över enligt K-004, med det öppnade
  tillfällets särregel i K-005. Flytt och tillägg/borttagning av dagar ska
  skiljas åt enligt K-010.
- K-009: Förhandsgranskningen vid ändring av återkommande dagar ska tydligt
  visa vilka aktiviteter som skapas, tas bort, ställs in och hoppas över.
- K-010: Serieformuläret ska erbjuda tydliga åtgärder **Byt dag**, **Lägg till
  dag** och **Ta bort dag**. **Byt dag** ska ange vilken befintlig veckodag
  som flyttas till vilken ny veckodag enligt K-007. **Lägg till dag** och
  **Ta bort dag** ska ge respektive utfall enligt K-008. Vid flera dagbyten
  ska varje koppling vara uttrycklig, exempelvis måndag till tisdag och
  torsdag till fredag; systemet ska inte gissa kopplingen från enbart ett
  nytt urval av veckodagar.
- K-011: Nya tillfällen vid förlängning eller tillagd veckodag ska utgå från
  seriens aktuella gemensamma inställningar: aktivitetstyp, titel, plats,
  beskrivning, tid, längd, samling och kallelseinställningar. Uppgifterna ska
  visas i formuläret och kunna justeras före förhandsgranskningen. Ett
  individuellt ändrat tillfälle får inte automatiskt bli mall för nya
  aktiviteter, även om redigeringen öppnas från det tillfället.
- K-012: Serien ska kunna förkortas genom att ange ett tidigare slutdatum.
  Berörda tillfällen efter det nya slutdatumet ska tas bort om inga kallelser
  skickats, annars ställas in med bevarad historik. Individuellt ändrade
  tillfällen skyddas enligt K-004 och K-005 och kan därför ligga kvar efter
  seriens nya slutdatum. Förhandsgranskningen ska visa samtliga utfall,
  inklusive överhoppade tillfällen, före bekräftelse.
- K-013: Ändring av återkommande veckodagar och seriens slutdatum, inklusive
  förlängning och förkortning, ska bara vara tillgänglig med **Detta och
  kommande tillfällen**. **Endast detta tillfälle** ska endast ändra den
  valda aktivitetens uppgifter, datum och tider och får inte ändra seriens
  återkommande upplägg.
- K-024: En serie ska ha gemensam starttid, passlängd, samling och plats för
  sina återkommande veckodagar. Olika återkommande tider eller platser ska
  hanteras genom separata serier, inte inställningar per veckodag inom samma
  serie. Individuella avvikelser får fortfarande göras enligt reglerna för
  **Endast detta tillfälle** och skyddas därefter som individuella undantag.
  Ändringar från ett valt tillfälle får inte ändra tidigare tillfällen enligt
  K-003; gemensamma inställningar behöver därför gälla från ändringens
  utgångspunkt utan att skriva om tidigare historik.
- K-035: **Byt dag** ska flytta varje berört tillfälle till den nya veckodagen
  i samma kalendervecka, måndag–söndag, i föreningens lokala tidszon.
  Måndag till onsdag ska innebära två dagar framåt och fredag till måndag
  fyra dagar bakåt. Förhandsgranskningen ska visa de faktiska datumen.
  Utfall vid passerad starttid, periodgränser och dubbletter följer K-036.
- K-036: Ett dagbyte ska nekas före sparande om en flytt skulle hamna
  utanför seriens angivna period, ge en starttid som redan passerat eller
  skapa en dublett med ett annat tillfälle i samma serie. Berörda tillfällen
  ska visas tydligt så att användaren kan ändra dagval/period eller hantera
  tillfället separat. Inga tillfällen får automatiskt försvinna eller slås
  ihop som lösning på dessa konflikter. Redan beslutade överhoppningar av
  individuella undantag enligt K-004/K-005 gäller fortsatt; ett kvarvarande
  undantag får inte ge upphov till en ny dublett.
- K-039: En serieändring ska endast ändra de fält användaren uttryckligen
  ändrat, med beslutade följdändringar enligt exempelvis K-015–K-017.
  Oändrade fält ska behålla respektive tillfälles värden även om andra
  gemensamma serieändringar tidigare börjat gälla från ett senare datum.
  Exempelvis ska en ny platsändring från oktober inte återställa en redan
  beslutad gemensam starttid 18.30 från november till oktobertillfällets 18.00.
  Individuellt ändrade tillfällen ska fortsatt hoppas över enligt K-004/K-005.
  Gemensamma inställningar för nya tillfällen enligt K-011 och K-025 ska
  följa de bekräftade ändringarnas giltighetsdatum, utan att skriva om tidigare
  tillfällen eller oavsiktligt återställa senare ändringar av andra fält.

### Kallelser, svar och påminnelser

- K-015: När en aktivitet flyttas ska oskickade kallelser, sista svarstid och
  väntande påminnelser räknas om från den nya starten med samma relativa
  tidsregler som tidigare. Detta gäller både enskild flytt och serieflytt.
  För redan skickade kallelser gäller K-016 vid datum-/starttidsändring.
  Passerade tider hanteras enligt K-019.
- K-016: När aktivitetens datum eller starttid ändras efter att kallelser
  skickats ska alla kallade få ett ändringsmeddelande och deras aktuella
  svar återställas till **obesvarat**, oavsett om tidigare svar var ja eller
  nej. Tidigare svar och kommentarer ska sparas i historiken och fortsatt
  vara kopplade till samma aktivitet. Ett tidigare ja får inte visas som
  giltigt för den nya tiden utan ett nytt svar. Detta gäller både enskild
  redigering och serieflytt. Ändring av övriga uppgifter behandlas separat.
- K-017: När plats, samling eller sluttid ändras ska alla redan kallade
  informeras med ett ändringsmeddelande, men deras aktuella svar ska behållas.
  Om datum eller starttid samtidigt ändras ska K-016 gälla och kräva nya svar.
  När endast titel eller beskrivning ändras ska uppgifterna uppdateras utan
  nytt utskick och aktuella svar behållas. Detta ska undvika extra notiser för
  exempelvis rättad stavning. Enbart ändrad aktivitetstyp följer K-047.
- K-019: Vid skapande och flytt ska en passerad kallelsetid innebära att
  kallelsen skickas direkt efter bekräftat sparande. Passerade påminnelsetider
  ska hoppas över. Om sista svarstid har passerat ska sparandet stoppas och
  användaren få välja en framtida svarstid som infaller senast vid aktivitetens
  start. Förhandsgranskningen ska visa vilka kallelser som skickas direkt och
  vilka påminnelser som hoppas över. Regeln gäller när ett kallelseschema ska
  skapas eller räknas om; den kräver inte kallelse för aktiviteter utan kallelse.
- K-028: Schemalagda kallelser ska använda valda målgrupper, exempelvis
  spelare, ledare och undergrupper, men personurvalet ska bestämmas vid
  utskickstillfället utifrån aktuellt medlemskap. Nytillkomna medlemmar i de
  valda grupperna ska därför omfattas. En person i flera valda grupper ska
  endast få en kallelse per aktivitet. Redan skickade kallelser och sparade
  svar får inte automatiskt tas bort till följd av senare gruppmedlemsändringar.
- K-041: Målgrupper och kallelseinställningar ska kunna ändras även för
  **Detta och kommande tillfällen**, med **Behåll befintliga** som förval.
  Ett uttryckligt nytt schema ska ersätta väntande utskick och påminnelser.
  Nya mottagare ska kallas enligt det nya schemat. Redan skickade kallelser
  får inte tas tillbaka och befintliga mottagare får inte få dubbletter.
  Tidigare svar ska behållas utom när ändrat datum eller starttid kräver
  nya svar enligt K-016. Behörighet, dynamiskt personurval och validering
  ska fortsatt följa K-027, K-028 och övriga schemaregler.
- K-042: Om endast sista svarstid ändras ska redan kallade informeras men
  deras aktuella svar behållas. Om endast påminnelsetider ändras ska inget
  separat ändringsmeddelande skickas. Påminnelser ska endast skickas till
  personer vars aktuella svar är obesvarat. Personer vars svar återställts
  enligt K-016 vid datum-/starttidsändring ska omfattas av omräknade
  påminnelser. Reglerna för giltiga tider och överhoppade passerade påminnelser
  gäller fortsatt.
- K-047: Om endast aktivitetstypen ändras ska uppgiften uppdateras utan nytt
  utskick och aktuella svar behållas, som vid enbart titeländring. Om även
  tid, plats, kallelseinställningar eller bemanning ändras ska respektive
  beslutade följdregler gälla; typbytet får inte undertrycka de följderna.

### Bemanningsschema och bokningar

- K-020: Vid tidsändring av en aktivitet med bokade bemanningspass ska
  användaren få välja per aktivitet om befintliga bokningar ska behållas.
  Även när flera aktiviteter ändras genom ett seriekommando ska valet göras
  per berörd aktivitet. En mindre flytt, exempelvis 30 minuter, kan motivera
  att bokningarna behålls men är inte en beslutad gräns för automatiskt
  bevarande. Alternativen och förvalet regleras av K-021, informationen av
  K-022 och anpassning vid ändrad passindelning av K-023/K-040.
- K-021: För varje berörd aktivitet med bokade bemanningspass ska användaren
  uttryckligen välja ett av två alternativ, utan förvalt alternativ:
  **Behåll bokningarna**, där passen flyttas med aktiviteten och de bokade
  personerna står kvar, eller **Öppna för ny bokning**, där nya pass läggs ut
  utan bokningar och tidigare bokningar sparas i historiken. Vid serieändring
  ska samma val göras separat för varje berörd aktivitet.
- K-022: Vid **Behåll bokningarna** ska de bokade personerna få ett
  ändringsmeddelande med passens nya tider; bokningarna ska gälla direkt utan
  krav på ny bekräftelse. Vid **Öppna för ny bokning** ska tidigare bokade
  personer informeras om att deras gamla bokning inte längre gäller och få
  en länk till de nya passen. Detta gäller även personer som saknar vanlig
  aktivitetskallelse. Vid serieändring ska bemanningsinformationen ingå i
  samma samlade ändringsmeddelande enligt K-018.
- K-023: **Behåll bokningarna** får bara tillåtas om samtliga befintliga
  bokningar kan följa med till det nya bemanningsschemat. Om förkortning
  eller ändrad passindelning skulle ta bort ett bokat pass eller en bokad
  plats ska användaren anpassa passupplägget så att alla bokningar får plats
  eller uttryckligen välja **Öppna för ny bokning**. Ingen befintlig bokning
  får automatiskt försvinna medan valet är **Behåll bokningarna**.
- K-025: Nya aktiviteter som skapas vid förlängning eller tillagd veckodag
  ska få seriens gemensamma bemanningsupplägg: uppgifter, passindelning, antal
  platser och instruktioner. Samtliga bokningar ska börja tomma; bokade
  personer får inte kopieras från befintliga aktiviteter till nya tillfällen.
  Ett individuellt anpassat bemanningsschema får inte automatiskt bli mall
  för serien. Reglerna för att behålla bokningar vid flytt av samma aktivitet
  i K-020–K-023 är separata och ska inte användas för nya aktiviteter.
- K-040: Om ändrad passindelning gör kopplingen mellan befintliga bokningar
  och nya pass oentydig ska användaren kunna placera om bokningarna genom
  att koppla varje gammal bokning till en ledig plats i det nya schemat.
  Gamla bokningar och nya pass ska visas i flödet. **Behåll bokningarna**
  får sparas först när samtliga bokningar har en giltig plats. Valet att
  öppna för ny bokning enligt K-021 ska fortfarande finnas som alternativ.

### Meddelanden, sparande och mobilflöde

- K-018: En sparad serieändring ska ge ett samlat ändringsmeddelande per
  mottagare, inte ett separat ändringsmeddelande för varje berört tillfälle.
  Meddelandet ska visa vilka tillfällen som ändrats och deras nya uppgifter,
  vilka tillfällen som kräver nya svar och länkar till berörda aktiviteter.
  Endast tillfällen som mottagaren berörs av ska ingå. Regeln gäller
  ändringsmeddelanden. Ordinarie kallelser till nya tillfällen ska följa
  tillfällenas kallelseinställningar enligt K-011, K-028 och K-030.
- K-026: När en aktivitet ställs in eller tas bort ska alla redan kallade
  och alla med bokade bemanningspass informeras. Väntande kallelser och
  påminnelser ska stoppas. Bemanningsbokningar ska upphöra att gälla med
  tidigare bokningar bevarade i historiken. Information om flera tillfällen
  i samma serieändring ska samlas per mottagare enligt K-018. Personer som
  varken fått en kallelse eller bokat ett pass ska inte få utskick om åtgärden.
- K-029: Samlade ändringsmeddelanden ska grupperas per mottagarkonto och
  använda befintliga e-post-/pushkanaler enligt befintliga notisinställningar.
  Högst ett samlat meddelande per kanal och sparad serieändring ska skickas
  till kontot. En målsman med två berörda barn ska få en sammanställning som
  tydligt visar båda barnens berörda aktiviteter. Varje konto får endast se
  personer och aktiviteter det har rätt till. Svar ska fortfarande lämnas
  separat per person och aktivitet, även när meddelandet är samlat.
- K-037: Skapande, redigering, inställning och borttagning ska alltid
  förhandsgranskas före uttrycklig bekräftelse. Granskningen ska visa ändrade
  tillfällen, överhoppningar, utskick, nya svarskrav och bemanningsval där
  dessa är relevanta. Aktiviteter, kallelsescheman, svarshantering och
  bokningsändringar ska sparas tillsammans som allt eller inget. Om relevant
  underlag ändrats sedan granskningen, exempelvis genom en ny bokning, ska
  sparandet stoppas och ny förhandsgranskning krävas. Vid fel ska användarens
  utkast behållas och inga delar av ändringen sparas. Följdmeddelanden får
  inte skickas på grundval av en nekad eller endast förhandsgranskad ändring.
- K-038: Den bekräftade ändringen och uppdragen att skicka meddelanden ska
  sparas tillsammans. Om ändringen sparats men ett mejl eller en push inte
  kan levereras ska ändringen ligga kvar. Tillfälligt misslyckade utskick
  ska försöks igen automatiskt. Gränssnittet ska skilja på **sparat**,
  **väntar på leverans** och **leverans misslyckades**. Återförsök får inte
  skapa extra aktiviteter, kallelser eller bokningar. K-037:s allt-eller-inget
  gäller sparandet; ett senare leveransfel är inte ett misslyckat sparande.
- K-044: Tangentbord, datumval, veckobyte och kallelseval i iOS/Safari får
  inte tappa relevant redigeringsfokus, nollställa formuläret eller stänga
  dialogen. Bakgrundstryck får inte stänga dialogen. Kryss, Avbryt och
  navigering bort ska kräva bekräftelse om osparade ändringar finns. Sparfel
  ska behålla hela utkastet och alla val. Bakgrundsuppdateringar får inte
  skriva över det användaren håller på att redigera. Kravet avser bevarande
  under pågående redigering; beständig utkastlagring efter omladdning är
  inte beslutad.

## Data, integrationer och kvalitetskrav

Befintliga beroenden är aktivitetsbehörighet, aktivitetstyper, ärvda tidsförval,
serietillhörighet, kallelser/svar, påminnelser, uppgifter och kalender/närvaro.
Kraven ovan styr vilka värden som ändras respektive bevaras. Befintliga
tidszons-, kalenderdags- och sommartidsregler i [tidsreglerna](../activity-time-rules.md)
ska återanvändas; ändringen innebär ingen ny tidsgrammatik eller användning av
enhetens tidszon i stället för föreningens. Behörigheter ska kontrolleras på
servern även vid sparande, och sparade förhandsgranskningar ersätter inte
aktuell behörighetskontroll.

Verifieringen ska omfatta hela flödet från lagets sida via formulär,
förhandsgranskning och sparande till återlästa aktiviteter, kallelser, svar,
bemanning och meddelandestatus. Mobilflödet behöver uttrycklig verifiering
i Safari på iOS utifrån den rapporterade användningen, inklusive verkligt
tangentbord. Chromium med mobilstorlek och simulerad viewport får inte
ensamt redovisas som verifierat iOS-stöd. Delar som ännu inte implementerats
eller verifierats ska redovisas som återstående, inte som levererade av denna spec.

## Acceptanskriterier

Kriterierna nedan avser bekräftade krav och omfattar serieurval, undantag,
kallelser, nekad behörighet, samtidiga ändringar och mobilinteraktion.

- AK-001 (K-003): Givet ett redigerbart tillfälle i en serie, när användaren
  väljer **Endast detta tillfälle**, ska endast det valda tillfället omfattas
  av redigeringen, inställningen eller borttagningen.
- AK-002 (K-003): Givet ett redigerbart tillfälle i en serie, när användaren
  väljer **Detta och kommande tillfällen**, ska inget tidigare tillfälle
  ändras, ställas in eller tas bort av kommandot. Senare undantag ska
  hanteras enligt K-004/K-005 och inställda/borttagna tillfällen enligt K-046.
- AK-003 (K-004): Givet en kommande aktivitet vars tid ändrats individuellt,
  när platsen ändras för **Detta och kommande tillfällen** från ett tidigare
  oförändrat tillfälle, ska den individuellt ändrade aktiviteten behålla både
  sin särskilda tid och sin tidigare plats.
- AK-004 (K-004): Givet en kommande aktivitet vars tid ändrats individuellt,
  när användaren ställer in eller tar bort **Detta och kommande tillfällen**
  från ett tidigare oförändrat tillfälle, ska den individuellt ändrade
  aktiviteten lämnas kvar med oförändrad status. Den kan hanteras separat.
- AK-005 (K-004, K-005): Givet att både det öppnade tillfället och ett senare
  tillfälle ändrats individuellt och i övrigt får hanteras, när användaren
  väljer **Detta och kommande tillfällen**, ska det öppnade tillfället omfattas
  av redigeringen, inställningen eller borttagningen medan det senare
  individuellt ändrade tillfället lämnas orört.
- AK-006 (K-007): Givet ett oförändrat framtida tillfälle på en tisdag inom
  ändringens omfattning, när den återkommande dagen byts till onsdag och båda
  datumen ligger inom seriens period, ska samma aktivitet flyttas till onsdagen
  med bibehållen identitet, historik och kopplingar till kallelser och svar.
  Testet får inte uppfyllas genom att radera aktiviteten och skapa en ny.
- AK-007 (K-008): Givet en serie på tisdagar, när torsdag läggs till utan att
  tisdagen ändras, ska torsdagstillfällen skapas inom vald omfattning och period
  medan befintliga tisdagstillfällen behåller sina identiteter.
- AK-008 (K-004, K-005, K-008, K-009): Givet att en veckodag tas bort och dess
  berörda tillfällen omfattar en aktivitet utan skickade kallelser, en med
  skickade kallelser och ett senare individuellt ändrat undantag, ska
  förhandsgranskningen ange borttagning, inställning respektive överhoppning.
  Efter bekräftelse ska dessa utfall gälla, och den inställda aktivitetens
  historik samt det överhoppade undantaget ska finnas kvar.
- AK-009 (K-007, K-010): Givet en serie på måndagar och torsdagar, när
  användaren väljer **Byt dag** från måndag till tisdag och från torsdag till
  fredag, ska varje berört måndagstillfälle flyttas till sin motsvarande
  tisdag och varje berört torsdagstillfälle till sin motsvarande fredag.
  Aktivitetsidentiteter ska bevaras och undantagsreglerna gälla. Exakta
  periodgränser följer K-036 och veckokopplingen K-035.
- AK-010 (K-011): Givet en serie med gemensamma inställningar och ett
  tillfälle med individuellt ändrad plats och tid, när redigeringen öppnas
  från det undantaget för att förlänga serien eller lägga till en veckodag,
  ska nya tillfällen som förval få seriens gemensamma inställningar.
  Användaren ska kunna granska och justera uppgifterna före förhandsgranskningen.
- AK-011 (K-012): Givet att ett tidigare slutdatum lämnar en aktivitet utan
  skickade kallelser, en med skickade kallelser och ett senare individuellt
  ändrat undantag utanför perioden, ska förhandsgranskningen visa borttagning,
  inställning respektive överhoppning. Efter bekräftelse ska den första vara
  borttagen, den andra inställd med bevarad historik och undantaget finnas kvar
  oförändrat även efter det nya slutdatumet.
- AK-012 (K-013): Givet ett tillfälle i en serie, när **Endast detta
  tillfälle** väljs, ska serieåtgärder för återkommande dagar och seriens
  slutdatum inte vara tillgängliga. En ändring av aktivitetens egna datum/tider
  får inte ändra de återkommande dagarna eller seriens slutdatum. Med **Detta
  och kommande tillfällen** ska serieåtgärderna vara tillgängliga för ett
  tillfälle som i övrigt får serieredigeras.
- AK-013 (K-014): Givet behörig användare och en aktivitet i en serie, ska
  enskild redigering och serieändring erbjudas före start. Exakt vid start
  ska bara enskild redigering erbjudas. Exakt vid sluttid ska aktivitetens
  uppgifter vara i läsläge, utan att närvarospecens korrigeringsrätt påverkas.
  Ett seriekommando får inte ändra ett tillfälle som redan har startat,
  även om det fortfarande pågår.
- AK-014 (K-015): Givet en ännu oskickad kallelse tre dagar före start samt
  relativa regler för sista svarstid och påminnelser, när aktivitetens start
  flyttas från tisdag till onsdag, ska väntande schema och sista svarstid
  beräknas från onsdagens start med samma regler. Detta ska gälla både enskild
  redigering och motsvarande flytt genom serieändring.
- AK-015 (K-007, K-016): Givet skickade kallelser med både ja- och nej-svar
  och kommentarer, när aktivitetens datum eller starttid ändras och ändringen
  bekräftas, ska alla kallade få ett ändringsmeddelande och aktuella svar vara
  obesvarade. Tidigare svar och kommentarer ska kunna återfinnas i historiken
  med bibehållen aktivitetsidentitet. Ett nytt svar ska avse den nya tiden.
- AK-016 (K-017): Givet redan kallade personer med sparade svar, när plats,
  samling eller sluttid ändras utan ändrat datum/starttid, ska alla kallade
  informeras och aktuella svar vara oförändrade. När endast titel eller
  beskrivning ändras ska inget nytt utskick ske och svaren förbli oförändrade.
- AK-017 (K-016, K-017): Givet att både plats och starttid ändras i samma
  bekräftade ändring, ska reglerna för nytt svar gälla; platsändringen får
  inte orsaka att tidigare svar behandlas som fortsatt giltiga.
- AK-018 (K-018): Givet att tio träningar flyttas i samma sparade serieändring
  och en mottagare redan är kallad till samtliga, ska mottagaren få ett samlat
  ändringsmeddelande för ändringen med de tio tillfällenas nya uppgifter,
  markering av att nya svar krävs och länkar till aktiviteterna. En annan
  mottagare som bara berörs av tre tillfällen ska endast få dessa i sitt
  samlade ändringsmeddelande.
- AK-019 (K-019): Givet en framtida aktivitet med giltig framtida sista
  svarstid men passerad kallelsetid och en passerad påminnelsetid, när den
  skapas eller flyttas, ska förhandsgranskningen visa direkt kallelse och
  överhoppad påminnelse. Först efter bekräftat sparande får kallelsen skickas;
  den passerade påminnelsen får inte skickas.
- AK-020 (K-019): Givet en passerad sista svarstid efter skapandeval eller
  omräkning, ska sparandet nekas tills användaren valt en framtida sista
  svarstid som inte ligger efter aktivitetens start. Ingen aktivitet eller
  kallelseändring får sparas som del av det nekade kommandot.
- AK-021 (K-020): Givet två aktiviteter med bokade bemanningspass i samma
  serieändring, när deras tider flyttas exempelvis 30 minuter, ska användaren
  kunna välja per aktivitet om bokningarna ska behållas. Systemet får inte
  automatiskt välja bevarande enbart för att flytten är 30 minuter och får
  inte ersätta valen med ett enda gemensamt beslut för alla aktiviteter.
- AK-022 (K-021): Givet två berörda aktiviteter med bokade bemanningspass,
  ska inget bokningsalternativ vara förvalt. Användaren ska kunna välja
  **Behåll bokningarna** för den ena och **Öppna för ny bokning** för den andra.
  Efter bekräftelse ska den förstas pass ha flyttats med bokade personer kvar,
  medan den andras nya pass ska sakna bokningar och tidigare bokningar finnas
  i historiken.
- AK-023 (K-018, K-022): Givet en person med bokat bemanningspass men utan
  vanlig aktivitetskallelse, när **Behåll bokningarna** väljs vid flytt, ska
  personen informeras om den nya tiden och bokningen gälla utan ny bekräftelse.
  När **Öppna för ny bokning** i stället väljs ska personen få information om
  att den gamla bokningen upphört och en länk till de nya passen. Om personen
  även har en aktivitetskallelse får serieändringen inte ge ett extra separat
  bemanningsmeddelande utöver det samlade ändringsmeddelandet.
- AK-024 (K-023): Givet ett bokat pass som skulle försvinna vid ett nytt
  kortare schema, när användaren väljer **Behåll bokningarna**, ska sparandet
  stoppas tills passupplägget anpassats så alla bokningar kan följa med eller
  användaren uttryckligen valt **Öppna för ny bokning**. Det nekade försöket
  får inte frigöra bokningen eller delvis ändra schemat.
- AK-025 (K-024): Givet en serie med tisdag och torsdag, när nya tillfällen
  skapas eller gemensamma serieinställningar ändras, ska båda veckodagarna
  följa samma starttid, passlängd, samling och plats inom ändringens omfattning.
  Formuläret ska inte erbjuda separata återkommande tider eller platser per
  veckodag. En individuell ändring av ett tillfälle ska fortfarande vara
  möjlig och får inte ändra andra tillfällens gemensamma inställningar.
- AK-026 (K-025): Givet en serie med ett gemensamt bemanningsupplägg och
  bokade personer på befintliga tillfällen, när serien förlängs eller en
  veckodag läggs till, ska nya aktiviteter ha uppgifterna, passindelningen,
  antalet platser och instruktionerna från det gemensamma upplägget, men inga
  bokade personer. Ett specialanpassat schema på det öppnade tillfället får
  inte automatiskt ersätta det gemensamma upplägget.
- AK-027 (K-026): Givet en aktivitet med redan kallade personer, bokade
  bemanningspass och väntande utskick, när aktiviteten ställs in eller tas
  bort, ska redan kallade och bokade informeras, väntande kallelser och
  påminnelser inte skickas och bokningarna inte längre gälla. Tidigare
  bokningar ska finnas i historiken. En person utan skickad kallelse och
  utan bokat pass ska inte få utskick om åtgärden.
- AK-028 (K-027): Givet en användare med aktivitetsbehörighet men utan
  kallelsebehörighet för laget, ska en tillåten flytt utan bemanningsval kunna
  ge automatiska ändringsmeddelanden och nya svarskrav, men användaren får
  inte ändra målgrupper/kallelseinställningar eller genomföra en flytt som
  kräver bemanningsval. En vanlig medlem eller person med enbart personlig
  kallelse ska nekas administrativa aktivitetsändringar. Samma rättighet för
  ett annat lag får inte ge åtkomst till ändringen.
- AK-029 (K-028): Givet en schemalagd kallelse till spelare och en undergrupp,
  när en ny person ansluter före utskicket och en annan ingår i båda urvalen,
  ska den nya personen omfattas och den överlappande personen få exakt en
  kallelse för aktiviteten. Om en redan kallad person senare lämnar en grupp
  ska personens skickade kallelse och tidigare svar inte automatiskt tas bort.
- AK-030 (K-018, K-022, K-029): Givet ett konto med åtkomst till två berörda
  barn och både e-post och push aktiverade, när en serieändring berör båda,
  ska kontot få högst ett samlat mejl och en samlad push för ändringen med
  tydlig koppling mellan barn och tillfällen. Andra familjers personer och
  aktiviteter får inte exponeras. Barnens svar ska fortfarande hanteras
  separat per person och aktivitet; avstängda kanaler får inte användas.
- AK-031 (K-030): Givet skapande av en aktivitet, ska typ, titel och plats
  krävas, beskrivning vara valfri och enstaka aktiviteter kunna vara samma
  dag eller flerdagars. En veckoserie ska kunna välja flera veckodagar med
  gemensamma inställningar. Kallelse ska kunna väljas bort; direkt personval
  ska erbjudas för enstaka aktivitet men inte för serie.
- AK-032 (K-031): Givet en disciplin med konfigurerad giltig förvald
  aktivitetstyp, när **Ny aktivitet** öppnas för ett lag inom disciplinen,
  ska den typen vara initialt vald. Testet ska kontrollera typvalet och inte
  enbart att disciplinens tidsregler laddats.
- AK-033 (K-031, K-032): Givet giltiga typförval på lag-, sektions- och
  disciplinnivå ska lagets val vara initialt valt. Utan lagval ska sektionens
  val användas och utan båda disciplinens val. När inget giltigt förval finns
  ska tillåten **Övrigt** väljas; utan även den ska formuläret kräva ett
  uttryckligt typval. Användaren ska kunna byta till annan tillåten typ.
- AK-034 (K-033): Givet ett nytt aktivitetsformulär där användaren ändrat
  längden manuellt men lämnat samling och kallelsetider orörda, när typen byts
  ska den manuella längden behållas medan orörda fält får den nya typens
  förval. Ett nytt lag-/sektions-/disciplinförval får inte ändra sparade
  aktiviteter, och deras sparade värden ska visas oförändrade vid redigering.
- AK-035 (K-034): Ett i övrigt giltigt upplägg med exakt 366 dagars period
  eller exakt 100 planerade tillfällen ska tillåtas; 367 dagar respektive
  101 tillfällen ska nekas. Längderna 1 minut och 7 dygn ska tillåtas, kortare
  respektive längre längd nekas. Fem påminnelser ska tillåtas och sex nekas.
- AK-036 (K-003, K-034): Givet en befintlig serie med tidigare tillfällen
  och historik, när en förlängning från valt tillfälle håller sig inom
  366 dagar och 100 planerade tillfällen i det framtida upplägget, ska tidigare
  tillfällen inte räknas som ett hinder eller ändras av kommandot.
- AK-037 (K-035): Givet framtida tillfällen inom en i övrigt giltig period,
  när måndag byts till onsdag ska varje tillfälle flyttas två lokala
  kalenderdagar framåt. När fredag byts till måndag ska varje tillfälle
  flyttas fyra lokala kalenderdagar bakåt i samma måndag–söndag-vecka,
  inte till nästföljande måndag. De faktiska datumen ska visas före bekräftelse.
- AK-038 (K-036): Givet ett dagbyte som skulle flytta minst ett tillfälle
  utanför serieperioden, till en passerad starttid eller till en dublett i
  samma serie, ska sparandet nekas och berörda tillfällen anges. Ingen
  aktivitet får försvinna eller slås ihop automatiskt. Efter rättat dagval
  eller rättad period ska användaren kunna förhandsgranska ett giltigt upplägg.
- AK-039 (K-037): Givet en förhandsgranskad serieändring med bokningsval,
  när en ny bokning tillkommer före bekräftelsen, ska sparandet nekas och
  ny granskning krävas. Ingen aktivitet, svarshantering, kallelseschema eller
  bokning får delvis ändras och inget följdmeddelande skickas. Användarens
  egna utkast och val ska finnas kvar för fortsatt arbete.
- AK-040 (K-037): Givet en åtgärd för skapande, redigering, inställning
  eller borttagning, ska ingen skrivning eller följdnotifiering ske före
  uttrycklig bekräftelse av förhandsgranskningen. Ett fel under sparandet
  ska lämna hela det berörda underlaget oförändrat och behålla utkastet.
- AK-041 (K-038): Givet en bekräftad och sparad ändring med meddelandeuppdrag,
  när en extern leverans misslyckas tillfälligt, ska ändringen ligga kvar och
  leveransen försöks igen utan extra aktiviteter, kallelser eller bokningar.
  Gränssnittet ska tydligt visa sparstatus separat från väntande eller
  misslyckad leverans och får inte påstå att hela sparandet misslyckats.
- AK-042 (K-039): Givet en serie som börjar 18.00 i oktober och genom en
  tidigare gemensam serieändring börjar 18.30 från november, när användaren
  öppnar ett oförändrat oktobertillfälle och endast ändrar plats för **Detta
  och kommande tillfällen**, ska novembertillfällena få nya platsen men
  behålla 18.30. Oktobertillfällen ska behålla 18.00 och individuella undantag
  ska hoppas över enligt K-004/K-005. Nya novembertillfällen ska följa den
  giltiga gemensamma tiden och den nya platsen.
- AK-043 (K-023, K-040): Givet en ny passindelning där gamla bokningar
  inte har entydiga motsvarande pass, ska användaren kunna se båda schemana
  och koppla varje bokning till en ledig giltig plats. Sparande med **Behåll
  bokningarna** ska nekas när någon bokning saknar plats eller samma plats
  tilldelas flera bokningar. När alla kopplingar är giltiga ska ändringen
  kunna förhandsgranskas och sparas med samtliga bokningar bevarade.
- AK-044 (K-016, K-028, K-041): Givet en serie med redan kallade personer,
  sparade svar och väntande scheman, när användaren uttryckligen väljer nya
  målgrupper och nytt schema för **Detta och kommande tillfällen** utan att
  ändra datum/starttid, ska väntande scheman ersättas och nya mottagare kallas
  enligt nya schemat. Skickade kallelser och svar ska behållas och inga
  dubblettkallelser skapas för redan kallade. Utan uttryckligt nytt val ska
  **Behåll befintliga** vara förvalt.
- AK-045 (K-042): Givet redan kallade personer med ja-, nej- och obesvarade
  svar, när endast sista svarstid ändras, ska de informeras och deras svar
  behållas. När endast påminnelsetider ändras ska inget separat
  ändringsmeddelande skickas. När påminnelser förfaller ska bara obesvarade
  få dem, inklusive personer vars tidigare svar återställts vid en flytt.
- AK-046 (K-043): Givet manuell borttagning av en i övrigt hanterbar
  aktivitet utan skickade kallelser, ska den kunna tas bort. Med skickade
  kallelser ska endast inställning tillåtas och historiken bevaras. En
  inställd eller avslutad aktivitet ska visas i läsläge utan möjlighet till
  återaktivering i detta flöde, och närvarospecens korrigeringsrätt ska bestå.
- AK-047 (K-044): Givet ett osparat aktivitetsutkast på iOS/Safari från
  lagets sida, när användaren redigerar titel, visar/döljer tangentbord,
  byter slutvecka, väljer kallelse eller får en bakgrundsuppdatering, ska
  aktuella värden och val finnas kvar, relevant fokus fungera och dialogen
  förbli öppen. Bakgrundstryck får inte stänga dialogen. Kryss, Avbryt eller
  navigering bort ska vid osparade ändringar kräva bekräftelse; avböjd
  stängning och sparfel ska behålla hela utkastet.
- AK-048 (K-027, K-037, K-043, K-045): Givet en behörig användare som
  efterregistrerar en avslutad enstaka aktivitet, ska den kunna granskas och
  sparas utan kallelser eller andra utskick. Därefter ska uppgifterna visas
  i läsläge medan närvaro kan registreras enligt närvarospecen. Serieskapande
  får inte skapa tillfällen vars starttid redan inträffat.
- AK-049 (K-046): Givet ett inställt och ett enskilt borttaget tillfälle,
  när en senare förlängning eller veckodagsändring annars skulle generera
  dessa igen, ska de visas som överhoppade och inga aktiviteter, kallelser
  eller bokningar återskapas eller återaktiveras. Ett nytt tillfälle på samma
  datum ska kräva ett uttryckligt separat skapande.
- AK-050 (K-017, K-047): Givet en aktivitet med skickade kallelser och
  sparade svar, när endast aktivitetstypen ändras, ska ingen ny notifiering
  skickas och svaren behållas. Om starttiden samtidigt ändras ska K-016
  ändå kräva nytt svar och ändringsmeddelande.

## Bekräftade beslut och motiv

- 2026-10-27: Genomför en grill-session om aktiviteter med befintlig funktion
  som utgångspunkt. Återanvänd denna spec under intervjun.
- 2026-10-27: Användaren bekräftade hela omfattningen: skapa/redigera enstaka
  aktiviteter och serier, ställa in/ta bort tillfällen och serier samt påverkan
  på kallelser, svar och påminnelser. Kalender, närvaro och AI behåller egna specar.
- 2026-10-27: Behåll äldre appens två omfattningsval: endast detta tillfälle
  eller detta och kommande. Valen gäller redigering, inställning och borttagning;
  tidigare tillfällen lämnas orörda.
- 2026-10-27: Användaren valde att hoppa över redan individuellt ändrade
  aktiviteter helt vid serieändring, i stället för att skydda enskilda fält.
- 2026-10-27: Samma skydd gäller vid inställning och borttagning av kommande
  tillfällen. Ett individuellt flyttat tillfälle lämnas kvar och måste hanteras
  separat även när resten av terminens aktiviteter ställs in eller tas bort.
- 2026-10-27: Det uttryckligen öppnade tillfället omfattas även om det ändrats
  individuellt, enligt äldre appens regel. Övriga individuella undantag skyddas.
- 2026-10-27: Användaren inkluderade förlängning och ändrade veckodagar för
  befintliga serier. Detta utökar äldre appens stöd; förslaget att kräva en ny
  serie vid förlängning valdes inte.
- 2026-10-27: Vid byte av återkommande veckodag ska befintliga aktiviteter
  flyttas, inte ersättas med nya. Historik och kallelse-/svarskopplingar bevaras;
  aktuella svar hanteras enligt det senare beslutet om ny svarsbekräftelse.
- 2026-10-27: En tillagd veckodag skapar nya tillfällen. En borttagen veckodag
  tar bort aktiviteter utan skickade kallelser och ställer in dem som har
  skickade kallelser, med bevarad historik. Individuella undantag skyddas enligt
  tidigare beslut. Förhandsgranskningen visar varje utfall och överhoppning.
- 2026-10-27: Användaren bekräftade separata åtgärder för att byta, lägga till
  och ta bort en veckodag, med uttrycklig gammal/ny dag vid varje flytt.
- 2026-10-27: Nya tillfällen använder seriens aktuella gemensamma uppgifter,
  som visas och kan justeras före förhandsgranskningen. Ett öppnat individuellt
  undantag blir inte automatiskt mall för nya aktiviteter.
- 2026-10-27: Serien får förkortas genom tidigare slutdatum. Tillfällen efter
  slutdatumet tas bort eller ställs in beroende på skickade kallelser;
  individuellt ändrade tillfällen skyddas och kan ligga kvar utanför perioden.
  Alla utfall ska framgå före bekräftelse.
- 2026-10-27: Veckodagar och seriens slutdatum ändras endast med **Detta och
  kommande tillfällen**. Enskild redigering påverkar endast aktivitetens egna
  uppgifter, datum och tider, utan att ändra seriens upplägg.
- 2026-10-27: Användaren bekräftade redigering före start, endast enskild
  redigering under pågående aktivitet och läsläge efter sluttiden. Serieändring
  omfattar bara ännu inte startade tillfällen. Närvarokorrigering följer egen spec.
- 2026-10-27: Vid enskild flytt och serieflytt följer oskickade kallelser,
  sista svarstid och väntande påminnelser den nya starten genom omräkning
  med samma relativa tidsregler. Redan skickade kallelser behandlas separat.
- 2026-10-27: Användaren accepterade rekommendationen att ändrat datum eller
  ändrad starttid efter kallelseutskick kräver nya svar. Alla kallade får ett
  ändringsmeddelande; aktuella svar återställs till obesvarat och tidigare
  svar samt kommentarer sparas i historiken.
- 2026-10-27: Plats-, samlings- och sluttidsändringar informerar alla kallade
  med bibehållna svar. Enbart titel-/beskrivningsändringar uppdaterar uppgifterna
  utan nytt utskick och behåller svaren, för att undvika notiser vid stavrättningar.
- 2026-10-27: Serieändringar ger ett samlat ändringsmeddelande per mottagare
  och sparad ändring, med berörda tillfällen, nya uppgifter, behov av nya svar
  och aktivitetslänkar.
- 2026-10-27: Vid skapande/flytt blir passerad kallelsetid direkt utskick efter
  bekräftat sparande, passerade påminnelser hoppas över och passerad sista
  svarstid blockerar sparande tills en framtida tid senast vid start valts.
  Direktutskick och överhoppade påminnelser visas i förhandsgranskningen.
- 2026-10-27: Vid exempelvis 30 minuters tidsändring kan befintliga bokningar
  i bemanningspass behållas, men användaren ska tillfrågas per aktivitet.
  Ingen automatisk minutgräns är beslutad. Alternativ och information
  preciserades därefter i K-021 och K-022.
- 2026-10-27: Användaren bekräftade två alternativ per aktivitet, utan förval:
  behåll bokningarna och flytta passen med bokade personer kvar, eller öppna
  nya pass utan bokningar och bevara tidigare bokningar i historiken.
- 2026-10-27: Behållna bokningar gäller direkt med ändringsmeddelande, utan
  ny bekräftelse. Vid ny bokning informeras tidigare bokade om att den gamla
  bokningen upphört och länkas till nya pass. Även bokade utan aktivitetskallelse
  omfattas; serieändring samlar bemannings- och aktivitetsinformation i ett meddelande.
- 2026-10-27: Bevarande av bokningar tillåts bara när samtliga kan följa med
  till nya schemat. Om bokade pass annars skulle tas bort ska upplägget
  anpassas eller användaren välja ny bokning; ingen bokning försvinner
  automatiskt under alternativet att behålla.
- 2026-10-27: Användaren valde gemensamma tider och plats för hela serien.
  Olika återkommande tider och platser kräver flera serier. Förslaget om
  olika tider per veckodag inom samma serie valdes bort; individuella
  avvikelser enligt tidigare beslut finns kvar.
- 2026-10-27: Nya tillfällen vid förlängning/tillagd veckodag får seriens
  bemanningsupplägg men tomma bokningar. Individuella anpassningar blir inte
  automatiskt mall och befintliga personbokningar kopieras aldrig till nya aktiviteter.
- 2026-10-27: Inställning/borttagning informerar redan kallade och bokade,
  stoppar väntande kallelser/påminnelser och avslutar bemanningsbokningar med
  bevarad historik. Övriga får inget utskick. Serieändringar samlas per mottagare.
- 2026-10-27: Behöll befintlig uppdelning mellan aktivitets- och
  kallelsebehörighet inom klubb/sektion/lag. Automatiska följder hör till en
  tillåten aktivitetsändring; bemanningsval kräver även kallelsebehörighet.
  Medlemskap eller personlig kallelse ger inte administrativ rätt.
- 2026-10-27: Schemalagda målgrupper använder aktuella medlemmar vid utskick,
  med en kallelse per person/aktivitet trots överlappande grupper. Senare
  gruppändringar tar inte automatiskt bort skickade kallelser eller svar.
- 2026-10-27: Samlade meddelanden grupperas per konto och befintlig kanal
  enligt notisinställningar, med högst ett meddelande per kanal/serieändring.
  Familjens berörda barn framgår utan att exponera andra familjer; svar lämnas
  fortfarande per person och aktivitet.
- 2026-10-27: Användaren bekräftade befintligt grundformulär med obligatorisk
  typ/titel/plats, valfri beskrivning, samma dag/flerdagars, veckoserier och
  valfri kallelse med direkt personval endast för enstaka aktiviteter.
  Användaren lade till att förvald aktivitetstyp ska kunna styras av disciplinen.
- 2026-10-27: Typförval ärvs lag före sektion före disciplin och kan bytas
  manuellt för aktiviteten. Utan giltigt förval används Övrigt; saknas även
  den krävs uttryckligt typval.
- 2026-10-27: Typförval för längd, samling och kallelsetider fyller endast
  orörda fält vid skapande/typbyte. Ändrade administrativa förval räknar inte
  om sparade aktiviteter; deras värden ändras endast genom uttrycklig redigering.
- 2026-10-27: Bekräftade högst 366 dagar och 100 planerade tillfällen i
  perioden som skapas/ändras, aktivitetslängd 1 minut–7 dygn och högst fem
  påminnelser. Vid förlängning kontrolleras upplägget från valt tillfälle
  framåt utan att tidigare tillfällen och historik hindrar förlängningen.
- 2026-10-27: Dagbyte sker inom samma kalendervecka, måndag–söndag. Det
  kan innebära bakåtflytt, exempelvis fredag till måndag fyra dagar tidigare.
  Faktiska datum ska visas i förhandsgranskningen.
- 2026-10-27: Dagbyte som ger datum utanför perioden, passerad starttid eller
  dublett inom serien stoppar sparandet med lista över berörda tillfällen.
  Användaren får justera val/period eller hantera tillfället separat; inget
  får automatiskt försvinna eller slås ihop.
- 2026-10-27: Alla åtgärder förhandsgranskas och sparas som allt eller inget.
  Relevant ändrat underlag, exempelvis ny bokning, kräver ny granskning.
  Sparfel behåller utkastet och får inte lämna delar av ändringen sparade.
- 2026-10-27: Sparad ändring och meddelandeuppdrag hör ihop. Senare
  leveransfel återställer inte ändringen; tillfälliga fel försöks igen utan
  dubbletter. UI skiljer sparat från väntande/misslyckad leverans.
- 2026-10-27: Användaren bekräftade att bara uttryckligen ändrade fält
  ändras vid serieändring. En platsändring från oktober ska
  inte återställa tidigare beslutad gemensam novembertid; individuella
  undantag skyddas fortsatt.
- 2026-10-27: Vid oentydig koppling efter ändrad passindelning får användaren
  placera om gamla bokningar till lediga platser i nya pass. Samtliga
  bokningar måste få en giltig plats innan bevarande kan sparas; ny bokning
  är fortsatt ett alternativ.
- 2026-10-27: Målgrupper och kallelseinställningar kan ändras för kommande
  tillfällen, med **Behåll befintliga** som förval. Nya scheman ersätter
  väntande utskick/påminnelser och kallar nya mottagare; skickade kallelser
  och svar bevaras utan dubbletter, med datum-/starttidsändringens nya svarskrav kvar.
- 2026-10-27: Ändrad sista svarstid informerar redan kallade med bibehållna
  svar; enbart ändrade påminnelsetider ger inget separat ändringsmeddelande.
  Påminnelser går bara till obesvarade, inklusive svar som återställts vid flytt.
- 2026-10-27: Manuella borttagningsåtgärder följer samma regel om skickade
  kallelser som serieändringar. Inställda/avslutade aktiviteter är i läsläge
  med separat närvarokorrigering. Återaktivering av inställda ingår inte.
- 2026-10-27: Bekräftade stabil mobilredigering i iOS/Safari, inget stängande
  bakgrundstryck, bekräftelse vid försök att lämna osparade ändringar och
  bevarande av hela utkastet vid fel eller bakgrundsuppdatering.
- 2026-10-27: Behöriga får efterregistrera avslutade enstaka aktiviteter utan
  kallelser/utskick. De hamnar i läsläge med närvaroregistrering enligt egen
  spec. Serier får endast skapa framtida tillfällen.
- 2026-10-27: Inställda och enskilt borttagna tillfällen får inte automatiskt
  återkomma vid senare serieändring. De visas som överhoppade; ett önskat nytt
  tillfälle på samma datum kräver uttryckligt skapande som ny aktivitet.
- 2026-10-27: Enbart ändrad aktivitetstyp uppdateras utan utskick och med
  behållna svar. Samtidiga ändringar av tid, plats, kallelser eller bemanning
  följer sina respektive regler.

## Obekräftade antaganden och förslag

Inga kvarvarande produktförslag väntar på ett separat vägval. Kartlagt nuläge
är bakgrund, medan krav K-001–K-047 beskriver målbilden. Specen ställer inte
krav på beständig utkastlagring efter omladdning; det beslutade utkastskyddet
gäller pågående redigering. Implementation och dess faktiska verifiering ska
fortsatt skiljas från godkända krav.

## Öppna frågor

Inga blockerande produktfrågor återstår.

## Bekräftelse

Användaren bekräftade den samlade kravsammanfattningen 2026-10-27 efter
intervjun. Bekräftelsen omfattar krav K-001–K-047, acceptanskriterier
AK-001–AK-050 och dokumenterade avgränsningar. Status är Redo.
Ingen implementation har beställts.

## Ändringshistorik

- 2026-10-27: Skapade utkast med kartlagt nuläge och öppna beslutsgrenar.
- 2026-10-27: Bekräftade omfattning och avgränsning mot befintliga specar.
- 2026-10-27: Bekräftade två serieomfattningar och skydd för tidigare tillfällen.
- 2026-10-27: Bekräftade att individuellt ändrade aktiviteter hoppas över helt
  vid redigering av kommande serietillfällen.
- 2026-10-27: Utökade skyddet för individuella undantag till serieinställning
  och serieborttagning enligt användarens bekräftelse.
- 2026-10-27: Bekräftade att det öppnade tillfället omfattas även när det självt
  är individuellt ändrat, med fortsatt skydd för övriga undantag.
- 2026-10-27: Utökade omfattningen med förlängning och ändrade veckodagar
  för befintliga serier enligt användarens svar.
- 2026-10-27: Bekräftade att veckodagsbyte flyttar befintliga aktiviteter med
  bevarad identitet och historik.
- 2026-10-27: Bekräftade hantering och förhandsgranskning av tillagda/borttagna
  veckodagar, med historikskydd och bevarade individuella undantag.
- 2026-10-27: Bekräftade separata dagåtgärder och uttrycklig koppling mellan
  gammal och ny veckodag vid flytt, även när flera dagar byts.
- 2026-10-27: Bekräftade gemensamma serieinställningar som redigerbart förval
  för nya tillfällen vid förlängning och tillagda dagar.
- 2026-10-27: Bekräftade förkortning med förhandsgranskning, historikskydd
  och bevarade individuellt ändrade tillfällen även efter nytt slutdatum.
- 2026-10-27: Begränsade serieuppläggets ändringar till **Detta och kommande
  tillfällen**, med fortsatt enskild datum-/tidsredigering i det andra valet.
- 2026-10-27: Bekräftade tidsgränser för enskild redigering, serieändring och
  läsläge, med separat fortsatt hantering av närvaro.
- 2026-10-27: Bekräftade omräkning av väntande kallelseschema och sista
  svarstid vid flytt, för både enskilda tillfällen och serieändringar.
- 2026-10-27: Bekräftade ändringsmeddelande och krav på nytt svar vid ändrat
  datum/starttid efter utskick, med bevarad svars- och kommentarshistorik.
- 2026-10-27: Bekräftade vilka övriga fältändringar som ger ändringsmeddelande
  och att deras aktuella svar bevaras.
- 2026-10-27: Bekräftade samlade ändringsmeddelanden vid serieändringar med
  mottagarens berörda tillfällen, nya uppgifter, nya svarskrav och länkar.
- 2026-10-27: Bekräftade hantering och förhandsgranskning av passerade
  kallelse-/påminnelsetider och blockering vid passerad sista svarstid.
- 2026-10-27: Sparade användarens förslag om nya bemanningspass och val att
  behålla registrerade uppgifter som öppet förslag; betydelsen ska preciseras.
- 2026-10-27: Preciserade enligt användarens svar att bevarande av bokade
  bemanningspass ska väljas per aktivitet; 30 minuter är ett exempel, inte
  ett beslutat gränsvärde för automatisk hantering.
- 2026-10-27: Bekräftade alternativen behåll bokningarna eller öppna för ny
  bokning, utan förval och med separata val per aktivitet samt historikskydd.
- 2026-10-27: Bekräftade information till bokade personer, direkt giltighet
  för behållna bokningar och samlade meddelanden även utan aktivitetskallelse.
- 2026-10-27: Bekräftade att alla bokningar måste kunna bevaras för valet
  **Behåll bokningarna**, med explicit nytt val eller anpassning vid konflikt.
- 2026-10-27: Avgränsade serien till gemensamma tider och plats; olika
  återkommande tider eller platser hanteras med separata serier.
- 2026-10-27: Bekräftade att gemensamt bemanningsupplägg kopieras till nya
  tillfällen utan bokningar och utan automatiskt arv av individuella scheman.
- 2026-10-27: Bekräftade information, stoppade utskick och avslutade bokningar
  med bevarad historik vid inställning eller borttagning.
- 2026-10-27: Bekräftade befintliga behörighetsgränser och behörighet för
  automatiska ändringsföljder respektive bemanningsval.
- 2026-10-27: Bekräftade dynamiskt personurval vid schemalagda utskick,
  dubblettskydd och bevarande av skickade kallelser/svar vid gruppändringar.
- 2026-10-27: Bekräftade meddelandegruppering per konto/kanal med befintliga
  notisinställningar, rättighetsavgränsat innehåll och separata person-/aktivitetssvar.
- 2026-10-27: Bekräftade grundformuläret och lade till disciplinstyrd förvald
  aktivitetstyp enligt användarens tillägg.
- 2026-10-27: Bekräftade typförvalens arv, manuellt typval och fallback till
  Övrigt eller obligatoriskt uttryckligt val när giltig typ saknas.
- 2026-10-27: Bekräftade skydd för manuellt ändrade fält och sparade
  aktiviteter när typförval eller administrativa förval ändras.
- 2026-10-27: Bekräftade exakta gränsvärden och deras tillämpning på framtida
  upplägg vid förlängning, med äldre historik kvar.
- 2026-10-27: Bekräftade måndag–söndag-vecka för dagbyte med synliga datum,
  inklusive bakåtflytt inom samma vecka.
- 2026-10-27: Bekräftade blockerande validering av periodgräns, passerad
  starttid och seriedublett utan automatisk borttagning eller sammanslagning.
- 2026-10-27: Bekräftade obligatorisk förhandsgranskning, atomärt sparande,
  konfliktkontroll och bevarade utkast utan partiella ändringar vid fel.
- 2026-10-27: Bekräftade separat spar-/leveransstatus, beständiga
  meddelandeuppdrag och dubblettsäkra återförsök vid tillfälliga leveransfel.
- 2026-10-27: Bekräftade ändring endast av uttryckligen ändrade fält,
  med bevarade övriga värden från tidigare framtida serieändringar.
- 2026-10-27: Bekräftade manuell koppling av befintliga bokningar till
  nya pass vid ändrad indelning, med fullständig giltig placering före sparande.
- 2026-10-27: Bekräftade redigering av målgrupper och kallelseinställningar
  för kommande tillfällen, uttrycklig schemaersättning och skydd för skickade
  kallelser/svar utan dubbletter.
- 2026-10-27: Bekräftade information vid ändrad sista svarstid och påminnelser
  endast till obesvarade, utan separat meddelande vid ändrade påminnelsetider.
- 2026-10-27: Bekräftade manuell borttagning/inställning, läsläge för
  inställda/avslutade och avgränsning mot återaktivering.
- 2026-10-27: Bekräftade iOS/Safari-flödet och skydd av osparade utkast vid
  interaktion, stängning, navigering, sparfel och bakgrundsuppdatering.
- 2026-10-27: Bekräftade efterregistrering utan utskick för enstaka
  avslutade aktiviteter och framtida tillfällen vid serieskapande.
- 2026-10-27: Bekräftade skydd mot automatisk återkomst för inställda eller
  enskilt borttagna tillfällen vid senare serieändringar.
- 2026-10-27: Bekräftade att enbart typbyte inte ger nytt utskick eller
  ändrar aktuella svar. Avslutade beslutsträdet inför samlad slutbekräftelse.
- 2026-10-27: Användaren godkände den samlade kravsammanfattningen.
  Markerade specen Redo; implementation är fortfarande inte beställd.
- 2026-10-27: Preciserade K-043 efter bekräftat beslut i bemanningsintervjun:
  aktivitetens egna uppgifter är låsta efter slut, men ett senare pass kan
  fortfarande bokas enligt sin egen bokningsgräns. Inställning stänger allt.
