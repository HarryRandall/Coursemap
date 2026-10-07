/** Two bars on a shared 0 to 100 scale, one per semester. */
export function ReviewSessionComparison({
  sem1,
  sem2,
}: {
  sem1: number;
  sem2: number;
}) {
  return (
    <ul className="flex h-16 flex-col justify-center gap-2.5">
      {[
        { label: "S1", fullLabel: "Semester 1", value: Math.round(sem1) },
        { label: "S2", fullLabel: "Semester 2", value: Math.round(sem2) },
      ].map((session) => (
        <li
          key={session.label}
          className="grid grid-cols-[1.5rem_minmax(0,1fr)_2.25rem] items-center gap-2 text-xs"
        >
          <span aria-hidden="true" className="text-muted-foreground">
            {session.label}
          </span>
          <span
            role="img"
            aria-label={`${session.fullLabel} usually ${session.value}%`}
            className="h-2 rounded-full bg-muted"
          >
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${session.value}%` }}
            />
          </span>
          <span className="text-right font-medium tabular-nums">
            {session.value}%
          </span>
        </li>
      ))}
    </ul>
  );
}
