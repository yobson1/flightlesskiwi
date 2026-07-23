import winston from 'winston';
import path from 'path';

const addCallerInfo = winston.format((info) => {
	const stack = new Error().stack!;
	const stackLines = stack.split('\n');

	const callerLine = stackLines.find(
		(line) =>
			(line.includes('.ts') || line.includes('.js')) &&
			!line.includes('logger.ts') &&
			!line.includes('node_modules')
	);

	if (callerLine) {
		// Extract file path and line number
		const match =
			callerLine.match(/\((.+):(\d+):(\d+)\)/) || callerLine.match(/at (.+):(\d+):(\d+)/);
		if (match) {
			const [, filePath, lineNumber] = match;
			if (filePath && lineNumber) {
				const fileName = path.basename(filePath);
				info.caller = `${fileName}:${lineNumber}`;
			}
		}
	}

	return info;
});

const log_level = process.env.NODE_ENV === 'production' ? 'info' : 'debug';
const logger = winston.createLogger({
	level: log_level,
	format: winston.format.combine(
		addCallerInfo(),
		winston.format.timestamp({
			format: 'YYYY-MM-DD HH:mm:ss'
		}),
		winston.format.errors({ stack: true }),
		winston.format.colorize({ all: true }),
		winston.format.printf(({ timestamp, level, message, caller, stack }) => {
			const callerInfo = caller ? `[${caller}]` : '';
			const baseMessage = `${timestamp} ${level} ${callerInfo} ${message}`;
			return stack ? `${baseMessage}\n${stack}` : baseMessage;
		})
	),
	transports: [
		new winston.transports.Console({
			handleExceptions: true,
			handleRejections: true
		})
	]
});
logger.info(`Logger initialized with level ${log_level}`);

// Export logger and convenience methods
export default logger;
export const log = logger.info.bind(logger);
export const debug = logger.debug.bind(logger);
export const info = logger.info.bind(logger);
export const warn = logger.warn.bind(logger);
export const error = logger.error.bind(logger);
