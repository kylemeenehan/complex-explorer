/**
 * Minimal `#include "name"` support for shaders imported with Vite's `?raw`.
 * Each chunk is included at most once.
 */
export function resolveIncludes(
  source: string,
  chunks: Record<string, string>,
  seen = new Set<string>(),
): string {
  return source.replace(
    /^[ \t]*#include\s+"([\w-]+)"[ \t]*$/gm,
    (_, name: string) => {
      if (!(name in chunks)) throw new Error(`Unknown shader chunk "${name}"`);
      if (seen.has(name)) return '';
      seen.add(name);
      return resolveIncludes(chunks[name], chunks, seen);
    },
  );
}
