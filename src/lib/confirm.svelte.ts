import type { SubmitFunction } from '@sveltejs/kit';

export interface ConfirmOptions {
	title: string;
	message?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	/** Styles the confirm button as destructive (default true). */
	danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
	resolve: (ok: boolean) => void;
}

/** The confirmation currently shown by `ConfirmDialog.svelte`, or null. */
export const confirmState = $state<{ pending: PendingConfirm | null }>({ pending: null });

/**
 * Show the branded confirmation modal and resolve with the user's answer.
 * Only one confirmation is shown at a time; a second request while one is
 * open resolves the first one as cancelled.
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
	confirmState.pending?.resolve(false);
	return new Promise((resolve) => {
		confirmState.pending = { ...options, resolve };
	});
}

/** Answer the open confirmation (used by the dialog component). */
export function answerConfirm(ok: boolean): void {
	const pending = confirmState.pending;
	confirmState.pending = null;
	pending?.resolve(ok);
}

/**
 * `use:enhance` submit function that asks for confirmation before submitting.
 *
 * `enhance` needs `cancel()` synchronously, so the first submission is always
 * cancelled; once the user confirms, the form is re-submitted with the same
 * submitter button and passes straight through. `options` may be a function
 * of the submit input so the message can depend on which button was pressed.
 * An optional `then` runs for the confirmed submission like a normal enhance
 * callback.
 */
export function confirmSubmit(
	options: ConfirmOptions | ((input: Parameters<SubmitFunction>[0]) => ConfirmOptions | null),
	then?: SubmitFunction
): SubmitFunction {
	const approved = new WeakSet<HTMLFormElement>();
	return (input) => {
		const form = input.formElement;
		if (approved.has(form)) {
			approved.delete(form);
			return then?.(input);
		}
		const opts = typeof options === 'function' ? options(input) : options;
		if (!opts) return then?.(input);
		const submitter = input.submitter instanceof HTMLElement ? input.submitter : undefined;
		input.cancel();
		void confirm(opts).then((ok) => {
			if (!ok || !form.isConnected) return;
			approved.add(form);
			form.requestSubmit(submitter);
		});
	};
}
