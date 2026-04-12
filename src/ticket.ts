// Phase 4: Ticket I/O and management

import { createHash } from "node:crypto";
import {
	existsSync,
	readdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { SourceType, State, Ticket, TicketType } from "./types.js";

export const TERMINAL_STATES: State[] = ["done", "wontfix", "duplicate"];

export class NotFoundError extends Error {
	constructor(public id: string) {
		super(`Ticket not found: ${id}`);
		this.name = "NotFoundError";
	}
}

export class AmbiguousIdError extends Error {
	constructor(
		public prefix: string,
		public matches: string[],
	) {
		super(`Ambiguous ticket prefix '${prefix}': matches ${matches.join(", ")}`);
		this.name = "AmbiguousIdError";
	}
}

export function generateId(
	sourceType: SourceType,
	rawPayload: string,
	createdAt: string,
	length: number = 8,
): string {
	const hash = createHash("sha256")
		.update(sourceType + rawPayload + createdAt)
		.digest("hex");
	return hash.slice(0, length);
}

function openDir(repoRoot: string): string {
	return join(repoRoot, ".todo", "open");
}

function doneDir(repoRoot: string): string {
	return join(repoRoot, ".todo", "done");
}

export function ticketPath(repoRoot: string, id: string): string {
	const openPath = join(openDir(repoRoot), `${id}.json`);
	if (existsSync(openPath)) return openPath;

	const donePath = join(doneDir(repoRoot), `${id}.json`);
	if (existsSync(donePath)) return donePath;

	throw new NotFoundError(id);
}

export function readTicket(repoRoot: string, id: string): Ticket {
	const path = ticketPath(repoRoot, id);
	const raw = readFileSync(path, "utf8");
	const ticket = JSON.parse(raw) as Ticket;

	// Correct state based on actual directory (directory is truth)
	const inDone = path.includes(`${join(".todo", "done")}`);
	if (inDone && !TERMINAL_STATES.includes(ticket.state)) {
		ticket.state = "done";
	} else if (!inDone && TERMINAL_STATES.includes(ticket.state)) {
		ticket.state = "open";
	}

	return ticket;
}

export function readTicketByPrefix(repoRoot: string, prefix: string): Ticket {
	const allFiles: { dir: "open" | "done"; name: string }[] = [];

	for (const file of readdirSync(openDir(repoRoot))) {
		if (file.endsWith(".json"))
			allFiles.push({ dir: "open" as const, name: file.slice(0, -5) });
	}
	for (const file of readdirSync(doneDir(repoRoot))) {
		if (file.endsWith(".json"))
			allFiles.push({ dir: "done" as const, name: file.slice(0, -5) });
	}

	const matches = allFiles.filter((f) => f.name.startsWith(prefix));

	if (matches.length === 0) throw new NotFoundError(prefix);
	if (matches.length > 1)
		throw new AmbiguousIdError(
			prefix,
			matches.map((m) => m.name),
		);

	return readTicket(repoRoot, matches[0].name);
}

export function writeTicket(repoRoot: string, ticket: Ticket): void {
	const isTerminal = TERMINAL_STATES.includes(ticket.state);
	const targetDir = isTerminal ? doneDir(repoRoot) : openDir(repoRoot);
	const otherDir = isTerminal ? openDir(repoRoot) : doneDir(repoRoot);

	const targetPath = join(targetDir, `${ticket.id}.json`);
	const otherPath = join(otherDir, `${ticket.id}.json`);
	const tmpPath = join(targetDir, `${ticket.id}.tmp`);

	// Atomic write
	writeFileSync(tmpPath, JSON.stringify(ticket, null, 2), "utf8");
	renameSync(tmpPath, targetPath);

	// Remove from wrong directory if it existed there
	if (existsSync(otherPath)) {
		renameSync(otherPath, targetPath);
		// re-write since rename just overwrote our new file — write again
		writeFileSync(tmpPath, JSON.stringify(ticket, null, 2), "utf8");
		renameSync(tmpPath, targetPath);
	}
}

export function moveTicket(
	repoRoot: string,
	id: string,
	fromDir: "open" | "done",
	toDir: "open" | "done",
): void {
	const from = fromDir === "open" ? openDir(repoRoot) : doneDir(repoRoot);
	const to = toDir === "open" ? openDir(repoRoot) : doneDir(repoRoot);
	renameSync(join(from, `${id}.json`), join(to, `${id}.json`));
}

export function listTickets(
	repoRoot: string,
	dir: "open" | "done",
	filters?: {
		state?: State;
		type?: TicketType;
		tag?: string;
		file?: string;
	},
): Ticket[] {
	const directory = dir === "open" ? openDir(repoRoot) : doneDir(repoRoot);
	let files: string[];
	try {
		files = readdirSync(directory).filter((f) => f.endsWith(".json"));
	} catch {
		return [];
	}

	const tickets: Ticket[] = [];
	for (const file of files) {
		try {
			const raw = readFileSync(join(directory, file), "utf8");
			tickets.push(JSON.parse(raw) as Ticket);
		} catch {
			// skip corrupt files
		}
	}

	if (!filters) return tickets;

	return tickets.filter((t) => {
		if (filters.state && t.state !== filters.state) return false;
		if (filters.type && t.type !== filters.type) return false;
		if (filters.tag && !(t.tags ?? []).includes(filters.tag)) return false;
		if (filters.file && !(t.files ?? []).some((f) => f.path === filters.file))
			return false;
		return true;
	});
}
