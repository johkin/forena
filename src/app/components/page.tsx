import { AppHeader } from "@/components/app-header";
import { ComponentGallery } from "@/components/component-gallery";

export default function ComponentsPage() {
  return <>
    <AppHeader />
    <main className="content component-gallery">
      <h1>Komponenter</h1>
      <p>Gemensamma element i Förena. Prova knappar, fält och aktivitetsdialoger med exempeldata.</p>
      <ComponentGallery />
    </main>
  </>;
}
