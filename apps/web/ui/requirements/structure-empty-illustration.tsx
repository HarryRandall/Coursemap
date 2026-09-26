import styles from "./structure-empty-illustration.module.css";

export type StructureIllustrationKind =
  "plan" | "major" | "minor" | "specialisation";

export function StructureEmptyIllustration({
  kind,
}: {
  kind: StructureIllustrationKind;
}) {
  const drawings = {
    plan: (
      <g key="plan">
        <rect
          className={styles.surface}
          x="40"
          y="58"
          width="104"
          height="24"
          rx="6"
        />
        <rect
          className={styles.surface}
          x="40"
          y="92"
          width="104"
          height="24"
          rx="6"
        />
        <rect
          className={styles.surface}
          x="40"
          y="126"
          width="104"
          height="24"
          rx="6"
        />
        <path className={styles.accent} d="m50 70 4 4 8-8" />
        <path className={styles.line} d="M72 70h52M52 104h60M52 138h44" />
        <path className={styles.dashed} d="M144 104h20q12 0 12-12V76" />
        <g className={styles.float}>
          <path className={styles.tint} d="m176 30 32 13-32 13-32-13Z" />
          <path className={styles.accent} d="M160 50v10q16 9 32 0V50m16-7v17" />
        </g>
      </g>
    ),
    major: (
      <g key="path">
        <path
          className={styles.dashed}
          d="M53 130V99q0-14 16-14h101q16 0 16-16V44"
        />
        <path
          className={styles.line}
          d="M69 46h38m-38 7h23m48 70h35m-35 7h21"
        />
        <circle className={styles.surface} cx="53" cy="130" r="8" />
        <circle className={styles.surface} cx="120" cy="85" r="10" />
        <g className={styles.float}>
          <path
            className={styles.tint}
            d="M186 29c-23 0-24 27 0 45 24-18 23-45 0-45Z"
          />
          <circle className={styles.accent} cx="186" cy="45" r="6" />
        </g>
        <path className={styles.accent} d="m111 119 9 9 9-9m-9 9v-27" />
      </g>
    ),
    minor: (
      <g key="branch">
        <path className={styles.line} d="M120 139V55m0 50L76 78m44 9 39-32" />
        <path
          className={styles.surface}
          d="M76 78q-31 4-31-25 30-3 31 25ZM120 65q-27-17-6-39 27 17 6 39Z"
        />
        <g className={styles.float}>
          <path className={styles.tint} d="M158 62q-5-33 31-31 0 32-31 31Z" />
          <path className={styles.accent} d="m160 60 16-16" />
        </g>
        <path className={styles.surface} d="M97 119h46l-7 29h-32Z" />
      </g>
    ),
    specialisation: (
      <g key="signal">
        <path
          className={styles.line}
          d="M50 126h141M65 111V95m22 16V78m66 33V70m23 41V91"
        />
        <path className={styles.dashed} d="M43 48h154M43 67h154" />
        <g className={styles.float}>
          <rect
            className={styles.tint}
            x="108"
            y="40"
            width="24"
            height="72"
            rx="5"
          />
          <circle className={styles.accent} cx="120" cy="55" r="5" />
          <path className={styles.accent} d="M120 82v17" />
        </g>
        <path className={styles.line} d="M93 140h54m-38 7h22" />
      </g>
    ),
  };
  return (
    <svg
      className={styles.art}
      viewBox="0 0 240 170"
      fill="none"
      aria-hidden="true"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {drawings[kind]}
    </svg>
  );
}
