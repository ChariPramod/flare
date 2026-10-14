import { describe, expect, it } from 'vitest';
import { schedule, MailError } from '../../packages/mail/src/validation.js';
import examples from './cases/scheduling.json';
import { cases } from './helpers.js';

describe('Scheduling behavior evals', () => {
  for (const example of cases(examples)) {
    it(`${example.id}: ${example.criterion}`, () => {
      const now = new Date(example.now);
      const evaluate = () => schedule(example.input, now).toISOString();
      if (example.error !== undefined) {
        expect(evaluate, example.id).toThrow(example.error);
        expect(evaluate, example.id).toThrow(MailError);
      } else {
        expect(evaluate(), example.id).toBe(example.expected);
      }
      expect(now.toISOString(), `${example.id}: preserve the reference clock`).toBe(example.now);
    });
  }
});
