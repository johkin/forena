export function dutyNotificationContent(title: string, reason?: string) {
 const messages: Record<string,string> = {
   pending: "Det finns ett nytt ändringsförslag i bemanningsschemat. Öppna aktiviteten i Förena för att se förslaget och eventuellt godkänna det.",
   applied: "Ett ändringsförslag har genomförts i bemanningsschemat. Kontrollera din aktuella tilldelning i Förena.",
   rejected: "Ett ändringsförslag har avböjts. Den tidigare tilldelningen gäller fortfarande.",
   withdrawn: "Ett ändringsförslag har återtagits. Den tidigare tilldelningen gäller fortfarande.",
   expired: "Ett ändringsförslag har blivit inaktuellt eller gått ut. Kontrollera den aktuella tilldelningen i Förena.",
   assigned: "Tilldelningen av arbetsuppgifter har ändrats. Öppna aktiviteten i Förena för att se ditt aktuella pass och instruktioner.",
   edited: "Tider, instruktioner eller antal platser i bemanningsschemat har ändrats. Kontrollera din uppgift i Förena.",
   cancelled: "En arbetsuppgift har tagits bort ur schemat och dess tilldelningar har frigjorts. Kontrollera dina återstående uppgifter i Förena.",
 };
 return {subject:`Bemanning: ${title}`,text:messages[reason??""]??"Bemanningsschemat har uppdaterats. Öppna aktiviteten i Förena för aktuella uppgifter."};
}
