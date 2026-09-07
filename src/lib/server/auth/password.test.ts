import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
	it('verifies the correct password and rejects others', async () => {
		const hash = await hashPassword('correct horse battery staple');
		expect(hash.startsWith('scrypt$')).toBe(true);
		expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
		expect(await verifyPassword('wrong', hash)).toBe(false);
	});

	it('produces different hashes for the same password (random salt)', async () => {
		const a = await hashPassword('same password here');
		const b = await hashPassword('same password here');
		expect(a).not.toBe(b);
	});

	it('rejects malformed stored hashes without throwing', async () => {
		expect(await verifyPassword('x', 'garbage')).toBe(false);
		expect(await verifyPassword('x', 'scrypt$a$b$c$d$e')).toBe(false);
		expect(await verifyPassword('x', '')).toBe(false);
	});
});
