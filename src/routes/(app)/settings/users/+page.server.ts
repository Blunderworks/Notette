import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { countOwners, createUser, deleteUser, getUserById, listUsers, updateUserProfile } from '$lib/server/services/users';
import { emailSchema, passwordSchema } from '$lib/server/validation';
import { ApiError } from '$lib/server/http';
import { isUserRole, type UserRole } from '$lib/shared/roles';

function parseRole(value: FormDataEntryValue | null, fallback: UserRole = 'admin'): UserRole {
	const raw = String(value ?? '');
	return isUserRole(raw) ? raw : fallback;
}

export const load: PageServerLoad = async ({ locals }) => {
	const users = await listUsers();
	return {
		canManage: locals.user!.role === 'owner',
		users: users.map((u) => ({
			id: u.id,
			email: u.email,
			name: u.name,
			role: u.role,
			createdAt: u.createdAt.toISOString(),
			isSelf: u.id === locals.user!.id
		}))
	};
};

function requireOwner(locals: App.Locals) {
	if (locals.user?.role !== 'owner') {
		return fail(403, { action: 'create', error: 'Only owners can manage users.' });
	}
	return null;
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const denied = requireOwner(locals);
		if (denied) return denied;
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const emailRaw = String(form.get('email') ?? '');
		const password = String(form.get('password') ?? '');
		const role = parseRole(form.get('role'));
		const values = { name, email: emailRaw.trim().toLowerCase(), role };

		const email = emailSchema.safeParse(emailRaw);
		if (!email.success) return fail(400, { action: 'create', values, error: 'Enter a valid email address.' });
		if (!name || name.length > 120) return fail(400, { action: 'create', values, error: 'Name is required.' });
		const pw = passwordSchema.safeParse(password);
		if (!pw.success) return fail(400, { action: 'create', values, error: pw.error.issues[0]?.message ?? 'Invalid password.' });

		try {
			await createUser({ email: email.data, name, password, role });
		} catch (err) {
			if (err instanceof ApiError) return fail(err.status, { action: 'create', values, error: err.message });
			throw err;
		}
		return { action: 'create', success: true };
	},
	setRole: async ({ request, locals }) => {
		const denied = requireOwner(locals);
		if (denied) return denied;
		const form = await request.formData();
		const id = String(form.get('userId') ?? '');
		const role = parseRole(form.get('role'));
		const target = await getUserById(id);
		if (!target) return fail(404, { action: 'setRole', error: 'User not found.' });
		if (target.role === 'owner' && role !== 'owner' && (await countOwners()) <= 1) {
			return fail(400, { action: 'setRole', error: 'At least one owner is required.' });
		}
		await updateUserProfile(id, { role });
		return { action: 'setRole', success: true };
	},
	delete: async ({ request, locals }) => {
		const denied = requireOwner(locals);
		if (denied) return denied;
		const form = await request.formData();
		const id = String(form.get('userId') ?? '');
		if (id === locals.user!.id) return fail(400, { action: 'delete', error: 'You cannot delete your own account.' });
		const target = await getUserById(id);
		if (!target) return fail(404, { action: 'delete', error: 'User not found.' });
		if (target.role === 'owner' && (await countOwners()) <= 1) {
			return fail(400, { action: 'delete', error: 'At least one owner is required.' });
		}
		await deleteUser(id);
		return { action: 'delete', success: true };
	}
};
