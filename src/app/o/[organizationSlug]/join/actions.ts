"use server";

import { redirect } from "next/navigation";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

export async function submitMembershipApplication(formData: FormData) {
  const organizationSlug = value(formData, "organizationSlug");
  const guardianTwoEmail = value(formData, "guardian2Email");
  const guardians = [
    {
      first_name: value(formData, "guardian1FirstName"),
      last_name: value(formData, "guardian1LastName"),
      email: value(formData, "guardian1Email").toLowerCase(),
      mobile: value(formData, "guardian1Mobile"),
    },
    ...(guardianTwoEmail
      ? [{
          first_name: value(formData, "guardian2FirstName"),
          last_name: value(formData, "guardian2LastName"),
          email: guardianTwoEmail.toLowerCase(),
          mobile: value(formData, "guardian2Mobile"),
        }]
      : []),
  ];

  const payload = {
    organization_id: value(formData, "organizationId"),
    section_id: value(formData, "sectionId"),
    team_id: value(formData, "teamId"),
    player_first_name: value(formData, "playerFirstName"),
    player_last_name: value(formData, "playerLastName"),
    player_birth_date: value(formData, "playerBirthDate"),
    address: value(formData, "address"),
    postal_code: value(formData, "postalCode"),
    city: value(formData, "city"),
    allergies: value(formData, "allergies"),
    message: value(formData, "message"),
    previous_club: value(formData, "previousClub"),
    photo_consent: value(formData, "photoConsent") ? value(formData, "photoConsent") === "yes" : null,
    guardians,
  } satisfies Json;

  if (!organizationSlug || !payload.player_first_name || !payload.player_last_name || !payload.player_birth_date || !guardians[0].email) {
    redirect(`/o/${organizationSlug}/join?error=${encodeURIComponent("Fyll i alla obligatoriska uppgifter")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_membership_application", { payload });
  if (error) {
    console.error("[membership-application] submit failed", { message: error.message });
    redirect(`/o/${organizationSlug}/join?error=${encodeURIComponent("Ansökan kunde inte skickas. Kontrollera uppgifterna")}`);
  }
  redirect(`/o/${organizationSlug}/join?sent=1`);
}
