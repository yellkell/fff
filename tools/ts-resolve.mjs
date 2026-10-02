/**
 * Lets Node (with --experimental-strip-types) load the game's own source:
 * it imports its siblings as `./x.js`, the way Vite and TypeScript want,
 * but on disk they're `./x.ts`. A `.js` that isn't there resolves to the
 * `.ts` beside it.
 *
 *   node --experimental-strip-types --import ./tools/ts-resolve.mjs tools/duel-check.mjs
 */

import { register } from 'node:module';

register(
  'data:text/javascript,' +
    encodeURIComponent(`
      import { existsSync } from 'node:fs';
      import { fileURLToPath } from 'node:url';
      export async function resolve(spec, ctx, next) {
        if (spec.startsWith('.') && spec.endsWith('.js') && ctx.parentURL?.startsWith('file:')) {
          const js = new URL(spec, ctx.parentURL);
          if (!existsSync(fileURLToPath(js))) return next(spec.slice(0, -3) + '.ts', ctx);
        }
        return next(spec, ctx);
      }
    `),
  import.meta.url,
);
