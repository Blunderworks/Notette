import type { Project, Session, User } from '$lib/server/db/schema';

declare global {
	namespace App {
		interface Locals {
			/** Authenticated admin user (dashboard cookie session or widget bearer session). */
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
