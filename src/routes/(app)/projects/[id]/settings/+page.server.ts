import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { config } from '$lib/server/env';
import { ApiError } from '$lib/server/http';
import { isUuid } from '$lib/server/ids';
import { parseProjectForm } from '$lib/server/project-form';
import { addProjectMember, listProjectMembers, removeProjectMember } from '$lib/server/services/members';
import { isEmailNotificationsEnabled, setEmailNotifications } from '$lib/server/services/notifications';
import { deleteProject, getProject, regenerateClientKey, updateProject } from '$lib/server/services/projects';
import { createUser, getUserById, listUsers } from '$lib/server/services/users';
import { emailSchema, passwordSchema } from '$lib/server/validation';
import { isAdminRole } from '$lib/shared/roles';

export const load: PageServerLoad = async ({ url, params, locals, parent }) => {
	const [members, allUsers, emailNotifications] = await Promise.all([
		listProjectMembers(params.id),
		listUsers(),
		config.emailEnabled ? isEmailNotificationsEnabled(locals.user!.id, params.id) : Promise.resolve(true)
	]);
	const memberIds = new Set(members.map((m) => m.userId));
	return {
		created: url.searchParams.get('created') === '1',
		emailConfigured: config.emailEnabled,
		turnstileConfigured: (await parent()).project.turnstileConfigured,
		/** The signed-in admin's own preference for this project. */
		emailNotifications,
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
