import { Command } from 'commander';
import { getContext } from '../context.js';
import { listTickets, TERMINAL_STATES } from '../ticket.js';
import type { State, TicketType } from '../types.js';

export function registerExport(program: Command): void {
  program
    .command('export')
    .description('Export tickets to stdout as JSON')
    .option('--state <state>', 'filter by state')
    .option('--type <type>', 'filter by ticket type')
    .action((opts) => {
      const ctx = getContext(true);
      const { repoRoot } = ctx;

      const stateFilter = opts.state as State | undefined;
      const dir = stateFilter && TERMINAL_STATES.includes(stateFilter) ? 'done' : 'open';

      const filters: { state?: State; type?: TicketType } = {};
      if (stateFilter) filters.state = stateFilter;
      if (opts.type) filters.type = opts.type as TicketType;

      const tickets = listTickets(repoRoot, dir, Object.keys(filters).length > 0 ? filters : undefined);
      console.log(JSON.stringify(tickets, null, 2));
    });
}
