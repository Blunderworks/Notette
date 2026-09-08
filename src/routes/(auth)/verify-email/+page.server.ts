import type { PageServerLoad } from './$types';
import { verifyEmailToken } from '$lib/server/services/email-verification';

/** Landing page of the confirmation link sent to widget sign-ups. */
export const load: PageServerLoad = async ({ url }) => {
	const result = await verifyEmailToken(url.searchParams.get('token'));
	return {
		status: result.status,
		name: 'name' in result ? result.name : null,
		origin: 'origin' in result ? result.origin : null
	};
};
