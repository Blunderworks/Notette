import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { feedback as feedbackTable } from '$lib/server/db/schema';
import { config } from '$lib/server/env';
import { ApiError, api } from '$lib/server/http';
import { isUuid, sha256 } from '$lib/server/ids';
import { getFeedback } from '$lib/server/services/feedback';
import { getScreenshotForFeedback, saveScreenshot } from '$lib/server/services/uploads';
import { getStorage } from '$lib/server/storage';
import { loadWidgetThread } from '$lib/server/widget-thread';

/** Screenshot uploads are accepted for 15 minutes after the item was created. */
const UPLOAD_WINDOW_MS = 15 * 60 * 1000;

function parseDimension(value: string | null): number | null {
	if (!value) return null;
	const n = Number.parseInt(value, 10);
	return Number.isFinite(n) && n > 0 && n < 100_000 ? n : null;
}

export const PUT = api(async (event) => {
	const { project } = event.locals.widget!;
	if (!project.screenshotsEnabled) {
		throw new ApiError(403, 'Screenshots are disabled for this project', 'forbidden');
	}
	const id = event.params.id ?? '';
	if (!isUuid(id)) throw new ApiError(404, 'Feedback not found', 'not_found');
	const item = await getFeedback(id);
	if (!item || item.projectId !== project.id) throw new ApiError(404, 'Feedback not found', 'not_found');

	if (!event.locals.user) {
		const token = event.request.headers.get('x-notette-upload-token') ?? '';
		const fresh = Date.now() - item.createdAt.getTime() < UPLOAD_WINDOW_MS;
		if (!item.uploadTokenHash || !token || sha256(token) !== item.uploadTokenHash || !fresh) {
			throw new ApiError(403, 'Not allowed to attach a screenshot to this item', 'forbidden');
		}
	}

	const maxBytes = config.maxScreenshotBytes;
	const declared = Number(event.request.headers.get('content-length') ?? '0');
	if (declared > maxBytes) throw new ApiError(413, 'Screenshot is too large', 'payload_too_large');
	const bytes = new Uint8Array(await event.request.arrayBuffer());
	if (bytes.byteLength === 0) throw new ApiError(400, 'Empty upload', 'bad_request');
	if (bytes.byteLength > maxBytes) throw new ApiError(413, 'Screenshot is too large', 'payload_too_large');

	const upload = await saveScreenshot({
		projectId: project.id,
		feedbackId: item.id,
		bytes,
		width: parseDimension(event.url.searchParams.get('w')),
		height: parseDimension(event.url.searchParams.get('h'))
	});
	await db.update(feedbackTable).set({ uploadTokenHash: null }).where(eq(feedbackTable.id, item.id));

	return json({ id: upload.id, width: upload.width, height: upload.height }, { status: 201 });
});

/** Serves the screenshot to the widget (image requests cannot carry bearer tokens, so the widget fetches blobs). */
export const GET = api(async (event) => {
	const thread = await loadWidgetThread(event);
	const upload = await getScreenshotForFeedback(thread.item.id);
	if (!upload) throw new ApiError(404, 'No screenshot', 'not_found');
	const object = await getStorage().open(upload.storageKey);
	if (!object) throw new ApiError(404, 'Screenshot file missing', 'not_found');
	return new Response(object.stream, {
		headers: {
			'Content-Type': upload.mimeType,
			'Content-Length': String(object.size),
			'Cache-Control': 'private, max-age=300',
			'X-Content-Type-Options': 'nosniff'
		}
	});
});
