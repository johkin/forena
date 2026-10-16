import { createHmac, createPrivateKey, sign, type JsonWebKey } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "./supabase/database.types";
import { getSupabaseEnvironment } from "./supabase/env";
import { createAdminClient } from "./supabase/admin";
import { answerTeamAssistant } from "./ai/team-assistant";
import type { AssistantDependencies } from "./ai/team-assistant-types";
import { TeamAssistantError } from "./ai/team-assistant-types";

export type TelegramQuestion = { sender: string; chatId: string; messageId: string; eventAt: string; question: string; teamPath?: string };
export const telegramAssistantEnabled = () => process.env.TELEGRAM_ASSISTANT_ENABLED === "true";

/** Key must match an active Supabase JWT signing key; never an API/service key.
 * Tokens exist only inside this request and are never sent to Telegram or stored.
 */
export function telegramUserToken(userId: string) {
  const jwk = JSON.parse(process.env.TELEGRAM_ASSISTANT_SIGNING_JWK ?? "null") as (JsonWebKey & { alg?: string; kid?: string; k?: string }) | null;
  if (!jwk || !["HS256", "ES256", "RS256"].includes(jwk.alg ?? "") || !z.uuid().safeParse(userId).success) throw new Error("telegram_assistant_signing_configuration");
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${encode({ alg: jwk.alg, typ: "JWT", ...(jwk.kid ? { kid: jwk.kid } : {}) })}.${encode({ sub: userId, role: "authenticated", aud: "authenticated", iss: `${getSupabaseEnvironment().url.replace(/\/$/, "")}/auth/v1`, iat: now, exp: now + 120, is_anonymous: false })}`;
  let signature: Buffer;
  if (jwk.alg === "HS256") {
    if (jwk.kty !== "oct" || !jwk.k || Buffer.from(jwk.k, "base64url").length < 32) throw new Error("telegram_assistant_signing_configuration");
    signature = createHmac("sha256", Buffer.from(jwk.k, "base64url")).update(body).digest();
  } else {
    if (!jwk.kid) throw new Error("telegram_assistant_signing_configuration");
    if ((jwk.alg === "ES256" && (jwk.kty !== "EC" || jwk.crv !== "P-256")) || (jwk.alg === "RS256" && jwk.kty !== "RSA")) throw new Error("telegram_assistant_signing_configuration");
    signature = sign("sha256", Buffer.from(body), { key: createPrivateKey({ key: jwk, format: "jwk" }), dsaEncoding: "ieee-p1363" });
  }
  return `${body}.${signature.toString("base64url")}`;
}

// Match only whole names from the server's RLS-filtered list. Text is a routing
// hint, never an authorization source; answerTeamAssistant checks access again.
export function telegramMentionsTeam(question: string, team: { name: string; slug: string }) {
  const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("sv-SE");
  const text = normalize(question);
  return [team.name, team.slug].some(value => {
    const escaped = normalize(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "u").test(text);
  });
}

type PersonalTeam = { teamId: string; people: string[] };

/** Derive personal routing from current self/guardian records, never chat claims. */
export async function telegramPersonalTeams(supabase: AssistantDependencies["supabase"], userId: string, question: string): Promise<PersonalTeam[]> {
  const [own, guardians] = await Promise.all([
    supabase.from("people").select("id, display_name").eq("user_id", userId).limit(51),
    supabase.from("person_guardians").select("person_id").eq("guardian_user_id", userId).limit(51),
  ]);
  if (own.error || guardians.error || !own.data || !guardians.data) throw new Error("telegram_assistant_people_failed");
  const ids = [...new Set([...own.data.map(person => person.id), ...guardians.data.map(link => link.person_id)])];
  if (ids.length > 50) return [];
  if (!ids.length) return [];
  const [people, memberships] = await Promise.all([
    supabase.from("people").select("id, display_name").in("id", ids).limit(51),
    supabase.from("memberships").select("person_id, team_id").in("person_id", ids).eq("role", "participant").is("ends_on", null).limit(201),
  ]);
  if (people.error || memberships.error || !people.data || !memberships.data) throw new Error("telegram_assistant_memberships_failed");
  if (memberships.data.length > 200) return [];
  const mentioned = people.data.filter(person => telegramMentionsTeam(question, { name: person.display_name, slug: person.display_name.trim().split(/\s+/)[0] }));
  const relevant = mentioned.length ? mentioned : people.data;
  const selected = new Map<string, string[]>();
  for (const membership of memberships.data) {
    if (!membership.team_id) continue;
    const person = relevant.find(person => person.id === membership.person_id);
    if (!person) continue;
    const names = selected.get(membership.team_id) ?? [];
    if (!names.includes(person.display_name)) names.push(person.display_name);
    selected.set(membership.team_id, names);
  }
  return [...selected].map(([teamId, people]) => ({ teamId, people }));
}

const claimSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ready"), userId: z.uuid() }),
  z.object({ status: z.enum(["unlinked", "ignored", "limited"]) }),
]);

/** Private chat only. The database resolves identity; chat input cannot select a user. */
export async function answerTelegramQuestion(action: TelegramQuestion): Promise<string | null> {
  if (action.chatId !== action.sender || !/^[1-9][0-9]{0,15}$/.test(action.sender)) return null;
  const admin = createAdminClient();
  const claim = await admin.rpc("claim_telegram_assistant", { sender: action.sender, event_at: action.eventAt, message_id: action.messageId });
  if (claim.error) throw new Error("telegram_assistant_claim_failed");
  const identity = claimSchema.parse(claim.data);
  if (identity.status === "ignored") return null;
  if (identity.status === "unlinked") return "Koppla först ditt Telegram-konto via Min profil i Förena → Aktivera Telegram. Tryck sedan Start hos boten. /help visar hjälp.";
  if (identity.status === "limited") return "Du har ställt många frågor. Vänta en stund eller använd assistenten i Förena.";

  if (identity.status !== "ready") return null;
  let answer: string;
  try {
    const { url, publishableKey } = getSupabaseEnvironment();
    const supabase = createClient<Database>(url, publishableKey, {
      global: { headers: { Authorization: `Bearer ${telegramUserToken(identity.userId)}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    // Explicit organization/team slugs avoid choosing between similarly named teams.
    let query = supabase.from("teams").select("id, name, slug, organization_id").order("id").limit(201);
    if (action.teamPath) {
      const parts = action.teamPath.split("/");
      if (parts.length !== 2 || !parts.every(part => /^[a-z0-9-]{1,100}$/.test(part))) return "Använd /ask klubbens-slug/lagets-slug din fråga. Du hittar båda i lagets webbadress i Förena.";
      const organization = await supabase.from("organizations").select("id").eq("slug", parts[0]).maybeSingle();
      if (organization.error) throw new Error("telegram_assistant_organization_failed");
      if (!organization.data) return "Jag hittar inte föreningen. Kontrollera klubbens och lagets webbadress i Förena.";
      query = query.eq("slug", parts[1]).eq("organization_id", organization.data.id);
    }
    const teams = await query;
    if (teams.error || !teams.data) throw new Error("telegram_assistant_teams_failed");
    const mentioned = action.teamPath || teams.data.length > 200 ? [] : teams.data.filter(team => telegramMentionsTeam(action.question, team));
    let selected = mentioned.length === 1 ? mentioned[0] : teams.data.length === 1 ? teams.data[0] : undefined;
    const personal = !selected && !action.teamPath && !mentioned.length && teams.data.length <= 200
      ? (await telegramPersonalTeams(supabase, identity.userId, action.question)).filter(item => teams.data.some(team => team.id === item.teamId)) : [];
    if (personal.length === 1) selected = teams.data.find(team => team.id === personal[0].teamId);
    if (personal.length > 1 && personal.length <= 3) {
      const replies = await Promise.all(personal.map(async item => {
        const team = teams.data.find(team => team.id === item.teamId)!;
        const reply = await answerTeamAssistant({ teamId: team.id, question: action.question.trim().slice(0, 500), messages: [] }, { supabase, userId: identity.userId });
        const hasDraft = reply.activityDraft || reply.memoryDrafts?.length || reply.reminderDrafts?.length || reply.dutyDrafts?.length;
        const text = hasDraft ? "Öppna lagets assistent i Förena för att granska förslaget. Inget har sparats eller skickats." : reply.answer;
        return `${item.people.join(", ").slice(0, 160)} – ${team.name.slice(0, 100)}\n${text.length > 950 ? text.slice(0, 900) + "… Läs mer i Förena." : text}`;
      }));
      answer = replies.join("\n\n");
    } else if (!teams.data.length) answer = "Jag hittar inget tillgängligt lag. Öppna Förena och kontrollera din lagkoppling.";
    else if (!selected) {
      const organizations = await supabase.from("organizations").select("id, slug").in("id", [...new Set(teams.data.map(team => team.organization_id))]);
      if (organizations.error || !organizations.data) throw new Error("telegram_assistant_organizations_failed");
      const slugs = new Map(organizations.data.map(organization => [organization.id, organization.slug]));
      if (teams.data.some(team => !slugs.has(team.organization_id))) throw new Error("telegram_assistant_organizations_incomplete");
      answer = "Vilket lag gäller frågan? Skriv lagets namn i din fråga, exempelvis \"När är nästa träning för F2016?\". Lag som finns i Förena:\n" + teams.data.slice(0, 10).map(team => `${team.name} (${slugs.get(team.organization_id)}/${team.slug})`).join("\n") + (teams.data.length > 10 ? "\nFler lag finns i Förena. Ange klubb och lag med /ask klubb/lag om namnet är tvetydigt." : "");
    } else {
      const team = selected;
      const reply = await answerTeamAssistant({ teamId: team.id, question: action.question.trim().slice(0, 500), messages: [] }, { supabase, userId: identity.userId });
      const hasDraft = reply.activityDraft || reply.memoryDrafts?.length || reply.reminderDrafts?.length || reply.dutyDrafts?.length;
      answer = hasDraft
        ? "Det här kräver ett förslag som du granskar i Förena. Öppna lagets assistent och ställ frågan där. Inget har sparats eller skickats."
        : personal.length === 1 ? `${personal[0].people.join(", ").slice(0, 160)} – ${team.name.slice(0, 100)}\n${reply.answer}` : reply.answer;
    }
  } catch (error) {
    answer = error instanceof TeamAssistantError ? error.message : "Assistenten kunde inte svara just nu. Försök igen eller öppna Förena.";
  }
  // Opt-out, blocking, account deletion or rebinding during generation cancels delivery.
  const current = await admin.rpc("telegram_assistant_identity", { sender: action.sender, event_at: action.eventAt });
  if (current.error || current.data !== identity.userId) return null;
  return answer.slice(0, 3900);
}
