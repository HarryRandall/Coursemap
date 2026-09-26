import type { ReactElement, ReactNode } from "react";
import { ErrorIllustration } from "@/ui/common/error-illustration";
import type { ErrorIllustrationKind } from "@/ui/common/error-illustration";

export function ErrorState({
  title,
  titleAs: Heading = "h1",
  description,
  code,
  reference,
  illustration = "server",
  children,
}: {
  title: string;
  titleAs?: "h1" | "h2";
  description: string;
  code?: string;
  reference?: string;
  illustration?: ErrorIllustrationKind | ReactElement;
  children?: ReactNode;
}) {
  return (
    <section className="flex min-h-96 flex-1 flex-col items-center justify-center gap-4 overflow-auto rounded-xl border bg-card px-6 py-12 text-center">
      {code && (
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          {code}
        </p>
      )}
      {typeof illustration === "string" ? (
        <ErrorIllustration kind={illustration} />
      ) : (
        illustration
      )}
      <div className="max-w-lg space-y-3">
        <Heading className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </Heading>
        <p className="text-base leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {children ? (
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          {children}
        </div>
      ) : null}
      {reference && (
        <p className="max-w-lg text-xs break-all text-muted-foreground">
          Error reference: {reference}
        </p>
      )}
    </section>
  );
}
