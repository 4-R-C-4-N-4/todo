// Phase 3: Configuration loading and management

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "./types.js";

export const DEFAULT_CONFIG: Config = {
	project: { name: "" },
	behavior: { commit_prefix: "todo:" },
	intake: {
		dedup_strategy: "fingerprint",
		scan_patterns: ["TODO", "FIXME", "HACK", "XXX"],
		scan_exclude: [
			".todo",
			"node_modules",
			".venv",
			"__pycache__",
			".git",
			"dist",
			"build",
		],
	},
	display: { id_length: 8, date_format: "relative" },
};

function deepMerge<T extends Record<string, unknown>>(
	base: T,
	override: Partial<T>,
): T {
	const result = { ...base } as T;
	for (const key of Object.keys(override) as (keyof T)[]) {
		const overrideVal = override[key];
		const baseVal = base[key];
		if (
			overrideVal !== null &&
			overrideVal !== undefined &&
			typeof overrideVal === "object" &&
			!Array.isArray(overrideVal) &&
			typeof baseVal === "object" &&
			baseVal !== null &&
			!Array.isArray(baseVal)
		) {
			result[key] = deepMerge(
				baseVal as Record<string, unknown>,
				overrideVal as Record<string, unknown>,
			) as T[keyof T];
		} else if (overrideVal !== undefined) {
			result[key] = overrideVal as T[keyof T];
		}
	}
	return result;
}

export function loadConfig(repoRoot: string): Config {
	const configPath = join(repoRoot, ".todo", "config.json");
	if (!existsSync(configPath)) {
		return DEFAULT_CONFIG;
	}
	try {
		const raw = readFileSync(configPath, "utf8");
		const parsed = JSON.parse(raw) as Partial<Config>;
		return deepMerge(
			DEFAULT_CONFIG as Record<string, unknown>,
			parsed as Record<string, unknown>,
		) as Config;
	} catch {
		return DEFAULT_CONFIG;
	}
}

export function getTodoDir(repoRoot: string): string {
	return join(repoRoot, ".todo");
}

export function ensureTodoDir(repoRoot: string): void {
	const base = getTodoDir(repoRoot);
	mkdirSync(join(base, "open"), { recursive: true });
	mkdirSync(join(base, "done"), { recursive: true });
}

export function getIdLength(config: Config): number {
	return config.display?.id_length ?? 8;
}

export function getCommitPrefix(config: Config): string {
	return config.behavior?.commit_prefix ?? "todo:";
}
