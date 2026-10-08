import { disciplineScopeNames, type DisciplinePackage, type DisciplineScope } from "@/lib/disciplines";

export function DisciplinePackageSummary({ discipline }: { discipline: DisciplinePackage }) {
  return <details className="settings-item discipline-package-summary">
    <summary>{discipline.name} – definition och fält</summary>
    <p>Version {discipline.version}. Disciplinen kopplas till sektionen och används av dess lag.</p>
    {discipline.presentation.groups.map(group=><p key={group.label}><strong>{group.label}:</strong> {group.values.join(", ")}.</p>)}
    <p>{discipline.presentation.description}</p>
    <dl>{(Object.keys(discipline.ui) as DisciplineScope[]).map(scope => {
      const properties = discipline.schemas[scope].properties ?? {};
      return <div key={scope}>
        <dt><strong>{disciplineScopeNames[scope]}</strong></dt>
        <dd>{discipline.ui[scope].fields.map(field => (typeof properties[field] === "object" ? properties[field].title : null) ?? field).join(", ") || "Inga extra fält i den här versionen."}</dd>
      </div>;
    })}</dl>
    <p>Lagets förval finns i aktivitetsinställningarna, medlemsuppgifter i truppen och aktivitetsuppgifter i aktivitetens detaljvy.</p>
  </details>;
}
