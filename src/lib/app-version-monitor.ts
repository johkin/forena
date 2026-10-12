/** Checks visible, online pages without interrupting ongoing work. */
export function monitorAppVersion(currentVersion: string, onChange: () => void) {
  if (!currentVersion) return () => {};
  let stopped = false;
  let request: AbortController | undefined;
  const check = async () => {
    if (stopped || request || document.visibilityState !== "visible" || !navigator.onLine) return;
    const controller = new AbortController();
    request = controller;
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch("/app-version.json", { cache: "no-store", credentials: "omit", signal: controller.signal });
      if (!response.ok) return;
      const data: unknown = await response.json();
      if (!stopped && data && typeof data === "object" && "version" in data &&
          typeof data.version === "string" && data.version.length > 0 && data.version !== currentVersion) {
        stop();
        onChange();
      }
    } catch {
      // Network errors and invalid responses are retried later.
    } finally {
      window.clearTimeout(timeout);
      request = undefined;
    }
  };
  const listener = () => { void check(); };
  const interval = window.setInterval(listener, 5 * 60_000);
  function stop() {
    stopped = true;
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", listener);
    window.removeEventListener("online", listener);
    request?.abort();
  }
  document.addEventListener("visibilitychange", listener);
  window.addEventListener("online", listener);
  void check();
  return stop;
}
