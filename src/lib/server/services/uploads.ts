import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { uploads, type Upload } from '$lib/server/db/schema';
import { uuid } from '$lib/server/ids';
import { getStorage } from '$lib/server/storage';
import { ApiError } from '$lib/server/http';

export interface ImageType {
	mime: 'image/png' | 'image/jpeg' | 'image/webp';
	ext: 'png' | 'jpg' | 'webp';
}

/** Sniffs the image type from magic bytes; only raster formats are accepted. */
export function detectImageType(bytes: Uint8Array): ImageType | null {
	if (bytes.length < 12) return null;
	if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
		return { mime: 'image/png', ext: 'png' };
	}
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return { mime: 'image/jpeg', ext: 'jpg' };
	}
	if (
		bytes[0] === 0x52 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46 &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	) {
		return { mime: 'image/webp', ext: 'webp' };
	}
	return null;
}

export async function getUpload(id: string): Promise<Upload | null> {
	const [row] = await db.select().from(uploads).where(eq(uploads.id, id)).limit(1);
	return row ?? null;
}

export async function getScreenshotForFeedback(feedbackId: string): Promise<Upload | null> {
	const [row] = await db
		.select()
		.from(uploads)
		.where(and(eq(uploads.feedbackId, feedbackId), eq(uploads.kind, 'screenshot')))
		.orderBy(desc(uploads.createdAt))
		.limit(1);
	return row ?? null;
}

async function removeUploadRows(rows: Upload[]): Promise<void> {
	const storage = getStorage();
	for (const row of rows) {
		try {
			await storage.delete(row.storageKey);
		} catch (err) {
			console.warn(`[notette] Failed to delete upload file ${row.storageKey}`, err);
		}
		await db.delete(uploads).where(eq(uploads.id, row.id));
	}
}

/**
 * Stores a screenshot for a feedback item, replacing any existing one.
 */
export async function saveScreenshot(input: {
	projectId: string;
	feedbackId: string;
	bytes: Uint8Array;
	width?: number | null;
	height?: number | null;
}): Promise<Upload> {
	const type = detectImageType(input.bytes);
	if (!type) throw new ApiError(415, 'Unsupported image format (PNG, JPEG or WebP expected)', 'unsupported_media');

	const previous = await db
		.select()
		.from(uploads)
		.where(and(eq(uploads.feedbackId, input.feedbackId), eq(uploads.kind, 'screenshot')));

	const id = uuid();
	const storageKey = `projects/${input.projectId}/${id}.${type.ext}`;
	await getStorage().put(storageKey, input.bytes, type.mime);
	const [row] = await db
		.insert(uploads)
		.values({
			id,
			projectId: input.projectId,
			feedbackId: input.feedbackId,
			kind: 'screenshot',
			storageKey,
			mimeType: type.mime,
			sizeBytes: input.bytes.byteLength,
			width: input.width ?? null,
			height: input.height ?? null
		})
		.returning();

	await removeUploadRows(previous);
	return row;
}

export async function deleteFilesForFeedback(feedbackId: string): Promise<void> {
	const rows = await db.select().from(uploads).where(eq(uploads.feedbackId, feedbackId));
	await removeUploadRows(rows);
}

export async function deleteFilesForProject(projectId: string): Promise<void> {
	const rows = await db.select().from(uploads).where(eq(uploads.projectId, projectId));
	await removeUploadRows(rows);
}
