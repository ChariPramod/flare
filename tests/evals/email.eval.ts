import { describe, expect, it } from 'vitest';
import { emailSchema, recipients } from '../../packages/mail/src/validation.js';
import examples from './cases/email.json';
import { cases } from './helpers.js';

describe('Email acceptance behavior evals', () => {
  for (const example of cases(examples)) {
    it(`${example.id}: ${example.criterion}`, () => {
      const evaluate = () => recipients(emailSchema.parse(example.input));
      if (example.error !== undefined) {
        expect(evaluate, example.id).toThrow(example.error);
      } else {
        expect(evaluate(), example.id).toEqual(example.expected);
      }
    });
  }
});
