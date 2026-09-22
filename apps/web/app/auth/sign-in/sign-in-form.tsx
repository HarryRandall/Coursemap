"use client";
import { Alert, AlertDescription } from "@coursemap/ui/components/alert";
import { Button } from "@coursemap/ui/primitives/button";
import { Field } from "@coursemap/ui/primitives/field";
import { Input } from "@coursemap/ui/primitives/input";
import { cn } from "@/lib/cn";

import { CircleAlert, LockKeyhole, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/browser";

export function SignInForm({
  next,
  configured,
  initialError = null,
}: {
  next: string;
  configured: boolean;
  initialError?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!configured || submitting) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMessage(
          error.message.toLowerCase().includes("invalid login credentials")
            ? "Email or password is incorrect."
            : "Coursemap could not sign you in. Wait a moment and try again.",
        );
        return;
      }

      window.location.assign(next);
    } catch {
      setErrorMessage(
        "Coursemap could not sign you in. Check the Supabase service and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      action="/auth/password"
      method="post"
      onSubmit={submit}
      className="space-y-4"
    >
      <input type="hidden" name="next" value={next} />
      <Field>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{"Email address"}</span>
          <span className="relative block">
            <Mail
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400"
              aria-hidden="true"
            />
            <Input
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              maxLength={254}
              placeholder="name@anu.edu.au"
              required
              disabled={!configured || submitting}
              className="min-h-11 pl-10"
            />
          </span>
        </label>
      </Field>

      <Field>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{"Password"}</span>
          <span className="relative block">
            <LockKeyhole
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400"
              aria-hidden="true"
            />
            <Input
              type="password"
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              minLength={8}
              maxLength={128}
              required
              disabled={!configured || submitting}
              className="min-h-11 pl-10"
            />
          </span>
        </label>
      </Field>

      {errorMessage && (
        <Alert role="alert" variant={"destructive"}>
          <CircleAlert />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        variant="default"
        disabled={!configured || submitting}
        className={cn("min-h-11", "w-full")}
      >
        {submitting ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
