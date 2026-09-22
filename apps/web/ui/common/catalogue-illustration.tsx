import styles from "./catalogue-illustration.module.css";

export function CatalogueIllustration() {
  return (
    <svg
      className={styles.illustration}
      viewBox="0 0 240 150"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="120" cy="126" rx="80" ry="9" className={styles.shadow} />
      <g className={styles.document}>
        <rect x="85" y="20" width="70" height="82" rx="9" />
        <path d="M101 39h38M101 50h28M101 61h35" />
        <circle cx="120" cy="80" r="7" className={styles.accent} />
      </g>
      <path
        d="M51 92l16-27h17M156 65h17l16 27v29H51V92Z"
        className={styles.tray}
      />
      <path d="M51 92h42l8 12h38l8-12h42" />
    </svg>
  );
}
