import type { ComponentProps } from "react";
import { Button } from "@coursemap/ui/primitives/button";

/**
 * Starts planning without an account. The plan is kept in this browser's
 * cookies and moves into an account when the student signs up.
 */
export function ContinueAsGuest({
  className,
  size,
  variant = "outline",
  children = "Continue as a guest",
}: Pick<ComponentProps<typeof Button>, "className" | "size" | "variant"> & {
  children?: React.ReactNode;
}) {
  return (
    <form action="/auth/guest" method="post">
      <Button type="submit" variant={variant} size={size} className={className}>
        {children}
      </Button>
    </form>
  );
}
