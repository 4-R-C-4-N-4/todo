import { createHash } from "node:crypto";

/**
 * Normalize a traceback: strip memory addresses, timestamps, PIDs, absolute paths.
 * Returns normalized string suitable for hashing.
 */
export function normalizeTraceback(raw: string): string {
	return raw
		.replace(/0x[0-9a-fA-F]+/g, "0xADDR") // memory addresses
		.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, "TIMESTAMP") // ISO timestamps
		.replace(/\d{2}:\d{2}:\d{2}(\.\d+)?/g, "TIME") // time-only
		.replace(/\bpid=\d+\b/gi, "pid=PID") // PIDs (key=value)
		.replace(/\bpid:\s*\d+\b/gi, "pid: PID") // PIDs (key: value)
		.replace(/\/home\/[^\s/]+/g, "/home/USER") // Linux home dirs
		.replace(/\/Users\/[^\s/]+/g, "/Users/USER") // macOS home dirs
		.trim();
}

/**
 * Compute a traceback fingerprint (sha256 of normalized traceback, hex).
 */
export function tracebackFingerprint(raw: string): string {
	const normalized = normalizeTraceback(raw);
	return createHash("sha256").update(normalized).digest("hex");
}
