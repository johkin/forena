"use client";

import { AssistantHeading, AssistantLauncher } from "./assistant-frame";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { z } from "zod";
import { useModalScrollLock } from "../lib/use-modal-scroll-lock";
import type { ParticipationFetch } from "./activity-invitation-response";

const conversationSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid().nullable(),
  channel: z.enum(["web", "telegram"]),
  active: z.boolean(),
  updatedAt: z.string(),
});
const messageSchema = z.object({
  id: z.uuid(),
  role: z.enum(["user", "assistant"]),
  sender: z.string(),
  organizationId: z.uuid().nullable(),
  content: z.string(),
});
const proposalSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  kind: z.string(),
  label: z.string(),
  state: z.enum(["pending", "completed", "invalid"]),
  expiresAt: z.string(),
});
const viewSchema = z.object({
  conversation: conversationSchema,
  messages: z.array(messageSchema),
  proposals: z.array(proposalSchema),
});
const replySchema = z.object({
  sender: z.string(),
  organizationId: z.uuid().nullable(),
  text: z.string(),
  proposals: z.array(proposalSchema).default([]),
  failed: z.boolean(),
  pending: z.boolean().default(false),
});
type Conversation = z.infer<typeof conversationSchema>;
type Message = z.infer<typeof messageSchema>;
type Proposal = z.infer<typeof proposalSchema>;

