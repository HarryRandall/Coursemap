import { Alert, AlertDescription } from "@coursemap/ui/components/alert";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { AuthShell } from "@/app/auth/auth-shell";
import { SignUpForm } from "@/app/auth/sign-up/sign-up-form";
import { SocialSignIn } from "@/app/auth/social-sign-in";

import { safeInternalRedirect } from "@/lib/auth/redirect";
import { getSupabaseConfig } from "@/lib/supabase/config";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  // New accounts are offered onboarding first; the wizard itself can be skipped.
  const next = safeInternalRedirect(first(params.next), "/onboarding");

  const configured = Boolean(getSupabaseConfig());
  const signInHref = `/login?next=${encodeURIComponent(next)}`;

  return (
    <AuthShell>
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        Create your account
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Map your degree, follow prerequisites and keep one plan across every
        semester. Free for ANU students.
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

      <SignUpForm next={next} configured={configured} />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={signInHref}
          className="font-semibold text-primary hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

export const dynamic = "force-dynamic";
