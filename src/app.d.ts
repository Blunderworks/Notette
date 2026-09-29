import type { Project, Session, User } from '$lib/server/db/schema';
import type { VerifiedIdentity } from '$lib/server/identity';

declare global {
	namespace App {
		interface Locals {
			/**
			 * Authenticated user of any role (dashboard cookie session or widget bearer
			 * session). Check `isAdminRole(user.role)` before allowing admin actions.
			 */
			user: User | null;
			session: Session | null;
			/**
			 * Host app user from a verified identity token (widget API only). Never
			 * set together with `user`: a request carries one bearer credential.
			 */
			identity: VerifiedIdentity | null;
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
