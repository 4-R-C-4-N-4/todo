import { Command } from "commander";
import { getContext } from "../context.js";
import { handleError } from "../errors.js";
import { readTicketByPrefix, writeTicket } from "../ticket.js";
import type { TicketType } from "../types.js";

const VALID_TYPES: TicketType[] = [
	"bug",
	"feature",
	"refactor",
	"chore",
	"debt",
];

export function registerEdit(program: Command): void {
	program
		.command("edit <id>")
		.description("Edit ticket fields")
		.option("--summary <text>", "new summary")
		.option("--description <text>", "new description")
		.option("--type <type>", "new type")
		.option("--tags <tags>", "replace all tags (comma-separated)")
		.option("--add-tag <tag>", "add one tag")
		.option("--rm-tag <tag>", "remove one tag")
		.option("--parent <id>", "reparent ticket under a different parent")
		.action((id: string, opts) => {
			const ctx = getContext(true);
			const { repoRoot } = ctx;

			try {
				const ticket = readTicketByPrefix(repoRoot, id);

				let changed = false;

				if (opts.parent !== undefined) {
					let newParent: ReturnType<typeof readTicketByPrefix>;
					try {
						newParent = readTicketByPrefix(repoRoot, opts.parent as string);
					} catch {
						console.error(
							`Error: parent ticket '${opts.parent}' not found`,
						);
						process.exit(1);
					}
					if (newParent.id === ticket.id) {
						console.error("Error: a ticket cannot be its own parent");
						process.exit(1);
					}

					const oldParentId = ticket.relationships?.parent;
					if (oldParentId !== newParent.id) {
						const now = new Date().toISOString();

						if (oldParentId) {
							try {
								const oldParent = readTicketByPrefix(repoRoot, oldParentId);
								if (oldParent.relationships?.children) {
									const before = oldParent.relationships.children.length;
									oldParent.relationships.children =
										oldParent.relationships.children.filter(
											(c) => c !== ticket.id,
										);
									if (oldParent.relationships.children.length !== before) {
										oldParent.updated_at = now;
										writeTicket(repoRoot, oldParent);
									}
								}
							} catch {
								// old parent missing — nothing to detach from
							}
						}

						if (!newParent.relationships) newParent.relationships = {};
						if (!newParent.relationships.children)
							newParent.relationships.children = [];
						if (!newParent.relationships.children.includes(ticket.id)) {
							newParent.relationships.children.push(ticket.id);
							newParent.updated_at = now;
							writeTicket(repoRoot, newParent);
						}

						if (!ticket.relationships) ticket.relationships = {};
						ticket.relationships.parent = newParent.id;
						changed = true;
					}
				}

				if (opts.summary !== undefined) {
					ticket.summary = opts.summary as string;
					changed = true;
				}

				if (opts.description !== undefined) {
					ticket.description = opts.description as string;
					changed = true;
				}

				if (opts.type !== undefined) {
					const newType = opts.type as string;
					if (!VALID_TYPES.includes(newType as TicketType)) {
						console.error(
							`Error: invalid type '${newType}'. Must be one of: ${VALID_TYPES.join(", ")}`,
						);
						process.exit(1);
					}
					ticket.type = newType as TicketType;
					changed = true;
				}

				if (opts.tags !== undefined) {
					ticket.tags = (opts.tags as string)
						.split(",")
						.map((t) => t.trim())
						.filter((t) => t.length > 0);
					changed = true;
				}

				if (opts.addTag !== undefined) {
					if (!ticket.tags) ticket.tags = [];
					const tag = opts.addTag as string;
					if (!ticket.tags.includes(tag)) {
						ticket.tags.push(tag);
						changed = true;
					}
				}

				if (opts.rmTag !== undefined) {
					const tag = opts.rmTag as string;
					if (ticket.tags) {
						ticket.tags = ticket.tags.filter((t) => t !== tag);
						changed = true;
					}
				}

				if (!changed) {
					console.log("No changes made.");
					return;
				}

				ticket.updated_at = new Date().toISOString();
				writeTicket(repoRoot, ticket);
				console.log(`Updated ticket ${ticket.id}`);
			} catch (err) {
				handleError(err);
			}
		});
}
