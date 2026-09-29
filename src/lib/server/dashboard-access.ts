import type { User } from '$lib/server/db/schema';
import { isAdminRole } from '$lib/shared/roles';

/** `(app)` routes a member (non-admin) account may use; every other dashboard route is admin-only. */
const MEMBER_ROUTES = new Set(['/(app)', '/(app)/settings/account']);

export type DashboardAccess = 'allowed' | 'sign_in' | 'forbidden';

/**
 * Sign-in and role rule for dashboard routes, keyed by SvelteKit route id.
 * Routes outside the `(app)` group (auth pages, widget API, popup) are not
 * covered here. Enforced by the `(app)` layout for page views and by
 * `hooks.server.ts` for form actions, which run without layout loads.
 */
export function dashboardAccess(routeId: string | null, user: User | null): DashboardAccess {
	if (routeId !== '/(app)' && !routeId?.startsWith('/(app)/')) return 'allowed';
	if (!user) return 'sign_in';
	if (isAdminRole(user.role) || MEMBER_ROUTES.has(routeId)) return 'allowed';
	return 'forbidden';
}
