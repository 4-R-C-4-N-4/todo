// Shared error handler for all CLI commands
import { NotFoundError, AmbiguousIdError } from './ticket.js';
import { GitError } from './git.js';

export function handleError(err: unknown): never {
  if (err instanceof NotFoundError) {
    console.error(`Error: ticket not found: ${err.id}`);
    process.exit(2);
  }
  if (err instanceof AmbiguousIdError) {
    console.error(`Ambiguous ID '${err.prefix}': matches ${err.matches.join(', ')}`);
    process.exit(1);
  }
  if (err instanceof GitError) {
    console.error(`Git error: ${err.message}`);
    process.exit(3);
  }
  if (err instanceof Error) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
  console.error('Unknown error');
  process.exit(1);
}
