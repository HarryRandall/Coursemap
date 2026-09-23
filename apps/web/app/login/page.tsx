import { Alert, AlertDescription } from "@coursemap/ui/components/alert";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { AuthShell } from "@/app/auth/auth-shell";
import { SignInForm } from "@/app/auth/sign-in/sign-in-form";
import { SocialSignIn } from "@/app/auth/social-sign-in";

import { safeInternalRedirect } from "@/lib/auth/redirect";
import { getSupabaseConfig } from "@/lib/supabase/config";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const next = safeInternalRedirect(first(params.next));
  const initialError =
    first(params.error) === "invalid-login"
      ? "Email or password is incorrect."
      : null;

  const configured = Boolean(getSupabaseConfig());
  const signUpHref = `/signup?next=${encodeURIComponent(next)}`;

  return (
    <AuthShell>
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        Welcome back
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Sign in to your plan and pick up where you left off.
      </p>

      {!configured && (
        <Alert className="mt-5" role="alert" variant={"warning"}>
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            Local Supabase is not configured. Copy .env.example to .env.local,
            add the values from `supabase status`, then restart Next.js.
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-7">
        <SocialSignIn disabled={!configured} />
      </div>

      <div className="my-6 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-[11px] text-muted-foreground">
          or continue with email
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <SignInForm
        next={next}
        configured={configured}
        initialError={initialError}
      />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to Coursemap?{" "}
        <Link
          href={signUpHref}
          className="font-semibold text-primary hover:underline"
        >
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}

export const dynamic = "force-dynamic";
