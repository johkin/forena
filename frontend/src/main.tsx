import { BrowserRouter } from "react-router";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/plus-jakarta-sans/index.css";
import "@fontsource-variable/newsreader/index.css";
import "../../src/app/globals.css";
import "../../src/components/personal-overview.css";
import "../../src/app/workflows.css";
import "../../src/app/date-time.css";
import "../../src/app/club-admin.css";
import { loadConfig } from "./config";
import { App, ConfigurationError } from "./app";
import { clearLegacyAuth } from "./session";

const root = createRoot(document.getElementById("root")!);
async function start() {
  // This isolated origin previously hosted the Next pilot. Never retain its
  // worker/cached shell when switching to the static browser application.
  if ("serviceWorker" in navigator) {
    for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
  }
  if ("caches" in window) {
    for (const name of await caches.keys()) if (name.startsWith("forena-")) await caches.delete(name);
  }
  clearLegacyAuth();
  const config = await loadConfig();
  root.render(<BrowserRouter><App config={config} /></BrowserRouter>);
}
void start().catch(() => root.render(<BrowserRouter><ConfigurationError /></BrowserRouter>));
