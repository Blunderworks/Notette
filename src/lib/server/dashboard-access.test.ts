import { describe, expect, it } from 'vitest';
import type { User } from '$lib/server/db/schema';
import { dashboardAccess } from './dashboard-access';

const user = (role: User['role']) => ({ id: 'u', role }) as User;

describe('dashboardAccess', () => {
	it('requires sign-in for every (app) route', () => {
		for (const id of ['/(app)', '/(app)/settings/account', '/(app)/projects/[id]/settings', '/(app)/projects/new']) {
			expect(dashboardAccess(id, null)).toBe('sign_in');
		}
	});

	it('limits members to the home and account routes', () => {
		expect(dashboardAccess('/(app)', user('member'))).toBe('allowed');
		expect(dashboardAccess('/(app)/settings/account', user('member'))).toBe('allowed');
		for (const id of ['/(app)/projects/new', '/(app)/projects/[id]/settings', '/(app)/projects/[id]/feedback/[fid]', '/(app)/feedback', '/(app)/settings/users']) {
			expect(dashboardAccess(id, user('member'))).toBe('forbidden');
		}
	});

	it('lets owners and admins use every (app) route', () => {
		for (const role of ['owner', 'admin'] as const) {
			expect(dashboardAccess('/(app)/projects/[id]/settings', user(role))).toBe('allowed');
			expect(dashboardAccess('/(app)/settings/users', user(role))).toBe('allowed');
		}
	});

	it('leaves routes outside the (app) group to their own checks', () => {
		for (const id of ['/(auth)/login', '/(popup)/widget/authorize', '/api/widget/[key]/feedback', '/logout', '/(application)', null]) {
			expect(dashboardAccess(id, null)).toBe('allowed');
		}
	});
});
