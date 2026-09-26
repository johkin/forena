type Props = { label?: string };

export function ProfileButton({ label = "Min profil" }: Props) {
  return (
    <a className="profile-button" href="/profile" aria-label={label} title={label}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5.5 20c.7-4 3-6 6.5-6s5.8 2 6.5 6" />
      </svg>
    </a>
  );
}
