export const WIDGET_API_PREFIX = '/api/widget/';

export function corsHeaders(origin: string, preflight = false): Record<string, string> {
	const headers: Record<string, string> = {
		'Access-Control-Allow-Origin': origin,
		Vary: 'Origin'
	};
	if (preflight) {
		headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
		headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Notette-Client, X-Notette-Upload-Token';
		headers['Access-Control-Max-Age'] = '600';
	}
	return headers;
}

export function applyCors(response: Response, origin: string): Response {
	for (const [key, value] of Object.entries(corsHeaders(origin))) {
		if (key === 'Vary') {
			const existing = response.headers.get('Vary');
			if (existing && !existing.split(',').some((v) => v.trim().toLowerCase() === 'origin')) {
				response.headers.set('Vary', `${existing}, Origin`);
			} else if (!existing) {
				response.headers.set('Vary', 'Origin');
			}
		} else {
			response.headers.set(key, value);
		}
	}
	return response;
}
