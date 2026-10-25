import { NavigationLinks } from "./navigation-links";
import { systemNavigationItems } from "./system-navigation-items";

export { systemNavigationItems } from "./system-navigation-items";
export function SystemNavigation() {
  return <NavigationLinks label="Systemadministration" items={systemNavigationItems} />;
}
