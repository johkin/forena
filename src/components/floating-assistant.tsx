"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Organization, Team, Member, Section } from "@/domain/club";
import type { ActivityDraft } from "@/lib/ai/activity-draft";
import { assistantPageContext } from "@/lib/assistant-page-context";
import { useModalScrollLock } from "@/lib/use-modal-scroll-lock";
import { TeamAssistantCard } from "./team-assistant-card";
const ActivityEditorModal = dynamic(() => import("./activity-editor-modal").then(module => module.ActivityEditorModal));

export type AssistantDraftContext = { organization: Organization; team: Team; members: Member[]; canManageInvitations: boolean };
export type FloatingAssistantOptions = { demo?: boolean; canCreateActivity?: boolean; pageTitle?: string; onActivityDraft?: (draft: ActivityDraft) => void };

function ScrollLock() { useModalScrollLock(); return null; }

/** One responsive assistant surface for all authenticated organization pages. */
export function FloatingAssistant({ organization, team, section, options = {} }: { organization: Organization; team?: Team; section?: Section; options?: FloatingAssistantOptions }) {
  const pathname = usePathname();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const [unread, setUnread] = useState(false);
  const [editor, setEditor] = useState<{ draft: ActivityDraft; context: AssistantDraftContext }>();
  const [notice, setNotice] = useState<string>();
  const pageContext = assistantPageContext(pathname, organization.slug, team?.name);
  const scopeName = team?.name ?? section?.name ?? (pageContext?.sectionSlug ? "Sektion" : organization.name);
  const scopeKey = `${organization.id}:${team?.id ?? section?.id ?? pageContext?.sectionSlug ?? "organization"}`;

  useEffect(() => {
    openRef.current = open;
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) { dialog.current.close(); trigger.current?.focus(); }
  }, [open, mounted]);
  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    const panel = dialog.current;
    function resize() {
      if (!panel) return;
      if (window.innerWidth < 768 && viewport) {
        panel.style.height = `calc(${Math.max(120, viewport.height - 16)}px - env(safe-area-inset-top) - env(safe-area-inset-bottom))`;
        panel.style.top = `calc(${viewport.offsetTop + 8}px + env(safe-area-inset-top))`;
        panel.style.margin = "0 auto";
      } else { panel.style.height = ""; panel.style.top = ""; panel.style.margin = ""; }
    }
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    return () => { viewport?.removeEventListener("resize", resize); viewport?.removeEventListener("scroll", resize); window.removeEventListener("resize", resize); };
  }, [open]);

  function minimize() { setOpen(false); }
  function draftReady(draft: ActivityDraft, context?: AssistantDraftContext) {
    minimize();
    if (options.onActivityDraft && team?.id === context?.team.id) options.onActivityDraft(draft);
    else if (context) setEditor({ draft, context });
  }

  return <>
    <button ref={trigger} type="button" className="assistant-launcher" aria-label={`Öppna ${organization.assistantName || "föreningsassistenten"} för ${scopeName}${unread ? ", nytt svar" : ""}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setMounted(true); setOpen(true); setUnread(false); }}><svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2Z" /></svg>{unread ? <span className="assistant-unread" aria-hidden="true">1</span> : null}</button>
    {notice ? <p className="assistant-notice" role="status">{notice}<button type="button" onClick={() => setNotice(undefined)} aria-label="Stäng meddelande">×</button></p> : null}
    {mounted ? createPortal(<dialog ref={dialog} className="floating-assistant-dialog" aria-labelledby="floating-assistant-title" onCancel={event => { event.preventDefault(); minimize(); }} onClick={event => { if (event.target === event.currentTarget) minimize(); }}>
      {open ? <ScrollLock /> : null}
      <div className="floating-assistant-heading"><div><h2 id="floating-assistant-title">{organization.assistantName || "Föreningsassistenten"}</h2><p>{organization.name}{scopeName !== organization.name ? ` · ${scopeName}` : ""} · {options.pageTitle ?? pageContext?.page.title}</p></div><button type="button" aria-label="Minimera assistenten" onClick={minimize}>−</button><button type="button" aria-label="Stäng assistenten" onClick={minimize}>×</button></div>
      <TeamAssistantCard key={scopeKey} teamId={team?.id} teamName={scopeName} assistantName={organization.assistantName || "Föreningsassistenten"} organizationId={organization.id} sectionSlug={section?.slug ?? pageContext?.sectionSlug} page={pageContext ? { ...pageContext.page, title: options.pageTitle ?? pageContext.page.title } : undefined} demo={options.demo ?? false} canCreateActivity={options.canCreateActivity ?? false} onActivityDraft={draftReady} onOpenActivity={minimize} onReply={() => { if (!openRef.current) setUnread(true); }} floating />
    </dialog>, document.body) : null}
    {editor ? createPortal(<ActivityEditorModal mode="create" organization={editor.context.organization} team={editor.context.team} members={editor.context.members} draft={editor.draft} source="database" canManageInvitations={editor.context.canManageInvitations} onClose={() => { setEditor(undefined); router.refresh(); }} onNotice={setNotice} />, document.body) : null}
  </>;
}
