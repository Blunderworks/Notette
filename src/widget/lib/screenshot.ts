import html2canvas from 'html2canvas-pro';

export interface Screenshot {
	blob: Blob;
	width: number;
	height: number;
}

interface CaptureOptions {
	/** Element (the widget host) to leave out of the capture. */
	exclude: Element;
	/** Page coordinates of the click, drawn as a marker on the image. */
	marker?: { x: number; y: number } | null;
	timeoutMs?: number;
}

const MAX_PIXELS = 4_000_000;

function chooseScale(): number {
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	const pixels = window.innerWidth * window.innerHeight * dpr * dpr;
	if (pixels <= MAX_PIXELS) return dpr;
	return Math.max(0.5, Math.sqrt(MAX_PIXELS / (window.innerWidth * window.innerHeight)));
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
	return new Promise((resolve) => {
		try {
			canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
		} catch {
			resolve(null);
		}
	});
}

function drawMarker(canvas: HTMLCanvasElement, scale: number, marker: { x: number; y: number }): void {
	const ctx = canvas.getContext('2d');
	if (!ctx) return;
	const x = (marker.x - window.scrollX) * scale;
	const y = (marker.y - window.scrollY) * scale;
	const r = 14 * scale;
	ctx.save();
	ctx.lineWidth = 3 * scale;
	ctx.strokeStyle = '#ffffff';
	ctx.beginPath();
	ctx.arc(x, y, r, 0, Math.PI * 2);
	ctx.stroke();
	ctx.lineWidth = 2 * scale;
	ctx.strokeStyle = '#4f46e5';
	ctx.fillStyle = 'rgba(79, 70, 229, 0.25)';
	ctx.beginPath();
	ctx.arc(x, y, r, 0, Math.PI * 2);
	ctx.fill();
	ctx.stroke();
	ctx.fillStyle = '#4f46e5';
	ctx.beginPath();
	ctx.arc(x, y, 3 * scale, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

/**
 * Captures the current viewport as a JPEG. Never throws: returns null when the
 * capture fails or exceeds the timeout so feedback can still be submitted.
 */
export async function captureViewport(options: CaptureOptions): Promise<Screenshot | null> {
	const timeoutMs = options.timeoutMs ?? 12_000;
	const scale = chooseScale();
	try {
		const canvas = await Promise.race([
			html2canvas(document.documentElement, {
				x: window.scrollX,
				y: window.scrollY,
				width: window.innerWidth,
				height: window.innerHeight,
				scrollX: window.scrollX,
				scrollY: window.scrollY,
				windowWidth: document.documentElement.clientWidth,
				windowHeight: document.documentElement.clientHeight,
				scale,
				useCORS: true,
				allowTaint: false,
				logging: false,
				imageTimeout: 4000,
				backgroundColor: '#ffffff',
				ignoreElements: (el) => el === options.exclude || el.tagName === 'NOTETTE-WIDGET'
			}),
			new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
		]);
		if (!canvas) return null;
		if (options.marker) drawMarker(canvas, scale, options.marker);
		const blob = await toBlob(canvas);
		if (!blob || blob.size === 0) return null;
		return { blob, width: canvas.width, height: canvas.height };
	} catch (err) {
		console.warn('[notette] Screenshot capture failed', err);
		return null;
	}
}
