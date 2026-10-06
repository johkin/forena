import { resendVerificationEmail } from "@/app/o/[organizationSlug]/join/actions";

export function MembershipVerificationResendForm({ organizationSlug, applicationId }: {
  organizationSlug: string; applicationId: string;
}) {
  return <form action={resendVerificationEmail} className="auth-form">
    <input type="hidden" name="organizationSlug" value={organizationSlug} />
    <input type="hidden" name="applicationId" value={applicationId} />
    <label>E-postadress för målsman 1<input type="email" name="email" required maxLength={254} autoComplete="email" /></label>
    <button className="secondary" type="submit">Skicka ny verifieringslänk</button>
  </form>;
}
