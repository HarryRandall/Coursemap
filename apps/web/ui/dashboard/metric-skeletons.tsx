/**
 * Muted outlines of each dashboard chart. Empty cards show them in place of
 * data, and the loading screen shows the same shapes pulsing, so a card keeps
 * its look from loading through to empty or filled.
 */

/** Marks from 80 are a high distinction. */
const HIGH_DISTINCTION = 80;

/** A flat, muted GPA line with a label under each semester. */
export const gpaSkeleton = (
  <div className="flex h-full flex-col">
    <svg
      className="h-[76px] w-full text-muted"
      viewBox="0 0 240 76"
      preserveAspectRatio="none"
    >
      <path
        d="M3 44 L80 36 L160 40 L237 30 L237 76 L3 76 Z"
        fill="currentColor"
        opacity={0.35}
      />
      <path
        d="M3 44 L80 36 L160 40 L237 30"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
    <div className="mt-1 flex justify-between">
      {[0, 1, 2, 3].map((index) => (
        <span key={index} className="h-2.5 w-8 rounded-sm bg-muted" />
      ))}
    </div>
  </div>
);

/** Five muted bars rising from fail to high distinction, labelled. */
export const gradesSkeleton = (
  <div className="flex h-full flex-col">
    <div className="flex flex-1 items-end justify-around border-b border-dashed border-border">
      {[0.2, 0.3, 0.5, 0.65, 0.9].map((scale, index) => (
        <span
          key={index}
          className="w-6 rounded-t-[3px] bg-muted"
          style={{ height: `${scale * 100}%` }}
        />
      ))}
    </div>
    <div className="flex h-5 items-end justify-around text-[10px] text-muted-foreground/60">
      {["N", "Pass", "CR", "D", "HD"].map((label) => (
        <span key={label} className="w-6 text-center">
          {label}
        </span>
      ))}
    </div>
  </div>
);

/** Three muted yearly rows, each a label, a bar and an amount. */
export const tuitionSkeleton = (
  <div className="flex h-full flex-col justify-between py-1">
    {[0.7, 0.85, 1].map((scale, index) => (
      <div
        key={index}
        className="grid grid-cols-[2rem_1fr_3.5rem] items-center gap-2"
      >
        <span className="h-2.5 w-7 rounded-sm bg-muted" />
        <div className="h-3 rounded-sm bg-muted/50">
          <div
            className="h-full rounded-sm bg-muted"
            style={{ width: `${scale * 100}%` }}
          />
        </div>
        <span className="ml-auto h-2.5 w-10 rounded-sm bg-muted" />
      </div>
    ))}
  </div>
);

/** Four muted course rows, each a code, a mark line with a dot and a mark. */
export const averageMarkSkeleton = (
  <div className="flex h-full flex-col justify-center gap-2">
    {[62, 78, 70, 85].map((mark, index) => (
      <div
        key={index}
        className="grid grid-cols-[4.5rem_1fr_1.5rem] items-center gap-2"
      >
        <span className="h-2.5 w-14 rounded-sm bg-muted" />
        <div className="relative h-px bg-border">
          <span
            className="absolute -top-1.5 h-3 border-l border-dashed border-muted-foreground/30"
            style={{ left: `${HIGH_DISTINCTION}%` }}
          />
          <span
            className="absolute -top-1 size-2 -translate-x-1/2 rounded-full bg-muted"
            style={{ left: `${mark}%` }}
          />
        </div>
        <span className="ml-auto h-2.5 w-4 rounded-sm bg-muted" />
      </div>
    ))}
  </div>
);

/** Three muted date rows, each an icon tile, a title and a date. */
export const keyDatesSkeleton = (
  <div className="flex h-full flex-col justify-center gap-2.5">
    {[0.7, 0.5, 0.6].map((scale, index) => (
      <div key={index} className="flex items-center gap-2.5">
        <span className="size-6 shrink-0 rounded-md bg-muted" />
        <span
          className="h-2.5 rounded-sm bg-muted"
          style={{ width: `${scale * 100}%` }}
        />
        <span className="ml-auto h-2.5 w-10 shrink-0 rounded-sm bg-muted" />
      </div>
    ))}
  </div>
);

/** Muted year columns rising towards a full year. */
export const coverageSkeleton = (
  <div className="flex h-full items-end justify-around gap-3 pb-5">
    {[0.9, 0.7, 0.45].map((scale, index) => (
      <span
        key={index}
        className="w-full max-w-10 rounded-t-md bg-muted"
        style={{ height: `${scale * 100}%` }}
      />
    ))}
  </div>
);

/** Muted semester columns under a dashed standard-load line. */
export const upcomingLoadSkeleton = (
  <div className="relative flex h-full items-end justify-around gap-2 pb-5">
    <span className="absolute inset-x-0 top-[18%] border-t border-dashed border-border" />
    {[0.8, 0.8, 0.6, 0.8, 0.4].map((scale, index) => (
      <span
        key={index}
        className="w-full max-w-8 rounded-t-md bg-muted"
        style={{ height: `${scale * 80}%` }}
      />
    ))}
  </div>
);
