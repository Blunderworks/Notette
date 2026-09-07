import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { StorageAdapter, StoredObject } from './index';

const KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*(\/[a-zA-Z0-9][a-zA-Z0-9._-]*)*$/;

export class LocalFileStorage implements StorageAdapter {
	private readonly root: string;

	constructor(root: string) {
		this.root = path.resolve(root);
	}

	private resolve(key: string): string {
		if (!KEY_RE.test(key) || key.includes('..')) {
			throw new Error(`Invalid storage key: ${key}`);
		}
		const full = path.resolve(this.root, key);
		if (!full.startsWith(this.root + path.sep)) {
			throw new Error(`Storage key escapes root: ${key}`);
		}
		return full;
	}

	async put(key: string, data: Uint8Array): Promise<void> {
		const full = this.resolve(key);
		await mkdir(path.dirname(full), { recursive: true });
		const tmp = `${full}.${process.pid}.${Date.now()}.tmp`;
		await writeFile(tmp, data, { mode: 0o640 });
		await rename(tmp, full);
	}

	async open(key: string): Promise<StoredObject | null> {
		const full = this.resolve(key);
		let size: number;
		try {
			const info = await stat(full);
			if (!info.isFile()) return null;
			size = info.size;
		} catch {
			return null;
		}
		const stream = Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>;
		return { stream, size };
	}

	async delete(key: string): Promise<void> {
		const full = this.resolve(key);
		await rm(full, { force: true });
	}
}
