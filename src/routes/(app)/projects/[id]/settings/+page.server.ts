import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Project } from '$lib/server/db/schema';
import { config } from '$lib/server/env';
import { ApiError } from '$lib/server/http';
import { isUuid } from '$lib/server/ids';
import { generateIdentitySecret, normalizeJwksUrl, parsePublicKey } from '$lib/server/identity';
import { parseProjectForm } from '$lib/server/project-form';
import { addProjectMember, listProjectMembers, removeProjectMember } from '$lib/server/services/members';
import { isEmailNotificationsEnabled, setEmailNotifications } from '$lib/server/services/notifications';
import {
	deleteProject,
	getProject,
	regenerateClientKey,
	rotateIdentitySecret,
	updateProject,
	updateProjectIdentity
} from '$lib/server/services/projects';
import { createUser, getUserById, listUsers } from '$lib/server/services/users';
import { emailSchema, passwordSchema } from '$lib/server/validation';
import { isAdminRole } from '$lib/shared/roles';

export const load: PageServerLoad = async ({ url, params, locals, parent }) => {
	const [members, allUsers, emailNotifications, project] = await Promise.all([
		listProjectMembers(params.id),
		listUsers(),
		config.emailEnabled ? isEmailNotificationsEnabled(locals.user!.id, params.id) : Promise.resolve(true),
		getProject(params.id)
	]);
	const publicKey = project?.identityPublicKey ? parsePublicKey(project.identityPublicKey) : null;
	const memberIds = new Set(members.map((m) => m.userId));
	return {
		created: url.searchParams.get('created') === '1',
		emailConfigured: config.emailEnabled,
		turnstileConfigured: (await parent()).project.turnstileConfigured,
		/** The signed-in admin's own preference for this project. */
		emailNotifications,
		// Secrets are never sent back; they are shown once by the action that creates them.
		identity: {
			mode: project?.identityMode ?? 'off',
			secretSet: !!project?.identitySecret,
			previousSecretSet: !!project?.identityPreviousSecret,
			publicKey: project?.identityPublicKey ?? '',
			publicKeyAlgorithm: publicKey && !('error' in publicKey) ? publicKey.algorithms[0] : null,
			jwksUrl: project?.identityJwksUrl ?? '',
			issuer: project?.identityIssuer ?? '',
			audience: project?.identityAudience ?? ''
		},
		members: members.map((m) => ({
			userId: m.userId,
			name: m.name,
			email: m.email,
			role: m.role,
			addedAt: m.createdAt.toISOString()
		})),
		// Owners/admins already have access everywhere, so only member accounts can be added.
		candidates: allUsers
			.filter((u) => u.role === 'member' && !memberIds.has(u.id))
			.map((u) => ({ id: u.id, name: u.name, email: u.email }))
	};
};

