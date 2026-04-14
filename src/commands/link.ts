import { existsSync } from "node:fs";
import { Command } from "commander";
import { getContext } from "../context.js";
import { handleError } from "../errors.js";
import { commitExists, resolveHEAD } from "../git.js";
import { readTicketByPrefix, writeTicket } from "../ticket.js";

const VALID_RELATIONS = ["depends_on", "blocks", "related", "duplicates"];

export function registerLink(program: Command): void {
	program
		.command("link <id>")
		.description("Link a ticket to a commit, file, or another ticket")
		.requiredOption(
			"--to <target>",
			"target: ticket ID prefix, git commit SHA, or file path",
		)
		.option(
			"--relation <type>",
			"for ticket targets: depends_on|blocks|related|duplicates",
			"related",
		)
		.option("--as <alias>", "for file links: optional note")
		.action((id: string, opts) => {
			try {
				const ctx = getContext(true);
				const { repoRoot } = ctx;

				const ticket = readTicketByPrefix(repoRoot, id);
				const target = opts.to as string;
				const relation = opts.relation as string;

				if (!VALID_RELATIONS.includes(relation)) {
					console.error(
						`Error: invalid relation '${relation}'. Must be one of: ${VALID_RELATIONS.join(", ")}`,
					);
					process.exit(1);
				}

				// Disambiguate target
				let resolvedType: "ticket" | "commit" | "file";
				let resolvedTarget: string = target;

				// 1. Try as ticket
				try {
					const targetTicket = readTicketByPrefix(repoRoot, target);
					resolvedType = "ticket";
					resolvedTarget = targetTicket.id;
				} catch {
					// 2. Try as commit
					if (commitExists(target, repoRoot)) {
						resolvedType = "commit";
					} else if (existsSync(target)) {
						// 3. Try as file path
						resolvedType = "file";
					} else {
						console.error(
							`Error: Cannot resolve target '${target}' as ticket, commit, or file`,
						);
						process.exit(1);
					}
				}

				if (!ticket.relationships) ticket.relationships = {};

				if (resolvedType === "ticket") {
					if (relation === "duplicates") {
						ticket.relationships.duplicates = resolvedTarget;
					} else {
						const key = relation as "depends_on" | "blocks" | "related";
						if (!ticket.relationships[key]) ticket.relationships[key] = [];
						if (!ticket.relationships[key]?.includes(resolvedTarget)) {
							ticket.relationships[key]?.push(resolvedTarget);
						}
					}
				} else if (resolvedType === "commit") {
					if (!ticket.relationships.linked_commits)
						ticket.relationships.linked_commits = [];
					if (!ticket.relationships.linked_commits.includes(target)) {
						ticket.relationships.linked_commits.push(target);
					}
				} else {
					// file
					if (!ticket.files) ticket.files = [];
					let head: string | undefined;
					try {
						head = resolveHEAD(repoRoot);
					} catch {
						head = undefined;
					}
					const fileRef: { path: string; commit?: string; note?: string } = {
						path: target,
					};
					if (head) fileRef.commit = head;
					if (opts.as) fileRef.note = opts.as as string;
					ticket.files.push(fileRef);
				}

				ticket.updated_at = new Date().toISOString();
				writeTicket(repoRoot, ticket);

				console.log(`Linked ${ticket.id} → ${resolvedType} ${resolvedTarget}`);
			} catch (err) {
				handleError(err);
			}
		});
}
