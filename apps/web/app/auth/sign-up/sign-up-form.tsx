"use client";
import { Alert, AlertDescription } from "@coursemap/ui/components/alert";
import { Button } from "@coursemap/ui/primitives/button";
import { Field } from "@coursemap/ui/primitives/field";
import { Input } from "@coursemap/ui/primitives/input";

import { CircleAlert, Info, LockKeyhole, Mail } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/browser";
import { Hint } from "@/ui/common/hint";

const PASSWORD_HINT =
  "Use at least 8 characters and do not reuse your ANU password.";

export function SignUpForm({
  next,
  configured,
}: {
  next: string;
  configured: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const errorId = useId();
  const passwordHintId = useId();
  const passwordId = useId();
  const confirmationRef = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!configured || submitting) return;

    if (password !== passwordConfirmation) {
      setErrorMessage("Passwords do not match.");
      confirmationRef.current?.select();
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setNotice(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        const message = error.message.toLowerCase();
        setErrorMessage(
          message.includes("already registered") ||
            message.includes("already been registered")
            ? "An account may already exist for this email. Try signing in instead."
            : message.includes("password")
              ? "Use a stronger password with at least 8 characters."
              : "Coursemap could not create your account. Wait a moment and try again.",
        );
        return;
      }

      if (!data.session) {
        setNotice(
          "Your account was created, but email confirmation is still enabled. Contact the Coursemap administrator before trying again.",
        );
        return;
      }

      window.location.assign(next);
    } catch {
      setErrorMessage(
        "Coursemap could not create your account. Check the Supabase service and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{"Email address"}</span>
          <span className="relative block">
            <Mail
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
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
              disabled={!configured}
              readOnly={submitting}
              aria-invalid={errorMessage ? true : undefined}
              aria-describedby={errorMessage ? errorId : undefined}
              className="min-h-11 pl-10"
            />
          </span>
        </label>
      </Field>

      <Field>
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-1.5">
            <label htmlFor={passwordId} className="text-sm font-medium">
              Password
            </label>
            <Hint label={PASSWORD_HINT}>
              <button
                type="button"
                aria-label="Password requirements"
                className="grid size-5 place-items-center rounded-full text-muted-foreground hover:text-foreground"
              >
                <Info className="size-3.5" aria-hidden="true" />
              </button>
            </Hint>
          </span>
          <span className="relative block">
            <LockKeyhole
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id={passwordId}
              type="password"
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              disabled={!configured}
              readOnly={submitting}
              aria-invalid={errorMessage ? true : undefined}
              aria-describedby={
                errorMessage ? `${passwordHintId} ${errorId}` : passwordHintId
              }
              className="min-h-11 pl-10"
            />
          </span>
        </div>
        <span id={passwordHintId} className="sr-only">
          {PASSWORD_HINT}
        </span>
      </Field>

      <Field>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{"Confirm password"}</span>
          <span className="relative block">
            <LockKeyhole
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="password"
              name="passwordConfirmation"
              value={passwordConfirmation}
              ref={confirmationRef}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              disabled={!configured}
              readOnly={submitting}
              aria-invalid={errorMessage ? true : undefined}
              aria-describedby={errorMessage ? errorId : undefined}
              className="min-h-11 pl-10"
            />
          </span>
        </label>
      </Field>

      {errorMessage && (
        <Alert id={errorId} role="alert" variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {notice && (
        <Alert role="status" variant="warning">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        variant="default"
        disabled={!configured}
        aria-disabled={submitting || undefined}
        className="min-h-11 w-full"
      >
        {submitting ? "Creating account..." : "Create account"}
      </Button>
    </form>
  );
}
