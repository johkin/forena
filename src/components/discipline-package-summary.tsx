import { disciplineScopeNames, type DisciplinePackage, type DisciplineScope } from "@/lib/disciplines";

export function DisciplinePackageSummary({ discipline }: { discipline: DisciplinePackage }) {
  return <details className="settings-item discipline-package-summary">
    <summary>{discipline.name} – spelformer och fält</summary>
    <p>Version {discipline.version}. Disciplinen kopplas till sektionen och används av dess lag.</p>
    <p><strong>Spelformer:</strong> {discipline.gameFormats.map(format => format.name).join(", ")}.</p>
    <p><strong>Positioner:</strong> {discipline.positions.map(position => position.name).join(", ")}.</p>
    <p>Spelformen anger antal spelare på planen. Önskad matchtrupp väljs separat. Inga åldersregler eller matchtider väljs automatiskt.</p>
    <dl>{(Object.keys(discipline.ui) as DisciplineScope[]).map(scope => {
      const properties = discipline.schemas[scope].properties ?? {};
      return <div key={scope}>
        <dt><strong>{disciplineScopeNames[scope]}</strong></dt>
        <dd>{discipline.ui[scope].fields.map(field => (typeof properties[field] === "object" ? properties[field].title : null) ?? field).join(", ") || "Inga extra fält i den här versionen."}</dd>
      </div>;
    })}</dl>
    <p>Lagets matchförval finns i aktivitetsinställningarna, spelaruppgifter i truppen och matchuppgifter i matchens detaljvy.</p>
  </details>;
}
