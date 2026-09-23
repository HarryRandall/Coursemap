import { Skeleton } from "@coursemap/ui/primitives/skeleton";
import { AuthShell } from "@/app/auth/auth-shell";

/**
 * Shared skeleton for the sign-in and sign-up forms: heading, social buttons,
 * the divider, email and password fields and the submit button.
 */
export function AuthLoading({
  label,
  fields,
}: {
  label: string;
  fields: number;
}) {
  return (
    <AuthShell>
      <div aria-busy="true">
        <span className="sr-only">{label}</span>
        <Skeleton className="h-8 w-48 sm:h-9" />
        <Skeleton className="mt-3 h-3.5 w-full" />
        <Skeleton className="mt-2 h-3.5 w-2/3" />
        <div className="mt-7 space-y-2.5">
          <Skeleton className="h-11 rounded-lg" />
          <Skeleton className="h-11 rounded-lg" />
        </div>
        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <Skeleton className="h-2.5 w-28" />
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: fields }, (_, index) => (
            <div key={index}>
              <Skeleton className="mb-2 h-3 w-20" />
              <Skeleton className="h-11 w-full rounded-lg" />
            </div>
          ))}
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
        <Skeleton className="mx-auto mt-6 h-3.5 w-52" />
      </div>
    </AuthShell>
  );
}
