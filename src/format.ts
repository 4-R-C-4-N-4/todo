// Output formatting helpers

import type { Ticket } from "./types.js";

/**
 * Format an ISO date string as a relative time string.
 * e.g. "2 hours ago", "3 days ago"
 */
export function formatRelativeDate(isoString: string): string {
	const now = Date.now();
	const then = new Date(isoString).getTime();
	const diffMs = now - then;
	const diffSec = Math.floor(diffMs / 1000);

	if (diffSec < 60) return `${diffSec} second${diffSec !== 1 ? "s" : ""} ago`;
	const diffMin = Math.floor(diffSec / 60);
	if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
	const diffHour = Math.floor(diffMin / 60);
	if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? "s" : ""} ago`;
	const diffDay = Math.floor(diffHour / 24);
	if (diffDay < 30) return `${diffDay} day${diffDay !== 1 ? "s" : ""} ago`;
	const diffMonth = Math.floor(diffDay / 30);
	if (diffMonth < 12)
		return `${diffMonth} month${diffMonth !== 1 ? "s" : ""} ago`;
	const diffYear = Math.floor(diffMonth / 12);
	return `${diffYear} year${diffYear !== 1 ? "s" : ""} ago`;
}

/**
 * Format ticket header line: === <id> [<type>] <state> ===
 */
export function formatTicketHeader(ticket: Ticket): string {
	return `=== ${ticket.id} [${ticket.type}] ${ticket.state} ===`;
}

/**
 * Format a one-line ticket summary for list view.
 */
export function formatTicketSummary(ticket: Ticket): string {
	return `${ticket.id}  ${ticket.type}  ${ticket.state}  ${ticket.summary}`;
}
