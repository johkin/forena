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
        Timestamped & { id: string; slug: string; name: string; assistant_name: string; created_by: string | null; updated_at: string },
        { id?: string; slug: string; name: string; assistant_name?: string; created_by?: string | null; created_at?: string; updated_at?: string }
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
        Timestamped & OrganizationScoped & { id: string; slug: string; name: string; updated_at: string },
        OrganizationScoped & { id?: string; slug: string; name: string; created_at?: string; updated_at?: string }
      >;
      teams: Table<
        Timestamped & OrganizationScoped & { id: string; section_id: string; slug: string; name: string; season: string; updated_at: string },
        OrganizationScoped & { id?: string; section_id: string; slug: string; name: string; season?: string; created_at?: string; updated_at?: string }
      >;
      section_staff: Table<
        Timestamped & OrganizationScoped & { section_id: string; user_id: string; role: "section_admin" | "editor" },
        OrganizationScoped & { section_id: string; user_id: string; role: "section_admin" | "editor"; created_at?: string }
      >;
      team_staff: Table<
        Timestamped & OrganizationScoped & { team_id: string; user_id: string; role: "team_manager" | "coach" | "editor" },
        OrganizationScoped & { team_id: string; user_id: string; role: "team_manager" | "coach" | "editor"; created_at?: string }
      >;
      people: Table<
        Timestamped & OrganizationScoped & { id: string; user_id: string | null; display_name: string; updated_at: string },
        OrganizationScoped & { id?: string; user_id?: string | null; display_name: string; created_at?: string; updated_at?: string }
      >;
      person_guardians: Table<
        Timestamped & OrganizationScoped & { person_id: string; guardian_user_id: string; contact_name: string | null; contact_phone: string | null },
        OrganizationScoped & { person_id: string; guardian_user_id: string; contact_name?: string | null; contact_phone?: string | null; created_at?: string }
      >;
      memberships: Table<
        Timestamped & OrganizationScoped & { id: string; person_id: string; team_id: string | null; role: "participant" | "leader" | "volunteer"; starts_on: string; ends_on: string | null },
        OrganizationScoped & { id?: string; person_id: string; team_id?: string | null; role: "participant" | "leader" | "volunteer"; starts_on?: string; ends_on?: string | null; created_at?: string }
      >;
      activities: Table<
        Timestamped & OrganizationScoped & { id: string; team_id: string | null; title: string; starts_at: string; ends_at: string; location: string; created_by: string | null; updated_at: string },
        OrganizationScoped & { id?: string; team_id?: string | null; title: string; starts_at: string; ends_at: string; location?: string; created_by?: string | null; created_at?: string; updated_at?: string }
      >;
      invitations: Table<
        Timestamped & OrganizationScoped & { id: string; activity_id: string; person_id: string; response: "pending" | "accepted" | "declined" | "maybe"; responded_at: string | null },
        OrganizationScoped & { id?: string; activity_id: string; person_id: string; response?: "pending" | "accepted" | "declined" | "maybe"; responded_at?: string | null; created_at?: string }
      >;
      team_tasks: Table<
        Timestamped & OrganizationScoped & { id: string; team_id: string; title: string; description: string; due_at: string; status: "open" | "completed"; created_by: string | null; completed_by: string | null; completed_at: string | null; updated_at: string },
        OrganizationScoped & { id?: string; team_id: string; title: string; description?: string; due_at: string; status?: "open" | "completed"; created_by?: string | null; completed_by?: string | null; completed_at?: string | null; created_at?: string; updated_at?: string }
      >;
      push_subscriptions: Table<
        Timestamped & OrganizationScoped & { id: string; user_id: string; endpoint: string; p256dh_key: string; auth_key: string; device_name: string | null; last_used_at: string | null; disabled_at: string | null },
        OrganizationScoped & { id?: string; user_id: string; endpoint: string; p256dh_key: string; auth_key: string; device_name?: string | null; created_at?: string; last_used_at?: string | null; disabled_at?: string | null }
      >;
      notification_outbox: Table<
        Timestamped & OrganizationScoped & { id: string; user_id: string; type: string; payload: Json; scheduled_at: string; sent_at: string | null; status: "pending" | "processing" | "sent" | "failed" | "cancelled"; attempts: number; last_error: string | null },
        OrganizationScoped & { id?: string; user_id: string; type: string; payload?: Json; scheduled_at?: string; sent_at?: string | null; status?: "pending" | "processing" | "sent" | "failed" | "cancelled"; attempts?: number; last_error?: string | null; created_at?: string }
      >;
      audit_log: Table<
        Timestamped & OrganizationScoped & { id: number; actor_user_id: string | null; action: string; entity_type: string; entity_id: string; details: Json },
        OrganizationScoped & { actor_user_id?: string | null; action: string; entity_type: string; entity_id: string; details?: Json; created_at?: string }
      >;
    };
    Views: Record<never, never>;
    Functions: {
      is_organization_member: { Args: { target_organization_id: string; target_user_id?: string }; Returns: boolean };
      has_organization_role: { Args: { target_organization_id: string; allowed_roles: string[]; target_user_id?: string }; Returns: boolean };
      has_section_role: { Args: { target_section_id: string; allowed_roles: string[]; target_user_id?: string }; Returns: boolean };
      has_team_role: { Args: { target_team_id: string; allowed_roles: string[]; target_user_id?: string }; Returns: boolean };
      can_manage_team: { Args: { target_team_id: string; target_user_id?: string }; Returns: boolean };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
