import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		await db.execute(sql`select 1`);
		return json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
	} catch (err) {
		console.error('[notette] Health check failed', err);
		return json({ ok: false, error: 'database_unavailable' }, { status: 503 });
	}
};
