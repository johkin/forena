"use server";

import { redirect } from "next/navigation";
import type { Json } from "@/lib/supabase/database.types";
import { startMembershipApplication, resendMembershipVerification } from "@/lib/membership/verification";
import { createClient } from "@/lib/supabase/server";
import { isoDateSchema } from "@/lib/iso-date";

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
  if (!isoDateSchema.safeParse(payload.player_birth_date).success || payload.player_birth_date > new Date().toISOString().slice(0, 10)) {
    redirect(`/o/${encodeURIComponent(organizationSlug)}/join?error=${encodeURIComponent("Ange ett giltigt födelsedatum i formatet ÅÅÅÅ-MM-DD. Datumet får inte ligga i framtiden.")}`);
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  let result;
  try {
    result = await startMembershipApplication(payload, guardians[0].email, authData.user?.id);
  } catch {
    redirect(`/o/${encodeURIComponent(organizationSlug)}/join?error=${encodeURIComponent("Ansökan kunde inte sparas. Kontrollera uppgifterna eller vänta en minut och försök igen.")}`);
  }
  redirect(`/o/${encodeURIComponent(organizationSlug)}/join?sent=${result.email_verified ? "1" : "verify"}&application=${result.application_id}${result.delivery_failed ? "&deliveryFailed=1" : ""}`);
}

export async function resendVerificationEmail(formData: FormData) {
  const organizationSlug = value(formData, "organizationSlug");
  const applicationId = value(formData, "applicationId");
  try {
    await resendMembershipVerification(applicationId, value(formData, "email").toLowerCase());
  } catch {
    console.error("[membership-verification] resend failed");
  }
  // Same response for unknown applications/addresses, throttling and delivery failures.
  redirect(`/o/${encodeURIComponent(organizationSlug)}/join?sent=verify&application=${encodeURIComponent(applicationId)}&resent=1`);
}
