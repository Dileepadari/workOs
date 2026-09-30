// The two copies of Cherry's wire contract, checked against each other.
//
// `src/lib/cherry.ts` and `supabase/functions/workos/cherry/types.ts` describe
// the same messages. They are duplicated on purpose - the edge function cannot
// import from `src/` and Vite cannot import from a Deno function directory -
// and both files have carried a comment since they were written saying that
// this test keeps them honest.
//
// This test did not exist. Both comments promised a guard that was never
// written, which is worse than admitting there is none: the next person to edit
// one copy reads the comment and believes the other is covered. The types
// happened not to have drifted, which is luck rather than a process.
//
// Comparing the declarations rather than the whole file, because the frontend
// copy legitimately adds pure helpers on top of the shared shapes.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

const FRONTEND = 'src/lib/cherry.ts';
const EDGE = 'supabase/functions/workos/cherry/types.ts';

/**
 * Every exported type, interface and const declaration, keyed by name.
 *
 * Deliberately text, not AST: what matters is that the two files say the same
 * thing, and a one-word difference in a union member is exactly the drift being
 * guarded against.
 */
function declarations(source: string): Map<string, string> {
  const out = new Map<string, string>();
  // A declaration runs from `export <kind> <Name>` to the first line that is
  // neither indented nor a closing brace - which is how every one in these two
  // files is formatted.
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const match = /^export (?:type|interface|const) (\w+)/.exec(lines[i]!);
    if (!match) continue;
    const body: string[] = [lines[i]!];
    let j = i + 1;
    while (j < lines.length && lines[j] !== '' && !/^export /.test(lines[j]!)) {
      body.push(lines[j]!);
      j++;
    }
    out.set(match[1]!, body.join('\n').trimEnd());
    i = j - 1;
  }
  return out;
}

describe('Cherry wire contract', () => {
  const frontend = declarations(read(FRONTEND));
  const edge = declarations(read(EDGE));

  it('finds declarations in both copies', () => {
    expect(edge.size).toBeGreaterThan(10);
    expect(frontend.size).toBeGreaterThanOrEqual(edge.size);
  });

  it('carries every shape the edge function declares', () => {
    const missing = [...edge.keys()].filter((name) => !frontend.has(name));
    expect(missing).toEqual([]);
  });

  it.each([...declarations(read(EDGE)).keys()])(
    '%s is identical in both copies',
    (name) => {
      expect(frontend.get(name)).toBe(edge.get(name));
    },
  );
});
