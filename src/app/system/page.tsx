import Link from "next/link";

export default function SystemPage() {
  return <main className="application-page"><div className="application-card"><p className="eyebrow">Förena · System</p><h1>Systemadministration</h1><p>Hantera plattformsgemensam konfiguration. Klubbarnas egen administration ligger kvar i respektive förening.</p><div className="system-admin-grid"><Link href="/system/administrators"><strong>Administratörer</strong><span>Bjud in och se plattformens systemadministratörer.</span></Link><Link href="/system/disciplines"><strong>Discipliner</strong><span>Fotboll, innebandy, teater och andra verksamhetsdomäner.</span></Link><Link href="/system/memories"><strong>Assistentminnen</strong><span>Generella och disciplinspecifika minnen som gäller hela Förena.</span></Link></div></div></main>;
}
