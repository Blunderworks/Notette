import type { Project, Session, User } from '$lib/server/db/schema';

declare global {
	namespace App {
		interface Locals {
			/**
			 * Authenticated user of any role (dashboard cookie session or widget bearer
			 * session). Check `isAdminRole(user.role)` before allowing admin actions.
			 */
			user: User | null;
			session: Session | null;
			/** Set for requests under /api/widget/[key]/ once the project and origin are validated. */
			widget: {
				project: Project;
				origin: string;
			} | null;
		}
		interface Error {
			message: string;
			code?: string;
		}
	}
}

export {};
