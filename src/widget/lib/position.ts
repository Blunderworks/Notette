export interface Point {
	x: number;
	y: number;
}

export interface Placement {
	left: number;
	top: number;
}

/**
 * Places a popover of the given size next to an anchor point in the viewport,
 * flipping to the other side and clamping so it stays fully visible.
 */
export function placeNear(anchor: Point, width: number, height: number, gap = 16, margin = 12): Placement {
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	let left = anchor.x + gap;
	if (left + width > vw - margin) left = anchor.x - gap - width;
	if (left < margin) left = Math.max(margin, Math.min(anchor.x - width / 2, vw - margin - width));

	let top = anchor.y - 24;
	if (top + height > vh - margin) top = vh - margin - height;
	if (top < margin) top = margin;
	return { left, top };
}
