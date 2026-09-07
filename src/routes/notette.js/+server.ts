import type { RequestHandler } from './$types';
import { createHash } from 'node:crypto';
import widgetSource from '../../../.widget-dist/notette.js?raw';

const etag = `"${createHash('sha256').update(widgetSource).digest('hex').slice(0, 32)}"`;

const headers = {
	'Content-Type': 'text/javascript; charset=utf-8',
	'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
	'Access-Control-Allow-Origin': '*',
	'Cross-Origin-Resource-Policy': 'cross-origin',
	'X-Content-Type-Options': 'nosniff',
	ETag: etag
};

/** Serves the compiled standalone widget bundle. */
export const GET: RequestHandler = ({ request }) => {
	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers });
	}
	return new Response(widgetSource, { headers });
};

export const HEAD: RequestHandler = () => new Response(null, { headers });
