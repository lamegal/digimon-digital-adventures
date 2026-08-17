const DDA_CORE_UI_CLASS = "dda-core-ui-theme";
const DDA_SIDEBAR_INSET_CLASS = "dda-sidebar-inset";
const DDA_SIDEBAR_EXPANDED_CLASS = "dda-sidebar-expanded";
const DDA_SIDEBAR_COLLAPSED_CLASS = "dda-sidebar-collapsed";

function getSidebarElement() {
  const element = ui?.sidebar?.element;
  if (element instanceof HTMLElement) return element;

  const fallback = document.querySelector("#sidebar");
  return fallback instanceof HTMLElement ? fallback : null;
}

function getSidebarRail(sidebar) {
  if (!(sidebar instanceof HTMLElement)) return null;

  const rail = sidebar.querySelector("#sidebar-tabs, .sidebar-tabs, nav.tabs");
  return rail instanceof HTMLElement ? rail : null;
}

function clearCollapsedRailOffset(sidebar) {
  sidebar?.style?.setProperty("--dda-sidebar-rail-shift-y", "0px");
}

function centerCollapsedRail(sidebar) {
  const rail = getSidebarRail(sidebar);
  if (!rail) return;

  /*
   * Measure the rail in Foundry's own collapsed layout first.  We intentionally
   * do not alter its X coordinate: horizontally the collapsed Sidebar stays in
   * the normal right-hand position, with only the DDA screen gutter applied.
   */
  clearCollapsedRailOffset(sidebar);

  const rect = rail.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const screenGutter = 14;
  const minimumTop = screenGutter;
  const maximumTop = Math.max(
    minimumTop,
    window.innerHeight - rect.height - screenGutter
  );
  const centeredTop = (window.innerHeight - rect.height) / 2;
  const desiredTop = Math.min(
    maximumTop,
    Math.max(minimumTop, centeredTop)
  );

  const shiftY = Math.round(desiredTop - rect.top);
  sidebar.style.setProperty("--dda-sidebar-rail-shift-y", `${shiftY}px`);
}

function applySidebarState(collapsed = !Boolean(ui?.sidebar?.expanded)) {
  document.documentElement?.classList.add(DDA_CORE_UI_CLASS);
  document.body?.classList.add(DDA_CORE_UI_CLASS);

  const sidebar = getSidebarElement();
  if (!sidebar) return;

  sidebar.classList.add(DDA_SIDEBAR_INSET_CLASS);
  sidebar.classList.toggle(DDA_SIDEBAR_COLLAPSED_CLASS, collapsed);
  sidebar.classList.toggle(DDA_SIDEBAR_EXPANDED_CLASS, !collapsed);

  if (!collapsed) {
    /* Expanded positioning remains entirely Foundry-owned. */
    clearCollapsedRailOffset(sidebar);
    return;
  }

  /* Wait for Core to finish applying the collapsed layout, then center only
   * the tab rail vertically.  No width, X position, order, or pointer behavior
   * of the Sidebar application is modified. */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => centerCollapsedRail(sidebar));
  });
}

Hooks.once("ready", () => {
  applySidebarState(!Boolean(ui?.sidebar?.expanded));
});

Hooks.on("renderSidebar", () => {
  requestAnimationFrame(() => {
    applySidebarState(!Boolean(ui?.sidebar?.expanded));
  });
});

/* Public v13 hook: the boolean tells us the final collapsed state directly. */
Hooks.on("collapseSidebar", (_sidebar, collapsed) => {
  applySidebarState(Boolean(collapsed));
});

window.addEventListener("resize", () => {
  requestAnimationFrame(() => {
    applySidebarState(!Boolean(ui?.sidebar?.expanded));
  });
});
