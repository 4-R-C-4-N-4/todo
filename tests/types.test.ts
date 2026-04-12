import { describe, it, expect } from 'vitest';
import type { Source, SourceType, TicketType, State, AnalysisType } from '../src/types.js';

describe('types', () => {
  describe('Source discriminated union', () => {
    it('log source has traceback_fingerprint', () => {
      const s: Source = { type: 'log', raw: 'error output', traceback_fingerprint: 'abc123' };
      expect(s.type).toBe('log');
      if (s.type === 'log') {
        expect(s.traceback_fingerprint).toBe('abc123');
      }
    });

    it('test source has test_file and test_function', () => {
      const s: Source = {
        type: 'test',
        raw: 'FAILED',
        test_file: 'tests/foo.test.ts',
        test_function: 'testFoo',
      };
      expect(s.type).toBe('test');
      if (s.type === 'test') {
        expect(s.test_file).toBe('tests/foo.test.ts');
        expect(s.test_function).toBe('testFoo');
      }
    });

    it('agent source has only raw', () => {
      const s: Source = { type: 'agent', raw: 'found issue' };
      expect(s.type).toBe('agent');
      if (s.type === 'agent') {
        expect(s.raw).toBe('found issue');
      }
    });

    it('human source narrowing works', () => {
      const s: Source = { type: 'human' };
      expect(s.type).toBe('human');
      // type narrowing: should not have test_file
      if (s.type === 'human') {
        expect((s as Record<string, unknown>).test_file).toBeUndefined();
      }
    });

    it('comment source narrowing works', () => {
      const s: Source = { type: 'comment', raw: 'TODO: fix this' };
      expect(s.type).toBe('comment');
    });

    it('all source types are valid SourceType values', () => {
      const types: SourceType[] = ['log', 'test', 'agent', 'human', 'comment'];
      expect(types).toHaveLength(5);
    });
  });

  describe('TicketType', () => {
    it('all ticket types are valid', () => {
      const types: TicketType[] = ['bug', 'feature', 'refactor', 'chore', 'debt'];
      expect(types).toHaveLength(5);
    });
  });

  describe('State', () => {
    it('all states are valid', () => {
      const states: State[] = ['open', 'active', 'blocked', 'done', 'wontfix', 'duplicate'];
      expect(states).toHaveLength(6);
    });
  });

  describe('AnalysisType', () => {
    it('all analysis types are valid', () => {
      const types: AnalysisType[] = ['blame', 'hypothesis', 'evidence', 'conclusion'];
      expect(types).toHaveLength(4);
    });
  });
});
