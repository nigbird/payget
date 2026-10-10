// Edge-safe: imported by middleware, so no server-only dependencies here.

export const DASHBOARD_BUSINESS_VIEW = "dashboard.business.view"
export const DASHBOARD_TECHNICAL_VIEW = "dashboard.technical.view"

/**
 * The /admin overview page opens for DASHBOARD_VIEW or either analytics view.
 * DASHBOARD_VIEW alone shows the page shell (shortcuts, merchant registry)
 * without analytics; each analytics view is granted separately.
 */
export function canOpenDashboard(permissions: readonly string[]): boolean {
  return (
    permissions.includes("DASHBOARD_VIEW") ||
    permissions.includes(DASHBOARD_BUSINESS_VIEW) ||
    permissions.includes(DASHBOARD_TECHNICAL_VIEW)
  )
}
