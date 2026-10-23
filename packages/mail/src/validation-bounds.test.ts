import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { z as esm } from 'zod';

const require = createRequire(new URL('../package.json', import.meta.url));
const cjs = (require('zod') as { z: typeof esm }).z;

// Exercise both published entrypoints: the API and package consumers use both.
for (const [entrypoint, z] of [
  ['ESM', esm],
  ['CommonJS', cjs],
] as const) {
  describe(`bounded validation (${entrypoint})`, () => {
    it('rejects an oversized nested array before parsing any children', () => {
      let visited = 0;
      const child = z.preprocess((value) => {
        visited++;
        return value;
      }, z.string());
      const schema = z.object({ recipients: z.array(child).max(3, 'Choose at most three') });
      const result = schema.safeParse({ recipients: new Array(100_000).fill(null) });
      expect(visited).toBe(0);
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues).toEqual([
          expect.objectContaining({
            code: 'too_big',
            path: ['recipients'],
            maximum: 3,
            message: 'Choose at most three',
          }),
        ]);
    });

    it('enforces exact upper lengths before child or collection refinements', () => {
      let visited = 0;
      const schema = z
        .array(
          z.string().refine(() => {
            visited++;
            return true;
          }),
        )
        .length(2)
        .refine(() => {
          visited++;
          return true;
        });
      const result = schema.safeParse(['a', 'b', 'c']);
      expect(result.success).toBe(false);
      expect(visited).toBe(0);
      if (!result.success)
        expect(result.error.issues).toEqual([
          expect.objectContaining({ code: 'too_big', exact: true, maximum: 2 }),
        ]);
    });

    it('does not fan out asynchronous validators for oversized arrays or sets', async () => {
      let visited = 0;
      const child = z.string().refine(async () => {
        visited++;
        return true;
      });
      expect((await z.array(child).max(1).safeParseAsync(['a', 'b'])).success).toBe(false);
      expect(
        (
          await z
            .set(child)
            .max(1)
            .safeParseAsync(new Set(['a', 'b']))
        ).success,
      ).toBe(false);
      expect(visited).toBe(0);
    });

    it('preserves valid boundary values, transformations, and normal invalid-child errors', async () => {
      const schema = z
        .array(z.string().transform((value) => value.trim()))
        .min(1)
        .max(2);
      expect(schema.parse([' a ', ' b '])).toEqual(['a', 'b']);
      expect(await schema.parseAsync([' a '])).toEqual(['a']);
      expect(
        z
          .set(z.string())
          .max(2)
          .parse(new Set(['a', 'b'])),
      ).toEqual(new Set(['a', 'b']));
      const invalid = schema.safeParse([null]);
      expect(invalid.success).toBe(false);
      if (!invalid.success)
        expect(invalid.error.issues[0]).toMatchObject({ code: 'invalid_type', path: [0] });
      expect(schema.safeParse([]).success).toBe(false);
    });
  });
}
