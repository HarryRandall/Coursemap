// Node resolve hooks for running catalogue server modules outside Next.js.
// They mirror the app's bundler settings: `@/` imports, extensionless
// TypeScript paths, the `server-only` build marker, and a published cache with
// nothing to expire in a command-line process.
const APP_ROOT = new URL("../../../", import.meta.url);
const SERVER_ONLY = new URL(
  "node_modules/next/dist/compiled/server-only/empty.js",
  APP_ROOT,
).href;
const NEXT_CACHE = new URL("./next-cache-stub.mjs", import.meta.url).href;
const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts"];

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only")
    return { url: SERVER_ONLY, shortCircuit: true };
  if (specifier === "next/cache")
    return { url: NEXT_CACHE, shortCircuit: true };
  const local = specifier.startsWith("@/")
    ? new URL(specifier.slice(2), APP_ROOT).href
    : specifier.startsWith(".") && /\.[cm]?[jt]sx?$/.test(specifier) === false
      ? specifier
      : null;
  if (local === null) return nextResolve(specifier, context);
  let failure;
  for (const extension of EXTENSIONS) {
    try {
      return await nextResolve(`${local}${extension}`, context);
    } catch (error) {
      failure ??= error;
    }
  }
  throw failure;
}
