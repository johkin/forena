"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import type { ParticipationFetch } from "./activity-invitation-response";

export function PushNotificationSettings({
  request,
}: {
  request: ParticipationFetch;
}) {
  const [config, setConfig] = useState<{
    available: boolean;
    publicKey: string;
  }>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void request("/api/push-subscriptions", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const next = z
          .object({ available: z.boolean(), publicKey: z.string() })
          .parse(await response.json());
        if (!controller.signal.aborted) setConfig(next);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Push-inställningen kunde inte hämtas.");
      });
    return () => controller.abort();
  }, [request]);
  async function change(enable: boolean) {
    if (!config) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window))
        throw new Error(
          "Den här webbläsaren stöder inte push. På iPhone behöver Förena öppnas från hemskärmen.",
        );
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (enable) {
        if ((await Notification.requestPermission()) !== "granted")
          throw new Error(
            "Tillåt notifieringar i webbläsaren för att aktivera push.",
          );
        const raw = atob(
          config.publicKey.replace(/-/g, "+").replace(/_/g, "/"),
        );
        subscription ??= await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: Uint8Array.from(raw, (char) =>
            char.charCodeAt(0),
          ),
        });
        const response = await request("/api/push-subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription.toJSON()),
        });
        if (!response.ok) {
          await subscription.unsubscribe();
          throw new Error("Push kunde inte aktiveras för kontot. Försök igen.");
        }
      } else if (subscription) {
        const response = await request("/api/push-subscriptions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("Push kunde inte stängas av.");
        await subscription.unsubscribe();
      }
      setNotice(
        enable
          ? "Push är aktiverat på den här enheten."
          : "Push är avstängt på den här enheten.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Push kunde inte ändras.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="form-section">
      <h2>Push-notifieringar</h2>
      <p>
        Privata kallelser går i första hand till Telegram, därefter push och
        sedan e-post om föregående kanal inte kunde leverera.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {config?.available ? (
        <div className="component-example-actions">
          <button
            className="primary"
            type="button"
            disabled={pending}
            onClick={() => void change(true)}
          >
            Aktivera push på den här enheten
          </button>
          <button
            className="secondary"
            type="button"
            disabled={pending}
            onClick={() => void change(false)}
          >
            Stäng av push på den här enheten
          </button>
        </div>
      ) : (
        <p>Push är inte tillgängligt ännu.</p>
      )}
    </section>
  );
}
