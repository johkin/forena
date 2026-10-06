"use client";

import { useState } from "react";

export type ApplicationListItem = {
  createdAt: string;
  source: "legacy" | "public_form" | "verified_member";
  verifiedAt: string | null;
  verifiedEmail: string | null;
  reviewedAt: string | null;
  timeZone: string;
  id: string;
  playerName: string;
  birthDate: string;
  sectionName: string;
  teamName: string;
  guardians: { name: string; email: string; mobile: string }[];
  previousClub: string;
  message: string;
  reviewStatus: "submitted" | "approved" | "rejected";
  activationStatus: "not_started" | "invitation_sent" | "email_verified" | "activated";
};

function ApplicationDetails({ application }: { application: ApplicationListItem }) {
  const date = (value: string) => {
    try {
      return new Intl.DateTimeFormat("sv-SE", {
        dateStyle: "short", timeStyle: "short", timeZone: application.timeZone,
      }).format(new Date(value));
    } catch {
      return value;
    }
  };
  const sources = { legacy: "Äldre ansökan", public_form: "Publikt ansökningsformulär", verified_member: "Inloggad medlem" };
  return <details><summary>Ansökningsinformation</summary><dl>
    <div><dt>Inskickad</dt><dd>{date(application.createdAt)}</dd></div>
    <div><dt>Källa</dt><dd>{sources[application.source]}</dd></div>
    <div><dt>E-postverifiering</dt><dd>{application.verifiedAt
      ? `${application.verifiedEmail} · ${date(application.verifiedAt)}`
      : "Äldre ansökan – verifiering saknas"}</dd></div>
    {application.reviewedAt ? <div><dt>Behandlad</dt><dd>{date(application.reviewedAt)}</dd></div> : null}
    <div><dt>Ansöknings-ID</dt><dd>{application.id}</dd></div>
  </dl></details>;
}

export function ApplicationReviewList({ initialApplications }: { initialApplications: ApplicationListItem[] }) {
  const [applications, setApplications] = useState(initialApplications);
  const [pendingId, setPendingId] = useState<string>();
  const [notice, setNotice] = useState<string>();

  async function decide(id: string, decision: "approved" | "rejected") {
    const rejectionReason = decision === "rejected" ? window.prompt("Orsak till avslag (valfritt)") ?? "" : "";
    setPendingId(id);
    const response = await fetch(`/api/membership-applications/${id}/review`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, rejectionReason }),
    });
    const result = await response.json();
    setPendingId(undefined);
    if (!response.ok) { setNotice(result.error ?? "Beslutet kunde inte sparas."); return; }
    setApplications((items) => items.map((item) => item.id === id ? { ...item, reviewStatus: decision, activationStatus: decision === "approved" ? "invitation_sent" : item.activationStatus } : item));
    setNotice(decision === "approved" ? `${result.invitations} aktiveringslänk(ar) skickades. Tidigare länkar är inte längre giltiga.` : "Ansökan avslogs.");
  }

  return <div className="application-queue">{notice ? <p className="toast" role="status">{notice}</p> : null}{applications.map((application) => <article className="application-item" key={application.id}><div className="application-item-heading"><div><p className="eyebrow">{application.sectionName} · {application.teamName}</p><h2>{application.playerName}</h2><p>Född {application.birthDate}</p></div><span className={`review-status ${application.reviewStatus}`}>{application.reviewStatus === "submitted" ? "Väntar" : application.reviewStatus === "approved" ? "Godkänd" : "Avslagen"}</span></div><dl><div><dt>Målsmän</dt><dd>{application.guardians.map((guardian) => <span key={guardian.email}>{guardian.name} · {guardian.email}{guardian.mobile ? ` · ${guardian.mobile}` : ""}</span>)}</dd></div>{application.previousClub ? <div><dt>Tidigare förening</dt><dd>{application.previousClub}</dd></div> : null}{application.message ? <div><dt>Meddelande</dt><dd>{application.message}</dd></div> : null}</dl><ApplicationDetails application={application} />{application.reviewStatus === "submitted" ? <div className="review-actions"><button className="secondary" disabled={pendingId === application.id} onClick={() => void decide(application.id, "rejected")} type="button">Avslå</button><button className="primary" disabled={pendingId === application.id} onClick={() => void decide(application.id, "approved")} type="button">Godkänn och skicka länkar</button></div> : <><p className="form-help">Aktivering: {application.activationStatus === "activated" ? "klar" : application.activationStatus === "invitation_sent" ? "inbjudan skickad" : "inte påbörjad"}</p>{application.reviewStatus === "approved" && application.activationStatus !== "activated" ? <div className="review-actions"><button className="secondary" disabled={pendingId === application.id} onClick={() => void decide(application.id, "approved")} type="button">Skicka nya länkar</button></div> : null}</>}</article>)}</div>;
}