/** Same production conversation view is used in the application and component gallery. */
export function AssistantWorkspace({
  request,
  organizationId,
  teamId,
  activityId,
  initialConversationId,
}: {
  request: ParticipationFetch;
  organizationId?: string;
  teamId?: string;
  activityId?: string;
  initialConversationId?: string;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversation, setConversation] = useState<Conversation>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [thinking, setThinking] = useState<{ id: string; label: string }[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const sequence = useRef(0);
  const mounted = useRef(true);
  const field = useId();
  const thread = useRef<HTMLDivElement>(null);
  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight });
  }, [messages, thinking]);

  async function load(id: string) {
    const response = await request(`/api/assistant/conversations/${id}`);
    if (!response.ok) throw new Error("Samtalet kunde inte hämtas.");
    return viewSchema.parse(await response.json());
  }
  function apply(view: z.infer<typeof viewSchema>) {
    setConversation(view.conversation);
    setMessages(view.messages);
    setProposals(view.proposals);
  }
  async function refreshList(signal?: AbortSignal) {
    const response = await request("/api/assistant/conversations", { signal });
    if (!response.ok) throw new Error("Samtalen kunde inte hämtas.");
    return z.array(conversationSchema).parse(await response.json());
  }
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    const expected = ++sequence.current;
    void (async () => {
      try {
        const list = await refreshList(controller.signal);
        const chosen = initialConversationId
          ? list.find((item) => item.id === initialConversationId)
          : list.find(
              (item) =>
                item.channel === "web" &&
                item.active &&
                item.organizationId === (organizationId ?? null),
            );
        const view = chosen ? await load(chosen.id) : null;
        if (controller.signal.aborted || expected !== sequence.current) return;
        setConversations(list);
        if (view) apply(view);
      } catch {
        if (!controller.signal.aborted && expected === sequence.current)
          setError("Samtalen kunde inte hämtas. Försök igen.");
      }
    })();
    return () => {
      mounted.current = false;
      controller.abort();
    };
    // The parent remounts this workspace when the account or club changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, organizationId, initialConversationId]);

  async function create() {
    const response = await request("/api/assistant/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: organizationId ?? null,
        teamId: teamId ?? null,
      }),
    });
    if (!response.ok) throw new Error("Ett nytt samtal kunde inte startas.");
    const next = conversationSchema.parse(await response.json());
    setConversation(next);
    setMessages([]);
    setProposals([]);
    setConversations(await refreshList());
    return next;
  }
  async function run(work: () => Promise<void>) {
    if (pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Begäran misslyckades. Försök igen.",
        );
    } finally {
      if (mounted.current) {
        setPending(false);
        setThinking([]);
      }
    }
  }
  async function send() {
    const text = question.trim();
    if (!text) return;
    await run(async () => {
      const active = conversation ?? (await create());
      const response = await request(
        `/api/assistant/conversations/${active.id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            teamId: teamId ?? null,
            activityId: activityId ?? null,
          }),
        },
      );
      if (!response.ok || !response.body)
        throw new Error("Frågan kunde inte skickas. Försök igen.");
      setQuestion("");
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "user",
          sender: "Du",
          organizationId: null,
          content: text,
        },
      ]);
      setProposals((current) =>
        current.map((item) =>
          item.state === "pending" ? { ...item, state: "invalid" } : item,
        ),
      );
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      try {
        while (true) {
          const result = await reader.read();
          buffered += decoder.decode(result.value, { stream: !result.done });
          const lines = buffered.split("\n");
          buffered = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const reply = replySchema.parse(JSON.parse(line));
            if (!mounted.current) continue;
            if (reply.pending) {
              setThinking((current) => [
                ...current.filter(
                  (item) => item.id !== (reply.organizationId ?? "personal"),
                ),
                { id: reply.organizationId ?? "personal", label: reply.sender },
              ]);
              continue;
            }
            setThinking((current) =>
              current.filter(
                (item) => item.id !== (reply.organizationId ?? "personal"),
              ),
            );
            setMessages((current) => [
              ...current,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                sender: reply.sender,
                organizationId: reply.organizationId,
                content: reply.text,
              },
            ]);
            setProposals((current) => [...current, ...reply.proposals]);
          }
          if (result.done) break;
        }
      } finally {
        reader.releaseLock();
      }
    });
  }
  async function confirm(proposal: Proposal) {
    await run(async () => {
      const response = await request(
        `/api/assistant/proposals/${proposal.id}/confirm`,
        { method: "POST" },
      );
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? "Underlaget har ändrats eller förslaget har gått ut. Be om ett nytt förslag."
            : "Förslaget kunde inte bekräftas. Kontrollera behörigheten och försök igen.",
        );
      const result = z
        .object({
          confirmed: z.boolean(),
          message: z.string(),
          proposal: proposalSchema.nullable(),
        })
        .parse(await response.json());
      setNotice(result.message);
      if (result.confirmed)
        window.dispatchEvent(new Event("forena:assistant-change"));
      setProposals((current) => [
        ...current.map((item) =>
          item.id === proposal.id
            ? {
                ...item,
                state: result.confirmed
                  ? ("completed" as const)
                  : ("invalid" as const),
              }
            : item,
        ),
        ...(result.proposal ? [result.proposal] : []),
      ]);
    });
  }
  const readOnly =
    conversation?.channel === "telegram" ||
    (conversation && !conversation.active);
  return (
    <article className="card assistant-card team-chat-card floating-assistant-chat">
      <div className="assistant-conversation-controls">
        <label htmlFor={`${field}-history`}>Sparade samtal</label>
        <select
          id={`${field}-history`}
          disabled={pending}
          value={conversation?.id ?? ""}
          onChange={(event) => {
            const id = event.target.value;
            if (id)
              void run(async () => {
                apply(await load(id));
              });
          }}
        >
          <option value="">Välj samtal</option>
          {conversations
            .filter(
              (item) =>
                item.channel === "telegram" ||
                item.organizationId === (organizationId ?? null),
            )
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.channel === "telegram" ? "Telegram" : "Webb"} ·{" "}
                {new Date(item.updatedAt).toLocaleString("sv-SE")}
              </option>
            ))}
        </select>
        <div className="component-example-actions">
          <button
            type="button"
            className="secondary"
            disabled={pending}
            onClick={() =>
              void run(async () => {
                await create();
              })
            }
          >
            Nytt samtal
          </button>
          {conversation ? (
            <button
              type="button"
              className="secondary danger"
              disabled={pending}
              onClick={() => {
                if (
                  window.confirm(
                    "Radera det sparade samtalet i Förena? Telegrams egna meddelandekopior raderas inte.",
                  )
                )
                  void run(async () => {
                    const response = await request(
                      `/api/assistant/conversations/${conversation.id}`,
                      { method: "DELETE" },
                    );
                    if (!response.ok)
                      throw new Error("Samtalet kunde inte raderas.");
                    setConversation(undefined);
                    setMessages([]);
                    setProposals([]);
                    setConversations(await refreshList());
                  });
              }}
            >
              Radera samtal
            </button>
          ) : null}
        </div>
      </div>
      <div ref={thread} className="assistant-conversation" aria-live="polite">
        {!messages.length ? (
          <p>
            Fråga om aktiviteter, kallelser eller lagets rutiner. Ange klubb
            eller lag när det behövs, exempelvis @UIK.
          </p>
        ) : null}
        <div className="assistant-messages">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`assistant-message ${message.role}`}
            >
              <span>{message.sender}</span>
              <p>{message.content}</p>
            </div>
          ))}
        </div>
        {proposals.map((proposal) => (
          <section key={proposal.id} className="assistant-message">
            <h3>Förslag att granska</h3>
            <p className="assistant-proposal-summary">{proposal.label}</p>
            {proposal.state === "completed" ? (
              <p>Genomfört</p>
            ) : proposal.state === "invalid" ? (
              <p>Förslaget är inte längre giltigt.</p>
            ) : (
              <button
                className="primary"
                type="button"
                disabled={
                  pending ||
                  (conversation?.channel === "telegram" &&
                    ["response", "attendance"].includes(proposal.kind))
                }
                onClick={() => void confirm(proposal)}
              >
                {(
                  {
                    duty: "Spara uppgifter",
                    memory: "Spara minne",
                    activity: "Skapa aktivitet",
                    series: "Skapa serie",
                    reminder: "Skicka påminnelse",
                    attendance: "Registrera närvaro",
                    response: "Bekräfta svar",
                  } as Record<string, string>
                )[proposal.kind] ?? "Bekräfta"}
              </button>
            )}
          </section>
        ))}
        {thinking.map((sender) => (
          <p key={sender.id} role="status">
            {sender.label} svarar…
          </p>
        ))}
        {pending && !thinking.length ? (
          <p role="status">Förena svarar…</p>
        ) : null}
        {notice ? <p role="status">{notice}</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        {readOnly ? (
          <p>
            Detta är sparad historik. Telegrams aktiva dialog ändras inte när du
            läser här.
          </p>
        ) : null}
        {conversation?.channel === "web" && !conversation.active ? (
          <button
            type="button"
            className="secondary"
            disabled={pending}
            onClick={() =>
              void run(async () => {
                const response = await request(
                  `/api/assistant/conversations/${conversation.id}/resume`,
                  { method: "POST" },
                );
                if (!response.ok)
                  throw new Error(
                    "Samtalet kunde inte återupptas. Kontrollera din behörighet.",
                  );
                setConversation(
                  conversationSchema.parse(await response.json()),
                );
                setConversations(await refreshList());
              })
            }
          >
            Återuppta samtal
          </button>
        ) : null}
      </div>
      <form
        className="assistant-input"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label className="sr-only" htmlFor={field}>
          Fråga assistenten
        </label>
        <input
          id={field}
          maxLength={4000}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          disabled={pending || Boolean(readOnly)}
          placeholder="Fråga Förena…"
        />
        <button
          type="submit"
          aria-label="Skicka"
          disabled={pending || Boolean(readOnly) || !question.trim()}
        >
          ↑
        </button>
      </form>
      <small className="assistant-disclaimer">
        AI kan ha fel. Granska förslag före bekräftelse.
      </small>
    </article>
  );
}

function ScrollLock() {
  useModalScrollLock();
  return null;
}
export function PersistentAssistant({
  request,
  organizationId,
  teamId,
  activityId,
  name = "Förena",
  initialConversationId,
}: {
  request: ParticipationFetch;
  organizationId?: string;
  teamId?: string;
  activityId?: string;
  name?: string;
  initialConversationId?: string;
}) {
  const [open, setOpen] = useState(Boolean(initialConversationId));
  const [mounted, setMounted] = useState(Boolean(initialConversationId));
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const title = useId();
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) {
      dialog.current.close();
      trigger.current?.focus();
    }
  }, [open, mounted]);
  return (
    <>
      <AssistantLauncher
        trigger={trigger}
        label={`Öppna ${name}`}
        open={open}
        onOpen={() => {
          setMounted(true);
          setOpen(true);
        }}
      />
      {mounted
        ? createPortal(
            <dialog
              ref={dialog}
              className="floating-assistant-dialog"
              aria-labelledby={title}
              onCancel={(event) => {
                event.preventDefault();
                setOpen(false);
              }}
            >
              {open ? <ScrollLock /> : null}
              <AssistantHeading
                id={title}
                name={name}
                context={
                  organizationId ? "Klubbsamtal" : "Din personliga assistent"
                }
                onMinimize={() => setOpen(false)}
              />
              <AssistantWorkspace
                request={request}
                organizationId={organizationId}
                teamId={teamId}
                activityId={activityId}
                initialConversationId={initialConversationId}
              />
            </dialog>,
            document.body,
          )
        : null}
    </>
  );
}
