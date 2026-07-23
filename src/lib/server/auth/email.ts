import {
	SMTP_FROM,
	SMTP_HOST,
	SMTP_PASSWORD,
	SMTP_PORT,
	SMTP_SECURE,
	SMTP_USER
} from '$env/static/private';
import nodemailer from 'nodemailer';

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
	await getTransporter().sendMail({
		from: SMTP_FROM,
		to: email,
		subject: 'Verify your FlightlessKiwi email',
		text: `Your verification code is ${code}. It expires in 10 minutes.`
	});
}

export async function sendPasswordResetEmail(email: string, code: string): Promise<void> {
	await getTransporter().sendMail({
		from: SMTP_FROM,
		to: email,
		subject: 'Reset your FlightlessKiwi password',
		text: `Your password reset code is ${code}. It expires in 10 minutes.`
	});
}
