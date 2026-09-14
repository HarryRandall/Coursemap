import { CatalogueImportButton } from "./catalogue-import-button";
import artwork from "@/ui/common/error-artwork/error-artwork.module.css";

export function CatalogueImportEmpty({
  kind = "course",
  code,
  year,
  canImport,
  active = false,
  hasImports = false,
  onStarted,
}: {
  kind?: "course" | "programme" | "major" | "minor" | "specialisation";
  code: string;
  year: number;
  canImport: boolean;
  active?: boolean;
  hasImports?: boolean;
  onStarted?: () => void;
}) {
  return (
    <section className="flex min-h-96 flex-1 flex-col items-center justify-center gap-5 rounded-xl border-2 border-dotted border-border bg-card px-6 py-12 text-center">
      <svg
        className={artwork.art}
        viewBox="0 0 240 170"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <ellipse className={artwork.dashed} cx="120" cy="145" rx="80" ry="9" />
        <path
          className={artwork.surface}
          d="M45 62q35-15 75 2 40-17 75-2v69q-35-15-75 2-40-17-75-2z"
        />
        <path
          className={artwork.line}
          d="M120 64v69M58 85q22-6 46 1M58 99q22-6 46 1M138 98h40M138 112h26"
        />
        <g className={artwork.slideRight}>
          <rect
            className={artwork.paper}
            x="141"
            y="20"
            width="43"
            height="54"
            rx="7"
          />
          <path className={artwork.accent} d="M151 34h22m-22 9h16m-16 9h20" />
        </g>
        <g className={artwork.breathe}>
          <path className={artwork.accent} d="M111 21v26m-9-9 9 9 9-9" />
          <circle className={artwork.dot} cx="52" cy="38" r="3" />
        </g>
      </svg>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">
          {active
            ? `Importing ${kind}`
            : hasImports
              ? "No reviewable version yet"
              : "No imports yet"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {active
            ? `${code} is being prepared for review.`
            : hasImports
              ? "Check History for the latest import result."
              : `Bring ${code} ${year} in from ANU to start reviewing.`}
        </p>
      </div>
      {!active ? (
        <CatalogueImportButton
          kind={kind}
          code={code}
          year={year}
          disabled={!canImport}
          onStarted={onStarted}
          label={hasImports ? `Re-import ${kind}` : `Import ${kind}`}
        />
      ) : null}
      {!canImport && !active ? (
        <p className="text-xs text-muted-foreground">
          Importing is unavailable for this entry or your account.
        </p>
      ) : null}
    </section>
  );
}
