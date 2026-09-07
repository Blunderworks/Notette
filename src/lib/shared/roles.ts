/**
 * User roles shared between the server, the dashboard and the widget. This
 * file must stay free of server-only imports.
 *
 * - owner:  everything, including user management
 * - admin:  manage projects and triage feedback (dashboard + widget)
 * - member: sign in to the widget on projects they belong to; no dashboard
 *           access beyond their account page
 */
export type UserRole = 'owner' | 'admin' | 'member';

export const USER_ROLES: readonly UserRole[] = ['owner', 'admin', 'member'];

export function isUserRole(value: unknown): value is UserRole {
	return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

/** Owners and admins have full access to every project. */
export function isAdminRole(role: UserRole | null | undefined): boolean {
	return role === 'owner' || role === 'admin';
}
