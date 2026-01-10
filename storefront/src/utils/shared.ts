// ============================================================================
// LOGGER (Minimal, production-safe)
// ============================================================================
export const Log = {
	enabled: true, // Always enabled for debugging
	error: (msg: string, data?: LoggableData): void => {
		if (Log.enabled) console.error('[AFS]', msg, data || '');
	},
	warn: (msg: string, data?: LoggableData): void => {
		if (Log.enabled) console.warn('[AFS]', msg, data || '');
	},
	info: (msg: string, data?: LoggableData): void => {
		if (Log.enabled) console.info('[AFS]', msg, data || '');
	},
	debug: (msg: string, data?: LoggableData): void => {
		if (Log.enabled) console.debug('[AFS]', msg, data || '');
	},
	log: (msg: string, ...args: LoggableData[]): void => {
		if (Log.enabled) console.log(msg, ...args);
	},
	init: (enabled?: boolean): void => {
		Log.enabled = enabled !== false;
		Log.log(
			"%c" + "Advanced Filter & Search initialized",
			"color: #00c853;" +
			"font-size: 20px;" +
			"font-weight: bold;" +
			"background: #0b1e13;" +
			"padding: 10px 15px;" +
			"border-radius: 6px;" +
			"font-family: Arial, sans-serif;"
		);
	}
};