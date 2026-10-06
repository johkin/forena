import { NavigationLinks } from "./navigation-links";

export const systemNavigationItems = [{ href:"/system",label:"System" },{ href:"/system/administrators",label:"Administratörer" },{ href:"/system/disciplines",label:"Discipliner" },{ href:"/system/activity-types",label:"Aktivitetstyper" },{ href:"/system/memories",label:"Assistentminnen" },{ href:"/",label:"Till Förena" }];
export function SystemNavigation() {
  return <NavigationLinks label="Systemadministration" items={systemNavigationItems} />;
}
