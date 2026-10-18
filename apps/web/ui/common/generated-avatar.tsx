import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

function hashIdentity(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function initials(name?: string | null, email?: string | null) {
  const source = (name?.trim() || email?.split("@")[0] || "CM").replace(
    /[._-]+/g,
    " ",
  );
  const words = source.split(/\s+/).filter(Boolean);
  return (
    words.length > 1
      ? `${words[0][0]}${words.at(-1)![0]}`
      : words[0]?.[0] || "CM"
  ).toUpperCase();
}

/** ShowCrafter-style generated identity avatar using Coursemap's violet palette. */
export function GeneratedAvatar({
  name,
  email,
  className,
}: {
  name?: string | null;
  email?: string | null;
  className?: string;
}) {
  const label = name || email || "User";
  const hash = hashIdentity(`${name ?? ""}|${email ?? ""}`.toLowerCase());
  const angle = 115 + (hash % 130);
  const style = {
    backgroundImage: `linear-gradient(${angle}deg, var(--color-brand-500), var(--color-brand-700) 55%, var(--color-brand-900))`,
    boxShadow:
      "inset 0 0 0 1px rgb(255 255 255 / 0.28), inset 0 -8px 16px rgb(24 24 27 / 0.2)",
  } satisfies CSSProperties;

  return (
    <span
      role="img"
      aria-label={`${label} profile picture`}
      style={style}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white shadow-xs ring-1 ring-zinc-950/10",
        className,
      )}
    >
      {initials(name, email)}
    </span>
  );
}
