"use client";

import { useState } from "react";
import { AttendanceModal } from "./attendance-modal";
import type { ParticipationFetch } from "./activity-invitation-response";

/** The activity snapshot supplies access; every roster read and write rechecks it on the server. */
export function ActivityAttendance({ activityId, request, canManage, started, ended, cancelled, onSaved }: {
  activityId: string; request: ParticipationFetch; canManage: boolean; started: boolean; ended: boolean; cancelled: boolean; onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!canManage || (!started && !cancelled)) return null;
  return <>
    <button type="button" className="primary" onClick={() => setOpen(true)}>{cancelled ? "Visa närvarohistorik" : ended ? "Justera närvaro" : "Rapportera närvaro"}</button>
    {open ? <AttendanceModal activityId={activityId} request={request} versioned onClose={() => setOpen(false)} onSaved={onSaved} /> : null}
  </>;
}
