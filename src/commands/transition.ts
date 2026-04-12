import { Command } from 'commander';
import { getContext } from '../context.js';
import { readTicketByPrefix, writeTicket } from '../ticket.js';
import { validateTransition, applyTransition } from '../state.js';
import { handleError } from '../errors.js';
import type { State } from '../types.js';

const VALID_STATES: State[] = ['open', 'active', 'blocked', 'done', 'wontfix', 'duplicate'];

export function registerTransition(program: Command): void {
  program
    .command('transition <id> <state>')
    .description('Transition ticket state')
    .option('--commit <sha>', 'resolution commit')
    .option('--test <file::func>', 'test file and function (colon-separated)')
    .option('--note <text>', 'resolution note')
    .option('--depends-on <id>', 'set dependency')
    .option('--duplicate-of <id>', 'mark as duplicate')
    .action((id: string, state: string, opts) => {
      const ctx = getContext(true);
      const { repoRoot } = ctx;

      if (!VALID_STATES.includes(state as State)) {
        console.error(`Error: invalid state '${state}'. Must be one of: ${VALID_STATES.join(', ')}`);
        process.exit(1);
      }

      try {
        const ticket = readTicketByPrefix(repoRoot, id);
        const fromState = ticket.state;

        // Parse --test as "file::func" or "file"
        let testFile: string | undefined;
        let testFunction: string | undefined;
        if (opts.test) {
          const parts = (opts.test as string).split('::');
          testFile = parts[0];
          testFunction = parts[1];
        }

        const params = {
          commit: opts.commit as string | undefined,
          test_file: testFile,
          test_function: testFunction,
          note: opts.note as string | undefined,
          depends_on: opts.dependsOn as string | undefined,
          duplicate_of: opts.duplicateOf as string | undefined,
        };

        try {
          validateTransition(ticket, state as State, params, repoRoot);
        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
          process.exit(1);
        }

        const updated = applyTransition(ticket, state as State, params, repoRoot);
        writeTicket(repoRoot, updated);
        console.log(`Transitioned ${updated.id}: ${fromState} → ${state}`);

      } catch (err) {
        handleError(err);
      }
    });
}
