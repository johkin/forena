import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import "@fontsource-variable/plus-jakarta-sans/index.css";
import "@fontsource-variable/newsreader/index.css";
import "../../src/app/globals.css";
import { loadConfig } from "./config";
import { App, ConfigurationError } from "./app";

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
  const config = await loadConfig();
  const auth = createClient(config.supabaseUrl, config.publishableKey, {
    auth: { storageKey: "forena-kotlin-browser-auth", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  root.render(<App config={config} client={auth} />);
}
void start().catch(() => root.render(<ConfigurationError />));
