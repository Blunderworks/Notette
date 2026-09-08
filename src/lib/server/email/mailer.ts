import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '$lib/server/env';

export interface OutgoingEmail {
	to: string;
	subject: string;
	html: string;
	text: string;
}

let transporter: Transporter | null = null;
let transporterKey = '';

function settingsKey(): string {
	return [config.smtpHost, config.smtpPort, config.smtpSecure, config.smtpUser].join('|');
}

/** Lazily created SMTP transport; recreated if the runtime configuration changes. */
function getTransporter(): Transporter {
	const key = settingsKey();
	if (!transporter || key !== transporterKey) {
		transporter = nodemailer.createTransport({
			host: config.smtpHost!,
			port: config.smtpPort,
			secure: config.smtpSecure,
			auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPassword ?? '' } : undefined,
			connectionTimeout: 15_000,
			greetingTimeout: 15_000,
			socketTimeout: 30_000
		});
		transporterKey = key;
	}
	return transporter;
}

/**
 * Sends one email through the configured SMTP server. Throws when email is
 * not configured or the server rejects the message; callers decide whether
 * that is fatal (verification) or retried later (digests).
 */
export async function sendEmail(mail: OutgoingEmail): Promise<void> {
	if (!config.emailEnabled) throw new Error('Email is not configured (set SMTP_HOST and EMAIL_FROM)');
	await getTransporter().sendMail({
		from: config.emailFrom!,
		to: mail.to,
		subject: mail.subject,
		text: mail.text,
		html: mail.html
	});
}

/** Connects to the SMTP server once so misconfiguration shows up in the startup log. */
export async function checkEmailTransport(): Promise<{ ok: boolean; error?: string }> {
	if (!config.emailEnabled) return { ok: false, error: 'not configured' };
	try {
		await getTransporter().verify();
		return { ok: true };
	} catch (err) {
		return { ok: false, error: formatEmailError(err) };
	}
}

/** `host:port (mode)` for logs and the test email, e.g. `smtp.example.com:587 (STARTTLS)`. */
export function describeEmailTransport(): string {
	return `${config.smtpHost}:${config.smtpPort} (${config.smtpSecure ? 'TLS' : 'STARTTLS'}${config.smtpUser ? `, user ${config.smtpUser}` : ', no auth'})`;
}

export interface TestEmailResult {
	ok: boolean;
	/** Server reply to the final command when accepted, e.g. `250 2.0.0 OK`. */
	response?: string;
	/** Human readable failure: error code, SMTP command, server reply and message. */
	error?: string;
}

/** Turns nodemailer/socket errors into one line with everything useful for diagnosing SMTP setups. */
export function formatEmailError(err: unknown): string {
	if (!(err instanceof Error)) return String(err);
	const e = err as Error & { code?: string; command?: string; response?: string; responseCode?: number };
	const parts: string[] = [];
	if (e.code) parts.push(e.code);
	if (e.command) parts.push(`during ${e.command}`);
	if (e.response) parts.push(`server said: ${e.response.trim()}`);
	else if (e.responseCode) parts.push(`server replied ${e.responseCode}`);
	const prefix = parts.length ? `${parts.join(', ')} — ` : '';
	return prefix + e.message;
}

/**
 * Sends the test message from the account page. Never throws: the outcome is
 * returned so the UI can show the server's reply or the failure verbatim.
 */
export async function sendTestEmail(mail: OutgoingEmail): Promise<TestEmailResult> {
	if (!config.emailEnabled) return { ok: false, error: 'Email is not configured (set SMTP_HOST and EMAIL_FROM)' };
	try {
		const info = await getTransporter().sendMail({
			from: config.emailFrom!,
			to: mail.to,
			subject: mail.subject,
			text: mail.text,
			html: mail.html
		});
		if (info.rejected?.length) {
			return { ok: false, error: `The server rejected the recipient ${info.rejected.join(', ')}: ${info.response}` };
		}
		return { ok: true, response: info.response };
	} catch (err) {
		return { ok: false, error: formatEmailError(err) };
	}
}
