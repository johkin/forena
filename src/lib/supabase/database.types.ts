// Generated with `npm run db:types` once the local stack is running.
// This checked-in shape keeps application code typed before the first generation.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert = Partial<Row>, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type Timestamped = { created_at: string };
type OrganizationScoped = { organization_id: string };

export interface Database {
  public: {
    Tables: {
      organizations: Table<
        Timestamped & { id: string; slug: string; name: string; assistant_name: string; time_zone: string; discipline_id: string | null; created_by: string | null; updated_at: string },
        { id?: string; slug: string; name: string; assistant_name?: string; time_zone?: string; discipline_id?: string | null; created_by?: string | null; created_at?: string; updated_at?: string }
      >;
      profiles: Table<
        Timestamped & { id: string; display_name: string; updated_at: string },
        { id: string; display_name: string; created_at?: string; updated_at?: string }
      >;
      organization_members: Table<
        Timestamped & OrganizationScoped & { user_id: string; role: "owner" | "admin" | "leader" | "member" },
        OrganizationScoped & { user_id: string; role: "owner" | "admin" | "leader" | "member"; created_at?: string }
      >;
      sections: Table<
        Timestamped & OrganizationScoped & { id: string; slug: string; name: string; discipline_id: string | null; updated_at: string },
        OrganizationScoped & { id?: string; slug: string; name: string; discipline_id?: string | null; created_at?: string; updated_at?: string }
      >;
      teams: Table<
        Timestamped & OrganizationScoped & { id: string; section_id: string; slug: string; name: string; season: string; discipline_id: string | null; updated_at: string },
        OrganizationScoped & { id?: string; section_id: string; slug: string; name: string; season?: string; discipline_id?: string | null; created_at?: string; updated_at?: string }
      >;
      section_staff: Table<
        Timestamped & OrganizationScoped & { section_id: string; user_id: string; role: "section_admin" | "editor" },
        OrganizationScoped & { section_id: string; user_id: string; role: "section_admin" | "editor"; created_at?: string }
      >;
      team_permissions: Table<
        Timestamped & { key: string; description: string },
        { key: string; description: string; created_at?: string }
      >;
      team_access_profiles: Table<
        Timestamped & OrganizationScoped & { id: string; key: string; name: string; updated_at: string },
        OrganizationScoped & { id?: string; key: string; name: string; created_at?: string; updated_at?: string }
      >;
      team_access_profile_permissions: Table<
        Timestamped & OrganizationScoped & { access_profile_id: string; permission_key: string },
        OrganizationScoped & { access_profile_id: string; permission_key: string; created_at?: string }
      >;
      team_access_assignments: Table<
        Timestamped & OrganizationScoped & { id: string; team_id: string; person_id: string; access_profile_id: string; starts_on: string; ends_on: string | null },
        OrganizationScoped & { id?: string; team_id: string; person_id: string; access_profile_id: string; starts_on?: string; ends_on?: string | null; created_at?: string }
      >;
      platform_roles: Table<
        Timestamped & { user_id: string; role: "system_admin" },
        { user_id: string; role: "system_admin"; created_at?: string }
      >;
      platform_admin_invites: Table<
        Timestamped & {
          id: string;
          email: string;
          token_hash: string;
          status: "pending" | "accepted" | "expired" | "failed" | "cancelled";
          source: "bootstrap" | "system_admin";
          invited_by: string | null;
          sent_at: string | null;
          expires_at: string;
          accepted_at: string | null;
          accepted_by: string | null;
        },
        {
          id?: string;
          email: string;
          token_hash: string;
          status?: "pending" | "accepted" | "expired" | "failed" | "cancelled";
          source?: "bootstrap" | "system_admin";
          invited_by?: string | null;
          sent_at?: string | null;
          expires_at?: string;
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
        }
      >;
      disciplines: Table<
        Timestamped & { id: string; key: string; name: string; category: string | null; updated_at: string },
        { id?: string; key: string; name: string; category?: string | null; created_at?: string; updated_at?: string }
      >;
      assistant_memories: Table<
        Timestamped & {
          id: string;
          organization_id: string | null;
          discipline_id: string | null;
          scope: "system" | "organization" | "section" | "team" | "personal";
          scope_id: string | null;
          kind: "fact" | "preference" | "instruction" | "convention";
          subject: string;
          memory_key: string | null;
          content: string;
          structured_value: Json | null;
          created_by: string | null;
          updated_at: string;
          expires_at: string | null;
        },
        {
          id?: string;
          organization_id?: string | null;
          discipline_id?: string | null;
          scope: "system" | "organization" | "section" | "team" | "personal";
          scope_id?: string | null;
          kind?: "fact" | "preference" | "instruction" | "convention";
          subject?: string;
          memory_key?: string | null;
          content: string;
          structured_value?: Json | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          expires_at?: string | null;
        }
      >;
      team_member_invitations: Table<
        Timestamped & OrganizationScoped & { id: string; team_id: string; email: string; role: "leader" | "guardian"; person_display_name: string | null; token_hash: string; invited_by: string; expires_at: string; accepted_at: string | null; accepted_by: string | null },
        OrganizationScoped & { id?: string; team_id: string; email: string; role: "leader" | "guardian"; person_display_name?: string | null; token_hash: string; invited_by: string; expires_at?: string; accepted_at?: string | null; accepted_by?: string | null; created_at?: string }
      >;
      membership_applications: Table<
        Timestamped & OrganizationScoped & { id: string; section_id: string; team_id: string; player_first_name: string; player_last_name: string; player_birth_date: string; address: string; postal_code: string; city: string; allergies: string; message: string; previous_club: string; photo_consent: boolean | null; review_status: "draft" | "submitted" | "approved" | "rejected"; activation_status: "not_started" | "invitation_sent" | "email_verified" | "activated"; reviewed_by: string | null; reviewed_at: string | null; rejection_reason: string | null; activated_person_id: string | null; updated_at: string },
        OrganizationScoped & { id?: string; section_id: string; team_id: string; player_first_name: string; player_last_name: string; player_birth_date: string; address?: string; postal_code?: string; city?: string; allergies?: string; message?: string; previous_club?: string; photo_consent?: boolean | null; review_status?: "draft" | "submitted" | "approved" | "rejected"; activation_status?: "not_started" | "invitation_sent" | "email_verified" | "activated"; reviewed_by?: string | null; reviewed_at?: string | null; rejection_reason?: string | null; activated_person_id?: string | null; created_at?: string; updated_at?: string }
      >;
      membership_application_guardians: Table<
        Timestamped & OrganizationScoped & { id: string; application_id: string; position: 1 | 2; first_name: string; last_name: string; email: string; mobile: string },
        OrganizationScoped & { id?: string; application_id: string; position: 1 | 2; first_name: string; last_name: string; email: string; mobile?: string; created_at?: string }
      >;
      membership_application_tokens: Table<
        Timestamped & OrganizationScoped & { id: string; application_id: string; guardian_id: string; token_hash: string; expires_at: string; accepted_at: string | null; accepted_by: string | null },
        OrganizationScoped & { id?: string; application_id: string; guardian_id: string; token_hash: string; expires_at?: string; accepted_at?: string | null; accepted_by?: string | null; created_at?: string }
      >;
      people: Table<
        Timestamped & OrganizationScoped & { id: string; user_id: string | null; display_name: string; updated_at: string },
        OrganizationScoped & { id?: string; user_id?: string | null; display_name: string; created_at?: string; updated_at?: string }
      >;
      person_login_emails: Table<
        Timestamped & OrganizationScoped & { person_id: string; email: string; updated_at: string },
        OrganizationScoped & { person_id: string; email: string; created_at?: string; updated_at?: string }
      >;
      person_guardians: Table<
        Timestamped & OrganizationScoped & { person_id: string; guardian_user_id: string; contact_name: string | null; contact_phone: string | null },
        OrganizationScoped & { person_id: string; guardian_user_id: string; contact_name?: string | null; contact_phone?: string | null; created_at?: string }
      >;
      memberships: Table<
        Timestamped & OrganizationScoped & { id: string; person_id: string; team_id: string | null; role: "participant" | "leader"; leader_title: string | null; is_primary_contact: boolean; starts_on: string; ends_on: string | null },
        OrganizationScoped & { id?: string; person_id: string; team_id?: string | null; role: "participant" | "leader"; leader_title?: string | null; is_primary_contact?: boolean; starts_on?: string; ends_on?: string | null; created_at?: string }
      >;
      team_groups: Table<
        Timestamped & OrganizationScoped & { id: string; team_id: string; name: string; updated_at: string },
        OrganizationScoped & { id?: string; team_id: string; name: string; created_at?: string; updated_at?: string }
      >;
      team_group_members: Table<
        Timestamped & OrganizationScoped & { group_id: string; person_id: string },
        OrganizationScoped & { group_id: string; person_id: string; created_at?: string }
      >;
      activities: Table<
        Timestamped & OrganizationScoped & { id: string; team_id: string | null; activity_type_id: string; series_id: string | null; title: string; description_markdown: string; reminder_send_ats: string[] | null; gathering_at: string | null; starts_at: string; ends_at: string; location: string; status: "draft" | "published" | "cancelled"; cancelled_at: string | null; cancellation_reason: string | null; invitation_send_at: string | null; response_due_at: string | null; reminder_send_at: string | null; invitation_audience_kind: "players" | "leaders" | "group" | "selection" | null; invitation_group_id: string | null; invitation_audience_roles: string[]; invitation_audience_group_ids: string[]; invitation_audience_responsibility_type_ids: string[]; invitation_materialized_at: string | null; source_kind: "manual" | "imported"; external_source: string | null; external_id: string | null; created_by: string | null; updated_at: string },
        OrganizationScoped & { id?: string; team_id?: string | null; activity_type_id: string; series_id?: string | null; title: string; description_markdown?: string; reminder_send_ats?: string[] | null; gathering_at?: string | null; starts_at: string; ends_at: string; location?: string; status?: "draft" | "published" | "cancelled"; cancelled_at?: string | null; cancellation_reason?: string | null; invitation_send_at?: string | null; response_due_at?: string | null; reminder_send_at?: string | null; invitation_audience_kind?: "players" | "leaders" | "group" | "selection" | null; invitation_group_id?: string | null; invitation_audience_roles?: string[]; invitation_audience_group_ids?: string[]; invitation_audience_responsibility_type_ids?: string[]; invitation_materialized_at?: string | null; source_kind?: "manual" | "imported"; external_source?: string | null; external_id?: string | null; created_by?: string | null; created_at?: string; updated_at?: string }
      >;
      activity_types: Table<
        Timestamped & { id: string; organization_id: string | null; discipline_id: string | null; name: string; slug: string; system_category: "session" | "competition" | "work" | "meeting" | "education" | "other"; color: string | null; icon: string | null; active: boolean; updated_at: string },
        { id?: string; organization_id?: string | null; discipline_id?: string | null; name: string; slug: string; system_category: "session" | "competition" | "work" | "meeting" | "education" | "other"; color?: string | null; icon?: string | null; active?: boolean }
      >;
      activity_defaults: Table<
        { id: string; activity_type_id: string; scope: "system" | "organization" | "section" | "team"; organization_id: string | null; scope_id: string | null; revision: number; rule_version: number; values: Json; updated_at: string }
      >;
      activity_series: Table<
        Timestamped & OrganizationScoped & { id: string; team_id: string; activity_type_id: string; title: string; location: string; recurrence_rule: Json; starts_on: string; ends_on: string | null; status: "draft" | "published" | "ended" | "cancelled"; created_by: string | null; updated_at: string },
        OrganizationScoped & { id?: string; team_id: string; activity_type_id: string; title: string; location?: string; recurrence_rule: Json; starts_on: string; ends_on?: string | null; status?: "draft" | "published" | "ended" | "cancelled"; created_by?: string | null; created_at?: string; updated_at?: string }
      >;
      invitations: Table<
        Timestamped & OrganizationScoped & { id: string; activity_id: string; person_id: string; response: "pending" | "accepted" | "declined"; responded_at: string | null; response_comment: string | null },
        OrganizationScoped & { id?: string; activity_id: string; person_id: string; response?: "pending" | "accepted" | "declined"; responded_at?: string | null; response_comment?: string | null; created_at?: string }
      >;
      activity_reminder_schedules: Table<
        Timestamped & OrganizationScoped & { id: string; activity_id: string; send_at: string; materialized_at: string | null; created_by: string | null },
        OrganizationScoped & { id?: string; activity_id: string; send_at: string; materialized_at?: string | null; created_by?: string | null; created_at?: string }
      >;
      activity_attendance_reports: Table<
        Timestamped & OrganizationScoped & { id: string; activity_id: string; reported_by: string; reported_at: string; updated_at: string },
        OrganizationScoped & { id?: string; activity_id: string; reported_by: string; reported_at?: string; updated_at?: string; created_at?: string }
      >;
      activity_attendance_records: Table<
        Timestamped & OrganizationScoped & { report_id: string; person_id: string },
        OrganizationScoped & { report_id: string; person_id: string; created_at?: string }
      >;
      activity_events: Table<
        Timestamped & OrganizationScoped & {
          id: string;
          activity_id: string;
          invitation_id: string | null;
          event_type: "invitation_scheduled" | "invitation_queued" | "invitation_sent" | "invitation_delivery_failed" | "reminder_scheduled" | "reminder_sent" | "invitation_response_changed" | "activity_updated" | "activity_cancelled";
          channel: "push" | "email" | "sms" | "in_app" | null;
          recipient_count: number | null;
          metadata: Json;
          created_by: string | null;
        },
        OrganizationScoped & {
          id?: string;
          activity_id: string;
          invitation_id?: string | null;
          event_type: "invitation_scheduled" | "invitation_queued" | "invitation_sent" | "invitation_delivery_failed" | "reminder_scheduled" | "reminder_sent" | "invitation_response_changed" | "activity_updated" | "activity_cancelled";
          channel?: "push" | "email" | "sms" | "in_app" | null;
          recipient_count?: number | null;
          metadata?: Json;
          created_by?: string | null;
          created_at?: string;
        }
      >;
      team_tasks: Table<
        Timestamped & OrganizationScoped & { id: string; team_id: string; title: string; description: string; due_at: string; status: "open" | "completed"; created_by: string | null; completed_by: string | null; completed_at: string | null; updated_at: string },
        OrganizationScoped & { id?: string; team_id: string; title: string; description?: string; due_at: string; status?: "open" | "completed"; created_by?: string | null; completed_by?: string | null; completed_at?: string | null; created_at?: string; updated_at?: string }
      >;
      contextual_documents: Table<
        Timestamped & OrganizationScoped & { id: string; title: string; summary: string; content_markdown: string; audience: string[]; created_by: string | null; updated_at: string },
        OrganizationScoped & { id?: string; title: string; summary: string; content_markdown?: string; audience?: string[]; created_by?: string | null; created_at?: string; updated_at?: string }
      >;
      contextual_document_secrets: Table<
        OrganizationScoped & { document_id: string; values: Json; updated_at: string },
        OrganizationScoped & { document_id: string; values?: Json; updated_at?: string }
      >;
      activity_type_documents: Table<
        Timestamped & OrganizationScoped & { activity_type_id: string; document_id: string; visible_from_offset: string; visible_until_offset: string },
        OrganizationScoped & { activity_type_id: string; document_id: string; visible_from_offset?: string; visible_until_offset?: string; created_at?: string }
      >;
      responsibility_types: Table<
        Timestamped & OrganizationScoped & { id: string; name: string; slug: string; updated_at: string },
        OrganizationScoped & { id?: string; name: string; slug: string; created_at?: string; updated_at?: string }
      >;
      team_responsibilities: Table<
        Timestamped & OrganizationScoped & { id: string; team_id: string; person_id: string; responsibility_type_id: string; starts_on: string; ends_on: string | null },
        OrganizationScoped & { id?: string; team_id: string; person_id: string; responsibility_type_id: string; starts_on?: string; ends_on?: string | null; created_at?: string }
      >;
      ai_generation_runs: Table<
        Timestamped & OrganizationScoped & { id: string; team_id: string; requested_by: string | null; feature: "team_briefing"; model: string; status: "success" | "fallback"; input_tokens: number | null; output_tokens: number | null; latency_ms: number; signal_count: number; error_code: string | null },
        OrganizationScoped & { id?: string; team_id: string; requested_by?: string | null; feature: "team_briefing"; model: string; status: "success" | "fallback"; input_tokens?: number; output_tokens?: number; latency_ms: number; signal_count: number; error_code?: string | null; created_at?: string }
      >;
      ai_team_briefing_cache: Table<
        OrganizationScoped & { team_id: string; signal_hash: string; briefing: Json; model: string; input_tokens: number | null; output_tokens: number | null; generated_at: string; expires_at: string },
        OrganizationScoped & { team_id: string; signal_hash: string; briefing: Json; model: string; input_tokens?: number | null; output_tokens?: number | null; generated_at?: string; expires_at: string }
      >;
      push_subscriptions: Table<
        Timestamped & { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; user_agent: string | null; last_used_at: string | null; disabled_at: string | null },
        { id?: string; user_id: string; endpoint: string; p256dh: string; auth: string; user_agent?: string | null; created_at?: string; last_used_at?: string | null; disabled_at?: string | null }
      >;
      notification_outbox: Table<
        Timestamped & OrganizationScoped & { id: string; user_id: string; type: string; payload: Json; scheduled_at: string; sent_at: string | null; status: "pending" | "processing" | "sent" | "failed" | "cancelled"; attempts: number; last_error: string | null },
        OrganizationScoped & { id?: string; user_id: string; type: string; payload?: Json; scheduled_at?: string; sent_at?: string | null; status?: "pending" | "processing" | "sent" | "failed" | "cancelled"; attempts?: number; last_error?: string | null; created_at?: string }
      >;
      notification_deliveries: Table<
        Timestamped & OrganizationScoped & { id: string; outbox_id: string; user_id: string; channel: "email" | "push"; status: "pending" | "sent" | "failed" | "skipped"; provider: string | null; provider_message_id: string | null; attempts: number; last_error: string | null; attempted_at: string | null; sent_at: string | null },
        OrganizationScoped & { id?: string; outbox_id: string; user_id: string; channel: "email" | "push"; status?: "pending" | "sent" | "failed" | "skipped"; provider?: string | null; provider_message_id?: string | null; attempts?: number; last_error?: string | null; attempted_at?: string | null; sent_at?: string | null; created_at?: string }
      >;
      audit_log: Table<
        Timestamped & OrganizationScoped & { id: number; actor_user_id: string | null; action: string; entity_type: string; entity_id: string; details: Json },
        OrganizationScoped & { actor_user_id?: string | null; action: string; entity_type: string; entity_id: string; details?: Json; created_at?: string }
      >;
    };
    Views: Record<never, never>;
    Functions: {
      set_activity_discipline: { Args: { target_scope: string; target_organization_id: string; target_scope_id: string; target_discipline_id: string | null }; Returns: undefined };

      can_manage_activity_defaults: { Args: { target_scope: string; target_organization_id: string | null; target_scope_id: string | null }; Returns: boolean };
      save_activity_defaults: { Args: { target_type_id: string; target_scope: string; target_organization_id: string | null; target_scope_id: string | null; expected_revision: number; patch: Json }; Returns: string };

      is_organization_member: { Args: { target_organization_id: string; target_user_id?: string }; Returns: boolean };
      has_organization_role: { Args: { target_organization_id: string; allowed_roles: string[]; target_user_id?: string }; Returns: boolean };
      has_platform_role: { Args: { allowed_roles: string[]; target_user_id?: string }; Returns: boolean };
      claim_platform_admin_invite: { Args: { invitation_token_hash: string }; Returns: boolean };
      upsert_assistant_memory: { Args: { target_organization_id: string; target_discipline_id: string | null; target_scope: string; target_scope_id: string; target_kind: string; target_subject: string; target_memory_key: string; target_content: string }; Returns: string };
      list_platform_admins: { Args: Record<never, never>; Returns: { user_id: string; email: string | null; created_at: string }[] };
      has_section_role: { Args: { target_section_id: string; allowed_roles: string[]; target_user_id?: string }; Returns: boolean };
      has_team_permission: { Args: { target_team_id: string; target_permission: string }; Returns: boolean };
      delete_or_cancel_activity: { Args: { target_activity_id: string; target_cancellation_reason?: string | null }; Returns: "deleted" | "cancelled" };
      can_manage_team: { Args: { target_team_id: string; target_user_id?: string }; Returns: boolean };
      assign_existing_guardian_team_access: { Args: { target_organization_id: string; target_team_id: string; target_user_id: string; target_responsibility_slug: string; target_access_profile_key: string }; Returns: undefined };
      get_team_briefing_context: { Args: { target_team_id: string }; Returns: Json };
      accept_team_member_invitation: { Args: { invitation_token_hash: string }; Returns: { organization_slug: string; team_slug: string; invitation_role: string }[] };
      get_join_options: { Args: { requested_organization_slug: string }; Returns: { organization_id: string; organization_name: string; organization_slug: string; section_id: string; section_name: string; section_slug: string; team_id: string; team_name: string; team_slug: string }[] };
      submit_membership_application: { Args: { payload: Json }; Returns: string };
      accept_membership_application_invitation: { Args: { invitation_token_hash: string }; Returns: { organization_slug: string; team_slug: string }[] };
      claim_person_account: { Args: Record<never, never>; Returns: number };
      queue_activity_reminder: { Args: { target_activity_id: string }; Returns: number };
      queue_activity_invitation: { Args: { target_activity_id: string; target_person_ids: string[] }; Returns: number };
      materialize_due_activity_invitations: { Args: { batch_size?: number }; Returns: number };
      queue_due_activity_invitations: { Args: { batch_size?: number }; Returns: number };
      claim_notification_outbox: { Args: { batch_size?: number }; Returns: Database["public"]["Tables"]["notification_outbox"]["Row"][] };
      get_activity_delivery_status: { Args: { target_activity_id: string }; Returns: Json };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