export const actions: Actions = {
	identity: async ({ request, params, locals }) => {
		if (!locals.user || !isAdminRole(locals.user.role)) return fail(403, { action: 'identity', errors: ['Admin access required.'] });
		const form = await request.formData();
		const project = await getProject(params.id);
		if (!project) return fail(404, { action: 'identity', errors: ['Project not found.'] });
		const mode = String(form.get('mode') ?? '') as Project['identityMode'];
		const identityValues = {
			mode,
			publicKey: String(form.get('publicKey') ?? '').trim(),
			jwksUrl: String(form.get('jwksUrl') ?? '').trim(),
			issuer: String(form.get('issuer') ?? '').trim(),
			audience: String(form.get('audience') ?? '').trim()
		};
		const invalid = (message: string) => fail(400, { action: 'identity', identityValues, errors: [message] });
		switch (mode) {
			case 'off':
				await updateProjectIdentity(project.id, { identityMode: 'off' });
				return { action: 'identity', success: true };
			case 'secret': {
				// Switching to secret mode generates the first secret; later changes use rotate.
				const secret = project.identitySecret ? null : generateIdentitySecret();
				await updateProjectIdentity(project.id, { identityMode: 'secret', ...(secret ? { identitySecret: secret } : {}) });
				return { action: 'identity', success: true, secret };
			}
			case 'public_key': {
				if (!identityValues.publicKey || identityValues.publicKey.length > 10_000) return invalid('Paste a PEM public key (maximum 10,000 characters).');
				const parsed = parsePublicKey(identityValues.publicKey);
				if ('error' in parsed) return invalid(parsed.error);
				await updateProjectIdentity(project.id, { identityMode: 'public_key', identityPublicKey: identityValues.publicKey });
				return { action: 'identity', success: true };
			}
			case 'jwks': {
				const jwksUrl = normalizeJwksUrl(identityValues.jwksUrl);
				if (!jwksUrl) return invalid('Enter an HTTPS JWKS URL (plain HTTP is only allowed for localhost).');
				const { issuer, audience } = identityValues;
				if (!issuer || issuer.length > 500 || !audience || audience.length > 500) {
					return invalid('Enter the issuer and audience your identity provider puts in its tokens (maximum 500 characters each).');
				}
				await updateProjectIdentity(project.id, { identityMode: 'jwks', identityJwksUrl: jwksUrl, identityIssuer: issuer, identityAudience: audience });
				return { action: 'identity', success: true };
			}
			default:
				return invalid('Choose how identity tokens are verified.');
		}
	},
	rotateIdentitySecret: async ({ params, locals }) => {
		if (!locals.user || !isAdminRole(locals.user.role)) return fail(403, { action: 'identitySecret', errors: ['Admin access required.'] });
		const project = await getProject(params.id);
		if (!project) return fail(404, { action: 'identitySecret', errors: ['Project not found.'] });
		if (project.identityMode !== 'secret' || !project.identitySecret) {
			return fail(400, { action: 'identitySecret', errors: ['Shared-secret verification is not enabled.'] });
		}
		const secret = generateIdentitySecret();
		await rotateIdentitySecret(project.id, secret);
		return { action: 'identitySecret', success: true, secret };
	},
	revokePreviousIdentitySecret: async ({ params, locals }) => {
		if (!locals.user || !isAdminRole(locals.user.role)) return fail(403, { action: 'identitySecret', errors: ['Admin access required.'] });
		const updated = await updateProjectIdentity(params.id, { identityPreviousSecret: null });
		if (!updated) return fail(404, { action: 'identitySecret', errors: ['Project not found.'] });
		return { action: 'identitySecret', success: true, revoked: true };
	},
	turnstile: async ({ request, params, locals }) => {
		if (!locals.user || !isAdminRole(locals.user.role)) return fail(403, { action: 'turnstile', errors: ['Admin access required.'] });
		const form = await request.formData();
		const project = await getProject(params.id);
		if (!project) return fail(404, { action: 'turnstile', errors: ['Project not found.'] });
		const remove = form.get('remove') === 'on';
		const siteKey = String(form.get('siteKey') ?? '').trim();
		const secretKey = String(form.get('secretKey') ?? '').trim() || project.turnstileSecretKey;
		if (!remove && (!siteKey || !secretKey || siteKey.length > 256 || secretKey.length > 256)) {
			return fail(400, { action: 'turnstile', errors: ['Enter both keys (maximum 256 characters each). Leave the secret blank only to keep a saved secret.'] });
		}
		await updateProject(params.id, { turnstileSiteKey: remove ? null : siteKey, turnstileSecretKey: remove ? null : secretKey });
		return { action: 'turnstile', success: true };
	},
	update: async ({ request, params }) => {
		const { values, errors } = parseProjectForm(await request.formData());
		if (errors.length) return fail(400, { action: 'update', values, errors });
		const { originsText: _ignored, ...input } = values;
		const updated = await updateProject(params.id, input);
		if (!updated) return fail(404, { action: 'update', values, errors: ['Project not found.'] });
		return { action: 'update', success: true };
	},
	regenerateKey: async ({ params }) => {
		const updated = await regenerateClientKey(params.id);
		if (!updated) return fail(404, { action: 'regenerateKey', errors: ['Project not found.'] });
		return { action: 'regenerateKey', success: true };
	},
	delete: async ({ request, params }) => {
		const form = await request.formData();
		const project = await getProject(params.id);
		if (!project) return fail(404, { action: 'delete', errors: ['Project not found.'] });
		if (String(form.get('confirm') ?? '').trim() !== project.name) {
			return fail(400, { action: 'delete', errors: ['Type the project name exactly to confirm deletion.'] });
		}
		await deleteProject(project.id);
		redirect(303, '/');
	},
	addMember: async ({ request, params, locals }) => {
		const form = await request.formData();
		const userId = String(form.get('userId') ?? '');
		if (!isUuid(userId)) return fail(400, { action: 'addMember', errors: ['Select a user to add.'] });
		const target = await getUserById(userId);
		if (!target) return fail(404, { action: 'addMember', errors: ['User not found.'] });
		if (isAdminRole(target.role)) {
			return fail(400, { action: 'addMember', errors: ['Owners and admins already have access to every project.'] });
		}
		await addProjectMember(params.id, target.id, locals.user!.id);
		return { action: 'addMember', success: true };
	},
	createMember: async ({ request, params, locals }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const emailRaw = String(form.get('email') ?? '');
		const password = String(form.get('password') ?? '');
		const memberValues = { name, email: emailRaw.trim().toLowerCase() };

		const email = emailSchema.safeParse(emailRaw);
		if (!email.success) return fail(400, { action: 'createMember', memberValues, errors: ['Enter a valid email address.'] });
		if (!name || name.length > 120) return fail(400, { action: 'createMember', memberValues, errors: ['Name is required (max 120 characters).'] });
		const pw = passwordSchema.safeParse(password);
		if (!pw.success) {
			return fail(400, { action: 'createMember', memberValues, errors: [pw.error.issues[0]?.message ?? 'Invalid password.'] });
		}

		let userId: string;
		try {
			const user = await createUser({ email: email.data, name, password, role: 'member' });
			userId = user.id;
		} catch (err) {
			if (err instanceof ApiError && err.code === 'user_exists') {
				return fail(409, {
					action: 'createMember',
					memberValues,
					errors: ['A user with this email already exists. Add them from the list instead.']
				});
			}
			throw err;
		}
		await addProjectMember(params.id, userId, locals.user!.id);
		return { action: 'createMember', success: true };
	},
	notifications: async ({ request, params, locals }) => {
		const form = await request.formData();
		await setEmailNotifications(locals.user!.id, params.id, form.get('emailNotifications') === 'on');
		return { action: 'notifications', success: true };
	},
	removeMember: async ({ request, params }) => {
		const form = await request.formData();
		const userId = String(form.get('userId') ?? '');
		if (!isUuid(userId)) return fail(400, { action: 'removeMember', errors: ['User not found.'] });
		await removeProjectMember(params.id, userId);
		return { action: 'removeMember', success: true };
	}
};
