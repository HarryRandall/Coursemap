import Link from "next/link";
import { Plus } from "lucide-react";
import styles from "./composition-block.module.css";

/** A place in the degree for a major or minor the student has not chosen. */
export function CompositionInvitation({
  title,
  action,
  units,
  href,
  colour,
}: {
  title: string;
  /** What choosing does, such as "Add a major". */
  action: string;
  units: number | null;
  href: string;
  /** Background colour class, matching the chosen section's fill. */
  colour: string;
}) {
  return (
    <Link
      href={href}
      className={`${styles.invitation} ${colour} relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
      aria-label={
        units === null ? action : `${action}, ${units} units reserved`
      }
    >
      <span className={styles.heading}>
        <strong>{title}</strong>
        <span className={styles.units}>
          {units === null ? "Optional" : `${units} units`}
        </span>
      </span>
      <span className={styles.invitationAction} aria-hidden="true">
        <Plus size={14} />
        {action}
      </span>
    </Link>
  );
}
