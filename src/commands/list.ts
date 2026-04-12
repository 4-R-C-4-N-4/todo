import { Command } from 'commander';
import { getContext } from '../context.js';
import { listTickets, TERMINAL_STATES } from '../ticket.js';
import type { Ticket, State, TicketType } from '../types.js';

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 3) + '...';
}

function padEnd(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

function formatTable(tickets: Ticket[]): string {
  const headers = ['ID', 'TYPE', 'STATE', 'SUMMARY', 'BRANCH'];
  const rows = tickets.map(t => [
    t.id,
    t.type,
    t.state,
    truncate(t.summary, 50),
    (t.state === 'active' || t.state === 'blocked') && t.work?.branch ? t.work.branch : '',
  ]);

  const colWidths = headers.map((h, i) => {
    const maxData = rows.reduce((max, row) => Math.max(max, row[i].length), 0);
    return Math.max(h.length, maxData);
  });

  const header = headers.map((h, i) => padEnd(h, colWidths[i])).join('  ');
  const divider = colWidths.map(w => '-'.repeat(w)).join('  ');
  const dataRows = rows.map(row => row.map((cell, i) => padEnd(cell, colWidths[i])).join('  '));

  return [header, divider, ...dataRows].join('\n');
}

export function registerList(program: Command): void {
  program
    .command('list')
    .description('List tickets')
    .option('--state <state>', 'filter by state')
    .option('--type <type>', 'filter by ticket type')
    .option('--tag <tag>', 'filter by tag')
    .option('--file <path>', 'filter by file path')
    .option('--sort <field>', 'sort by: updated (default), created, type, state', 'updated')
    .option('--json', 'output JSON array')
    .option('--limit <n>', 'max tickets to show')
    .action((opts) => {
      const ctx = getContext(true);
      const { repoRoot } = ctx;

      const stateFilter = opts.state as State | undefined;
      const dir = stateFilter && TERMINAL_STATES.includes(stateFilter) ? 'done' : 'open';

      const filters: Parameters<typeof listTickets>[2] = {};
      if (stateFilter) filters.state = stateFilter;
      if (opts.type) filters.type = opts.type as TicketType;
      if (opts.tag) filters.tag = opts.tag as string;
      if (opts.file) filters.file = opts.file as string;

      let tickets = listTickets(repoRoot, dir, Object.keys(filters).length > 0 ? filters : undefined);

      // Sort
      const sortField = (opts.sort as string) ?? 'updated';
      tickets.sort((a, b) => {
        switch (sortField) {
          case 'created': return a.created_at.localeCompare(b.created_at);
          case 'type': return a.type.localeCompare(b.type);
          case 'state': return a.state.localeCompare(b.state);
          default: return b.updated_at.localeCompare(a.updated_at); // updated desc
        }
      });

      // Limit
      if (opts.limit) {
        const n = parseInt(opts.limit as string, 10);
        if (!isNaN(n)) tickets = tickets.slice(0, n);
      }

      if (opts.json) {
        console.log(JSON.stringify(tickets, null, 2));
      } else {
        if (tickets.length === 0) {
          console.log('No tickets found.');
          return;
        }
        console.log(formatTable(tickets));
      }
    });
}
