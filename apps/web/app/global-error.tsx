"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- The root fallback must recover with a full document navigation. */

import { themeInitialisationScript } from "@/lib/theme";

// This fallback replaces the root layout and cannot rely on its styles or providers.
// It cannot tell whether anyone is signed in, so it applies the saved theme,
// which sign-out clears.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>Something went wrong · Coursemap</title>
        <script
          dangerouslySetInnerHTML={{ __html: themeInitialisationScript(true) }}
        />
      </head>
      <body style={{ margin: 0 }}>
        <style>{`
          .fallback { --canvas: #fff; --ink: #18181b; --muted: #71717a; --edge: #e4e4e7; --brand: #7c3aed; min-height: 100dvh; display: flex; flex-direction: column; background: var(--canvas); color: var(--ink); font: 16px/1.6 ui-sans-serif, system-ui, sans-serif; }
          .fallback * { box-sizing: border-box; }
          .fallback header { display: flex; justify-content: flex-start; padding: 20px 32px; }
          .fallback a { color: inherit; text-decoration: none; }
          .fallback .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; }
          .fallback main { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; border: 2px dotted var(--edge); border-radius: 12px; margin: 0 24px 24px; padding: 48px 24px; text-align: center; }
          .fallback h1 { font-size: clamp(24px, 4vw, 30px); line-height: 1.25; margin: 0; }
          .fallback p { max-width: 480px; margin: 0; color: var(--muted); }
          .fallback .code { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; }
          .fallback .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 8px; }
          .fallback button, .fallback .home { border: 1px solid var(--edge); border-radius: 6px; padding: 8px 16px; background: var(--canvas); color: var(--ink); cursor: pointer; font: inherit; }
          .fallback button { background: var(--brand); border-color: var(--brand); color: white; }
          .fallback :focus-visible { outline: 2px solid var(--brand); outline-offset: 4px; }
          .fallback .reference { font-size: 12px; overflow-wrap: anywhere; }
          .dark-mode .fallback { --canvas: #0a0a0a; --ink: #fafafa; --muted: #a1a1aa; --edge: #27272a; --brand: #8b5cf6; }
        `}</style>
        <div className="fallback">
          <header>
            <a className="brand" href="/" aria-label="Coursemap home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" width="32" height="32" alt="" />
              coursemap
            </a>
          </header>
          <main>
            <p className="code">
              {error.digest ? "500 · Server error" : "Application error"}
            </p>
            <svg
              width="240"
              height="170"
              viewBox="0 0 240 170"
              fill="none"
              stroke="var(--edge)"
              strokeWidth="1.7"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <rect x="65" y="34" width="110" height="32" rx="8" />
              <rect x="65" y="104" width="110" height="32" rx="8" />
              <path d="M81 50h29m-29 70h29M120 66v38" />
              <g stroke="var(--brand)">
                <circle cx="157" cy="50" r="3" />
                <circle cx="157" cy="120" r="3" />
                <path d="M84 84h23m0-7v14m-3-11h6m-6 8h6M156 84h-23m0-7v14m-6-10h6m-6 6h6" />
              </g>
            </svg>
            <h1>We couldn&apos;t load Coursemap</h1>
            <p>
              Something went wrong on our side. Try again, or head home and come
              back later.
            </p>
            <div className="actions">
              <button type="button" onClick={reset}>
                Try again
              </button>
              <a className="home" href="/">
                Back to home
              </a>
            </div>
            {error.digest && (
              <p className="reference">Error reference: {error.digest}</p>
            )}
          </main>
        </div>
      </body>
    </html>
  );
}
