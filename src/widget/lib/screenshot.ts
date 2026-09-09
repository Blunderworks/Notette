import html2canvas from 'html2canvas-pro';

export interface Screenshot {
	blob: Blob;
	width: number;
	height: number;
}

/** The part of the page that is captured, in CSS pixels. */
export interface CaptureViewport {
	scrollX: number;
	scrollY: number;
	width: number;
	height: number;
}

interface CaptureOptions {
	/** Element (the widget host) to leave out of the capture. */
	exclude: Element;
	/** Page coordinates of the click, drawn as a marker on the image. */
	marker?: { x: number; y: number } | null;
	/**
	 * Scroll position and size of the viewport to capture. Defaults to the
	 * current window; pass the values recorded at click time so that later
	 * scrolling (for example the on-screen keyboard pushing the page up while
	 * the reviewer types) does not change what the screenshot shows.
	 */
	viewport?: CaptureViewport;
	timeoutMs?: number;
}

const MAX_PIXELS = 4_000_000;
const FROZEN_ATTR = 'data-notette-frozen';
const KEYFRAME_META = new Set(['offset', 'computedOffset', 'easing', 'composite']);
/** Properties copied when an animation's keyframes cannot be inspected. */
const FALLBACK_PROPS = ['opacity', 'transform', 'translate', 'rotate', 'scale', 'filter', 'visibility', 'clip-path'];

export function currentViewport(): CaptureViewport {
	return {
		scrollX: Math.round(window.scrollX),
		scrollY: Math.round(window.scrollY),
		width: window.innerWidth,
		height: window.innerHeight
	};
}

function chooseScale(view: CaptureViewport): number {
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	const pixels = view.width * view.height * dpr * dpr;
	if (pixels <= MAX_PIXELS) return dpr;
	return Math.max(0.5, Math.sqrt(MAX_PIXELS / (view.width * view.height)));
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

function drawMarker(
	canvas: HTMLCanvasElement,
	scale: number,
	view: CaptureViewport,
	marker: { x: number; y: number }
): void {
	const ctx = canvas.getContext('2d');
	if (!ctx) return;
	const x = (marker.x - view.scrollX) * scale;
	const y = (marker.y - view.scrollY) * scale;
	const r = 14 * scale;
	ctx.save();
	// html2canvas leaves its own scale + scroll translate on the context; draw in
	// raw canvas pixels or the marker lands off-target on scrolled/high-DPI pages.
	ctx.setTransform(1, 0, 0, 1, 0, 0);
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

function toCssProperty(name: string): string {
	if (name.startsWith('--')) return name;
	if (name === 'cssFloat') return 'float';
	if (name === 'cssOffset') return 'offset';
	return name.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}

function animatedProperties(effect: AnimationEffect): string[] {
	try {
		const keyframes = (effect as KeyframeEffect).getKeyframes();
		const props = new Set<string>();
		for (const frame of keyframes) {
			for (const key of Object.keys(frame)) {
				if (!KEYFRAME_META.has(key)) props.add(toCssProperty(key));
			}
		}
		if (props.size > 0) return [...props];
	} catch {
		// Some engines refuse to expose keyframes of CSS animations.
	}
	return FALLBACK_PROPS;
}

export interface FrozenAnimations {
	/** Live elements that were tagged; the tag is removed by `release()`. */
	elements: Element[];
	/** Computed values per tagged element, keyed by the tag value. */
	styles: Map<string, [string, string][]>;
	release(): void;
}

/**
 * html2canvas renders a clone of the document in a hidden iframe, where CSS
 * animations start over from their first keyframe. Pages that reveal content
 * with an entrance animation (opacity 0 → 1, slide-in) would therefore come out
 * blank or half-faded. Record the current computed values of every animated
 * property so `applyFrozenAnimations` can pin them on the clone.
 */
export function freezeAnimations(root: Document, exclude: Element | null): FrozenAnimations {
	const styles = new Map<string, [string, string][]>();
	const elements: Element[] = [];
	const seen = new Map<Element, Set<string>>();
	let animations: Animation[] = [];
	try {
		animations = typeof root.getAnimations === 'function' ? root.getAnimations() : [];
	} catch {
		animations = [];
	}
	for (const animation of animations) {
		const effect = animation.effect as KeyframeEffect | null;
		const target = effect?.target;
		if (!effect || !target || effect.pseudoElement) continue;
		if (target.getRootNode() !== root) continue;
		if (exclude && (target === exclude || exclude.contains(target))) continue;
		let props = seen.get(target);
		if (!props) {
			props = new Set();
			seen.set(target, props);
		}
		for (const prop of animatedProperties(effect)) props.add(prop);
	}
	let index = 0;
	for (const [element, props] of seen) {
		const computed = root.defaultView?.getComputedStyle(element);
		if (!computed) continue;
		const values: [string, string][] = [];
		for (const prop of props) {
			const value = computed.getPropertyValue(prop);
			if (value) values.push([prop, value]);
		}
		if (values.length === 0) continue;
		const id = String(index++);
		element.setAttribute(FROZEN_ATTR, id);
		elements.push(element);
		styles.set(id, values);
	}
	return {
		elements,
		styles,
		release() {
			for (const element of elements) element.removeAttribute(FROZEN_ATTR);
		}
	};
}

/** Pins the recorded values on the cloned document and stops its animations. */
export function applyFrozenAnimations(clone: Document, frozen: FrozenAnimations): void {
	for (const element of clone.querySelectorAll<HTMLElement>(`[${FROZEN_ATTR}]`)) {
		const values = frozen.styles.get(element.getAttribute(FROZEN_ATTR) ?? '');
		element.removeAttribute(FROZEN_ATTR);
		if (!values || !element.style) continue;
		element.style.setProperty('animation', 'none', 'important');
		element.style.setProperty('transition', 'none', 'important');
		for (const [prop, value] of values) element.style.setProperty(prop, value, 'important');
	}
}

/**
 * Captures the viewport as a JPEG. Never throws: returns null when the
 * capture fails or exceeds the timeout so feedback can still be submitted.
 */
export async function captureViewport(options: CaptureOptions): Promise<Screenshot | null> {
	const timeoutMs = options.timeoutMs ?? 12_000;
	const view = options.viewport ?? currentViewport();
	const scale = chooseScale(view);
	const frozen = freezeAnimations(document, options.exclude);
	try {
		const canvas = await Promise.race([
			html2canvas(document.documentElement, {
				x: view.scrollX,
				y: view.scrollY,
				width: view.width,
				height: view.height,
				scrollX: view.scrollX,
				scrollY: view.scrollY,
				windowWidth: document.documentElement.clientWidth,
				windowHeight: document.documentElement.clientHeight,
				scale,
				useCORS: true,
				allowTaint: false,
				logging: false,
				imageTimeout: 4000,
				backgroundColor: '#ffffff',
				ignoreElements: (el) => el === options.exclude || el.tagName === 'NOTETTE-WIDGET',
				onclone: (clone) => {
					// The clone exists now; the live page no longer needs the tags.
					frozen.release();
					applyFrozenAnimations(clone, frozen);
				}
			}),
			new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
		]);
		if (!canvas) return null;
		if (options.marker) drawMarker(canvas, scale, view, options.marker);
		const blob = await toBlob(canvas);
		if (!blob || blob.size === 0) return null;
		return { blob, width: canvas.width, height: canvas.height };
	} catch (err) {
		console.warn('[notette] Screenshot capture failed', err);
		return null;
	} finally {
		frozen.release();
	}
}
