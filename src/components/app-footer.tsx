/** Rendered once by the root layout, including nested administration pages. */
export function AppFooter({ showConnect = true }: { showConnect?: boolean }) {
  return <footer className="app-footer" aria-label="Sidfot">
    <span>Förena · Den öppna plattformen för föreningslivet</span>
    <nav aria-label="Sidfotslänkar">{showConnect ? <a href="/connect">Anslut AI</a> : null}<a href="https://github.com/johkin/forena">Källkod</a></nav>
  </footer>;
}
