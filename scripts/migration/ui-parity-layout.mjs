export async function layoutSnapshot(root) {
  return root.evaluate(element => {
    const origin = element.getBoundingClientRect();
    const children = [element, ...element.querySelectorAll('*')];
    const closedPanels = children.filter(child => child instanceof HTMLDetailsElement && !child.open);
    return children.map(child => {
      const collapsed = closedPanels.some(panel => panel !== child && panel.contains(child) &&
        !panel.querySelector(':scope > summary')?.contains(child));
      // Chromium may retain boxes from an earlier layout inside closed details.
      // Compare the disclosure state and styles, then measure its content when opened.
      const rect = collapsed ? { x: 0, y: 0, width: 0, height: 0 } : child.getBoundingClientRect();
      const style = getComputedStyle(child);
      const computed = collapsed ? child.computedStyleMap() : null;
      return {
        tag: child.tagName, collapsed,
        open: child instanceof HTMLDetailsElement ? child.open : null,
        visible: child.checkVisibility({ visibilityProperty: true }),
        x: rect.width || rect.height ? rect.x - origin.x : 0,
        y: rect.width || rect.height ? rect.y - origin.y : 0, width: rect.width, height: rect.height,
        widthRule: computed?.get('width')?.toString() ?? null,
        heightRule: computed?.get('height')?.toString() ?? null,
        display: style.display, padding: style.padding, margin: style.margin, gap: style.gap,
        border: style.border, borderRadius: style.borderRadius,
        fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight,
        lineHeight: style.lineHeight, color: style.color, background: style.backgroundColor,
        // Typed OM retains the computed grid rule when a closed subtree has no used layout yet.
        gridTemplateColumns: collapsed
          ? computed.get('grid-template-columns')?.toString() ?? ''
          : style.gridTemplateColumns,
      };
    });
  });
}
