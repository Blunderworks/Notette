import { describe, expect, it } from 'vitest';
import { isAdminRole, isUserRole } from './roles';

describe('roles', () => {
	it('treats owners and admins as admins', () => {
		expect(isAdminRole('owner')).toBe(true);
		expect(isAdminRole('admin')).toBe(true);
		expect(isAdminRole('member')).toBe(false);
		expect(isAdminRole(null)).toBe(false);
		expect(isAdminRole(undefined)).toBe(false);
	});

	it('validates role strings', () => {
		expect(isUserRole('member')).toBe(true);
		expect(isUserRole('superuser')).toBe(false);
		expect(isUserRole(42)).toBe(false);
	});
});
