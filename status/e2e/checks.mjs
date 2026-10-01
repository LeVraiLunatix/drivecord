/**
 * Page inspector shared by the Playwright run and by anyone who wants to paste it into a browser console:
 * it only reads the DOM, and returns plain data the test then asserts on.
 */
export function inspectPage() {
  const banner = document.querySelector('[data-testid="global-banner"]');
  const components = {};
  document.querySelectorAll('[data-testid="component"]').forEach((el) => {
    components[el.getAttribute("data-id")] = el.getAttribute("data-status");
  });
  const doc = document.documentElement;
  return {
    banner: banner ? { status: banner.getAttribute("data-status"), text: banner.textContent.trim() } : null,
    components,
    groups: [...document.querySelectorAll('[data-testid="group"]')].map((g) => g.getAttribute("data-id")),
    maintenanceMessage: document.querySelector('[data-testid="maintenance-message"]')?.textContent.trim() ?? null,
    upcomingMaintenance: document.querySelector('[data-testid="upcoming-maintenance"]')?.textContent.trim() ?? null,
    activeIncidents: [...document.querySelectorAll('[data-testid="active-incident"]')].map((e) => e.textContent.trim()),
    historyBuilding: Boolean(document.querySelector('[data-testid="history-building"]')),
    bars: document.querySelectorAll("[data-bar]").length,
    // Horizontal overflow: the document must never be wider than the viewport.
    overflowX: doc.scrollWidth > doc.clientWidth + 1,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    dark: matchMedia("(prefers-color-scheme: dark)").matches,
    bannerColor: banner ? getComputedStyle(banner).borderTopColor : null,
  };
}
