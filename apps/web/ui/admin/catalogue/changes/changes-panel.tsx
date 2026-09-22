import type { SnapshotChange } from "@/lib/catalogue-import/changes";
import type { SourceReview } from "@/lib/catalogue/source-review-store";
import { CatalogueEmpty } from "@/ui/admin/catalogue-table/catalogue-empty";
import { SourceChangeCard } from "./source-change-card";
import { UnpublishedChanges } from "./unpublished-changes";

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide uppercase">
        {title}
        <span className="ml-2 font-normal text-muted-foreground">{count}</span>
      </h2>
      {children}
    </section>
  );
}

function reviewEmptyState({
  hasEverSynced,
  unpublishedCount,
  kindLabel,
}: {
  hasEverSynced: boolean;
  unpublishedCount: number;
  kindLabel: string;
}) {
  if (!hasEverSynced) {
    return {
      title: "No ANU changes yet",
      description: `This ${kindLabel} hasn't been synced from ANU.`,
    };
  }
  if (unpublishedCount > 0) {
    return {
      title: "No incoming ANU changes",
      description: `You have ${unpublishedCount} unpublished draft change${
        unpublishedCount === 1 ? "" : "s"
      }.`,
    };
  }
  return {
    title: "No changes to review",
    description: `This ${kindLabel} matches the latest ANU information.`,
  };
}

/**
 * The Changes tab: what ANU wants to change, what conflicts with local work,
 * what was deliberately kept different, and what students cannot see yet.
 * Every section disappears when it is empty rather than standing as a box
 * announcing that nothing is in it.
 */
export function CatalogueChangesPanel({
  review,
  unpublished,
  recordId,
  path,
  canWrite,
  hasEverSynced,
  isPublished,
  kindLabel,
}: {
  review: SourceReview | null;
  unpublished: SnapshotChange[];
  recordId: number;
  path: string;
  canWrite: boolean;
  hasEverSynced: boolean;
  isPublished: boolean;
  kindLabel: string;
}) {
  const conflicts = review?.conflicts ?? [];
  const incoming = review?.incoming ?? [];
  const overrides = review?.overrides ?? [];
  const unpublishedCount = isPublished ? unpublished.length : 0;
  const empty = reviewEmptyState({
    hasEverSynced,
    unpublishedCount,
    kindLabel,
  });
  const showUnpublished = unpublished.length > 0 || !isPublished;

  return (
    <div className="flex flex-col gap-8">
      {conflicts.length === 0 && incoming.length === 0 ? (
        <CatalogueEmpty title={empty.title} description={empty.description} />
      ) : null}
      {conflicts.length > 0 ? (
        <Section title="Conflicts" count={conflicts.length}>
          <div className="flex flex-col gap-3">
            {conflicts.map((change) => (
              <SourceChangeCard
                canWrite={canWrite}
                change={change}
                key={change.id}
                path={path}
                recordId={recordId}
              />
            ))}
          </div>
        </Section>
      ) : null}
      {incoming.length > 0 ? (
        <Section title="Incoming from ANU" count={incoming.length}>
          <div className="flex flex-col gap-3">
            {incoming.map((change) => (
              <SourceChangeCard
                canWrite={canWrite}
                change={change}
                key={change.id}
                path={path}
                recordId={recordId}
              />
            ))}
          </div>
        </Section>
      ) : null}
      {overrides.length > 0 ? (
        <details className="flex flex-col gap-3">
          <summary className="cursor-pointer text-sm font-semibold tracking-wide uppercase underline-offset-4 hover:underline">
            Kept different from ANU
            <span className="ml-2 font-normal text-muted-foreground normal-case">
              {overrides.length}
            </span>
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            {overrides.map((change) => (
              <SourceChangeCard
                canWrite={canWrite}
                change={change}
                key={change.id}
                path={path}
                recordId={recordId}
              />
            ))}
          </div>
        </details>
      ) : null}
      {showUnpublished ? (
        <Section title="Unpublished changes" count={unpublishedCount}>
          <UnpublishedChanges changes={unpublished} isPublished={isPublished} />
        </Section>
      ) : null}
    </div>
  );
}
