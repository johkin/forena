"use client";

import { useEffect, useState } from "react";
import { monitorAppVersion } from "@/lib/app-version-monitor";

export function AppUpdateNotice() {
  const [available, setAvailable] = useState(false);
  useEffect(() => monitorAppVersion(process.env.NEXT_PUBLIC_APP_VERSION ?? "", () => setAvailable(true)), []);
  if (!available) return null;
  return (
    <div className="app-update-notice">
      <p role="status">En ny version av Förena finns.</p>
      <button className="primary" type="button" onClick={() => window.location.reload()}>Ladda om</button>
    </div>
  );
}
