"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@coursemap/ui/primitives/button";
import { Hint } from "@/ui/common/hint";
import styles from "./account-menu.module.css";

const subscribeToNothing = () => () => {};
const options = [
  { value: "light", label: "Light theme", icon: Sun },
  { value: "dark", label: "Dark theme", icon: Moon },
  { value: "system", label: "System theme", icon: Monitor },
];

export function AccountAppearance() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  const value = mounted ? (theme ?? "system") : "system";

  return (
    <div role="group" aria-label="Theme" className={styles.themeChoices}>
      {options.map(({ value: option, label, icon: Icon }) => (
        <Hint key={option} label={label}>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={label}
            aria-pressed={value === option}
            onClick={() => setTheme(option)}
          >
            <Icon aria-hidden="true" />
          </Button>
        </Hint>
      ))}
    </div>
  );
}
