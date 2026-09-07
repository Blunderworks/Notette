import { config } from '$lib/server/env';
import { LocalFileStorage } from './local';

export interface StoredObject {
	stream: ReadableStream<Uint8Array>;
	size: number;
}

/**
 * Minimal object-storage abstraction. The local filesystem implementation is
 * the default; an S3-compatible adapter can implement the same interface.
 */
export interface StorageAdapter {
	put(key: string, data: Uint8Array, contentType: string): Promise<void>;
	open(key: string): Promise<StoredObject | null>;
	delete(key: string): Promise<void>;
}

let instance: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
	if (!instance) instance = new LocalFileStorage(config.uploadsDir);
	return instance;
}

/** Test helper. */
export function setStorage(adapter: StorageAdapter | null): void {
	instance = adapter;
}
