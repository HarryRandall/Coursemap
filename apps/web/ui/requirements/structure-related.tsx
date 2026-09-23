import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@coursemap/ui/primitives/card";
import type { StructureRelationshipKind } from "@/lib/catalogue/structure-vocabulary";
import { publicCatalogueRecordPath } from "@/lib/coursemap/catalogue-kinds";
import type {
  StructureDetails,
  StructureKind,
  StructureRelationship,
} from "@/lib/coursemap/structure-types";

const OPTION_GROUPS: Array<{ kind: StructureKind; title: string }> = [
  { kind: "major", title: "Majors" },
  { kind: "minor", title: "Minors" },
  { kind: "specialisation", title: "Specialisations" },
];

function uniqueTargets(
  relationships: readonly StructureRelationship[],
  kind: StructureRelationshipKind,
  targetKind?: StructureKind,
) {
  return [
    ...new Map(
      relationships
        .filter(
          (relationship) =>
            relationship.relationshipKind === kind &&
            (!targetKind || relationship.targetKind === targetKind),
        )
        .map((relationship) => [relationship.targetCode, relationship]),
    ).values(),
  ];
}

function RecordLinks({
  records,
  year,
}: {
  records: readonly StructureRelationship[];
  year: number;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {records.map((record) => (
        <li key={record.targetCode}>
          <Link
            href={publicCatalogueRecordPath(
              record.targetKind,
              year,
              record.targetCode,
            )}
            className="flex items-baseline justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:border-foreground/20 hover:bg-muted/40 motion-reduce:transition-none"
          >
            <span className="min-w-0 font-medium text-foreground">
              {record.targetTitle ?? record.targetCode}
            </span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {record.targetCode}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function RelatedCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 border-t border-border/60 pt-5">
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * The records a structure relates to, one card per meaning: the degrees it
 * can be studied in, the majors, minors and specialisations a programme
 * offers, and what it cannot be combined with. Each card appears only when
 * the structure has something to put in it.
 */
export function StructureRelated({
  structure,
}: {
  structure: StructureDetails;
}) {
  const offeredIn = uniqueTargets(structure.relationships, "offered_in");
  const optionGroups = OPTION_GROUPS.map((group) => ({
    ...group,
    records: uniqueTargets(structure.relationships, "option", group.kind),
  })).filter((group) => group.records.length);
  const incompatible = uniqueTargets(structure.relationships, "incompatible");

  return (
    <>
      {offeredIn.length ? (
        <RelatedCard title="Offered in">
          <RecordLinks records={offeredIn} year={structure.year} />
        </RelatedCard>
      ) : null}
      {optionGroups.length ? (
        <RelatedCard title="Choose from">
          {optionGroups.map((group) => (
            <div key={group.kind} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {group.title}
              </h3>
              <RecordLinks records={group.records} year={structure.year} />
            </div>
          ))}
        </RelatedCard>
      ) : null}
      {incompatible.length ? (
        <RelatedCard title="Cannot be combined with">
          <RecordLinks records={incompatible} year={structure.year} />
        </RelatedCard>
      ) : null}
    </>
  );
}
