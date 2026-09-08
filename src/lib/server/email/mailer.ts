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
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}
