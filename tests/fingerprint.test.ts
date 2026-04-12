import { describe, it, expect } from 'vitest';
import { normalizeTraceback, tracebackFingerprint } from '../src/fingerprint.js';

describe('normalizeTraceback', () => {
  it('strips memory addresses', () => {
    const raw = 'error at 0xDEADBEEF in module 0x7fff1234abcd';
    const normalized = normalizeTraceback(raw);
    expect(normalized).not.toContain('0xDEADBEEF');
    expect(normalized).not.toContain('0x7fff1234abcd');
    expect(normalized).toContain('0xADDR');
  });

  it('strips ISO timestamps', () => {
    const raw = 'Exception at 2024-03-15T14:23:01.456Z in handler';
    const normalized = normalizeTraceback(raw);
    expect(normalized).not.toContain('2024-03-15T14:23:01.456Z');
    expect(normalized).toContain('TIMESTAMP');
  });

  it('strips time-only values', () => {
    const raw = 'Error logged at 14:23:01.456 by process';
    const normalized = normalizeTraceback(raw);
    expect(normalized).not.toContain('14:23:01.456');
    expect(normalized).toContain('TIME');
  });

  it('strips PIDs in key=value format', () => {
    const raw = 'Process failed pid=12345 exit=1';
    const normalized = normalizeTraceback(raw);
    expect(normalized).not.toContain('12345');
    expect(normalized).toContain('pid=PID');
  });

  it('strips PIDs in key: value format', () => {
    const raw = 'Process info: pid: 99999';
    const normalized = normalizeTraceback(raw);
    expect(normalized).not.toContain('99999');
    expect(normalized).toContain('pid: PID');
  });

  it('normalizes Linux home directories', () => {
    const raw = 'at /home/alice/projects/app/src/main.ts:42';
    const normalized = normalizeTraceback(raw);
    expect(normalized).not.toContain('/home/alice');
    expect(normalized).toContain('/home/USER');
  });

  it('normalizes macOS home directories', () => {
    const raw = 'at /Users/bob/dev/app/index.ts:10';
    const normalized = normalizeTraceback(raw);
    expect(normalized).not.toContain('/Users/bob');
    expect(normalized).toContain('/Users/USER');
  });

  it('trims whitespace', () => {
    const raw = '  TypeError: cannot read property  ';
    const normalized = normalizeTraceback(raw);
    expect(normalized).toBe('TypeError: cannot read property');
  });
});

describe('tracebackFingerprint', () => {
  it('returns a hex string', () => {
    const fp = tracebackFingerprint('TypeError: foo');
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('same traceback with different memory addresses → same fingerprint', () => {
    const t1 = 'Error at 0xDEADBEEF in foo() at /home/alice/src/app.ts:10';
    const t2 = 'Error at 0x12345678 in foo() at /home/bob/src/app.ts:10';
    expect(tracebackFingerprint(t1)).toBe(tracebackFingerprint(t2));
  });

  it('same traceback with different PIDs → same fingerprint', () => {
    const t1 = 'Crash pid=1111 in worker';
    const t2 = 'Crash pid=9999 in worker';
    expect(tracebackFingerprint(t1)).toBe(tracebackFingerprint(t2));
  });

  it('same traceback with different timestamps → same fingerprint', () => {
    const t1 = 'Error at 2024-01-01T00:00:00Z';
    const t2 = 'Error at 2025-12-31T23:59:59Z';
    expect(tracebackFingerprint(t1)).toBe(tracebackFingerprint(t2));
  });

  it('different tracebacks → different fingerprints', () => {
    const t1 = 'TypeError: cannot read property of undefined';
    const t2 = 'RangeError: maximum call stack size exceeded';
    expect(tracebackFingerprint(t1)).not.toBe(tracebackFingerprint(t2));
  });

  it('is deterministic', () => {
    const raw = 'Error: something failed at /home/user/app.ts:42 pid=100';
    expect(tracebackFingerprint(raw)).toBe(tracebackFingerprint(raw));
  });
});
