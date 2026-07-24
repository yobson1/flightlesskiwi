import {
	SMTP_FROM,
	SMTP_HOST,
	SMTP_PASSWORD,
	SMTP_PORT,
	SMTP_SECURE,
	SMTP_USER
} from '$env/static/private';
import nodemailer from 'nodemailer';

export const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
	if (!SMTP_HOST || !SMTP_FROM) {
		throw new Error('SMTP_HOST and SMTP_FROM must be configured');
	}
	if (Boolean(SMTP_USER) !== Boolean(SMTP_PASSWORD)) {
		throw new Error('SMTP_USER and SMTP_PASSWORD must be configured together');
	}
	const port = Number.parseInt(SMTP_PORT || '587', 10);
	if (!Number.isInteger(port) || port < 1 || port > 65_535) {
		throw new Error('SMTP_PORT must be a valid port');
	}
	transporter ??= nodemailer.createTransport({
		host: SMTP_HOST,
		port,
		secure: SMTP_SECURE === 'true',
		auth:
			SMTP_USER || SMTP_PASSWORD
				? {
						user: SMTP_USER,
						pass: SMTP_PASSWORD
					}
				: undefined
	});
	return transporter;
}

export async function sendVerificationEmail(email: string, code: string): Promise<void> {
	await sendCodeEmail(email, code, {
		subject: 'Verify your FlightlessKiwi email',
		codeDescription: 'verification code'
	});
}

export async function sendPasswordResetEmail(email: string, code: string): Promise<void> {
	await sendCodeEmail(email, code, {
		subject: 'Reset your FlightlessKiwi password',
		codeDescription: 'password reset code'
	});
}

function formatDuration(durationMs: number): string {
	const units = [
		{ label: 'hour', milliseconds: 60 * 60 * 1000 },
		{ label: 'minute', milliseconds: 60 * 1000 },
		{ label: 'second', milliseconds: 1000 }
	] as const;
	for (const unit of units) {
		if (durationMs % unit.milliseconds === 0) {
			const value = durationMs / unit.milliseconds;
			return `${value} ${unit.label}${value === 1 ? '' : 's'}`;
		}
	}
	return `${durationMs} milliseconds`;
}

async function sendCodeEmail(
	email: string,
	code: string,
	options: { subject: string; codeDescription: string }
): Promise<void> {
	const lifetime = formatDuration(EMAIL_CODE_TTL_MS);
	await getTransporter().sendMail({
		from: SMTP_FROM,
		to: email,
		subject: options.subject,
		text: `Your ${options.codeDescription} is ${code}. It expires in ${lifetime}.`
	});
}
