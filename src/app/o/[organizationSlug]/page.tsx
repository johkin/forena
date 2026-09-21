import Link from "next/link";

type Props = { params: Promise<{ organizationSlug: string }> };

export default async function OrganizationWorkspacePage({ params }: Props) {
  const { organizationSlug } = await params;
  return (
    <main className="empty-workspace">
      <span className="brand-mark">F</span>
      <p className="eyebrow">Föreningsnivå</p>
      <h1>Föreningsöversikten kommer här</h1>
      <p>Just nu prioriterar vi det kompletta arbetsflödet för laget.</p>
      <Link className="primary" href={`/o/${organizationSlug}/t/f2016`}>Tillbaka till F2016</Link>
    </main>
  );
}
