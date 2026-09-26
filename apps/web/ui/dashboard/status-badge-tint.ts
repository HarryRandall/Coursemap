/**
 * Dark-mode overrides that turn solid status badges into tints. Solid fills
 * lighten in the dark theme until white text on them is hard to read, so the
 * dark theme uses coloured text on a soft tint while light keeps the fills.
 */
export const darkStatusTint: Partial<Record<string, string>> = {
  success: "dark:border-success/25 dark:bg-success/15 dark:text-success",
  warning: "dark:border-warning/25 dark:bg-warning/15 dark:text-warning",
  info: "dark:border-info/25 dark:bg-info/15 dark:text-info",
  destructive:
    "dark:border-destructive/25 dark:bg-destructive/15 dark:text-destructive",
  default: "dark:border-primary/25 dark:bg-primary/15 dark:text-primary",
};
