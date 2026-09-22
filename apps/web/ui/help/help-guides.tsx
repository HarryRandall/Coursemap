"use client";

import { Button } from "@coursemap/ui/primitives/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@coursemap/ui/primitives/empty";
import { Input } from "@coursemap/ui/primitives/input";
import Link from "next/link";
import { useId, useState } from "react";
import { ArrowRight, BookOpen, Search, X } from "lucide-react";
import { helpCategoryTints, helpTopicIcons } from "@/ui/help/topic-icons";
import { cn } from "@/lib/cn";
import { CatalogueIllustration } from "@/ui/common/catalogue-illustration";
import {
  groupHelpArticles,
  searchHelpArticles,
  type HelpArticle,
} from "@/lib/help";

function GuideCard({ article }: { article: HelpArticle }) {
  const Icon = helpTopicIcons[article.slug] ?? BookOpen;
  const tint = helpCategoryTints[article.category];
  return (
    <li className="h-full">
      <Link
        href={`/help/${article.slug}`}
        prefetch={true}
        className="group flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-xs transition hover:border-input hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
      >
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-lg",
            tint.tile,
          )}
        >
          <Icon size={18} aria-hidden="true" />
        </span>
        <h3 className="mt-4 text-[15px] leading-snug font-semibold tracking-tight text-foreground">
          {article.title}
        </h3>
        <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">
          {article.description}
        </p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary">
          Read guide
          <ArrowRight
            size={14}
            aria-hidden="true"
            className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
          />
        </span>
      </Link>
    </li>
  );
}

/**
 * Searchable guide index. Filtering is local because the guide set is small
 * and already on the page; a query narrows the grouped grid in place.
 */
export function HelpGuides() {
  const [query, setQuery] = useState("");
  const inputId = useId();
  const statusId = useId();
  const trimmed = query.trim();
  const matches = trimmed ? searchHelpArticles(trimmed) : undefined;
  const groups = groupHelpArticles(matches);
  const total = matches?.length ?? 0;

  return (
    <div className="space-y-10">
      <search className="mx-auto max-w-2xl">
        <label htmlFor={inputId} className="sr-only">
          Search guides
        </label>
        <div className="relative">
          <Search
            size={18}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={inputId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.preventDefault();
                setQuery("");
              }
            }}
            placeholder="Search guides, e.g. prerequisites or catalogue year"
            autoComplete="off"
            aria-describedby={trimmed ? statusId : undefined}
            className="h-12 rounded-xl pr-11 pl-11 text-[15px] shadow-xs"
          />
          {query ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-1.5 size-9 -translate-y-1/2 text-muted-foreground"
            >
              <X size={16} aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <p id={statusId} role="status" aria-live="polite" className="sr-only">
          {trimmed
            ? total === 0
              ? `No guides match "${trimmed}".`
              : `${total} ${total === 1 ? "guide matches" : "guides match"} "${trimmed}".`
            : ""}
        </p>
      </search>

      {trimmed && total === 0 ? (
        <Empty className="rounded-xl border border-dashed border-border bg-card py-12">
          <CatalogueIllustration />
          <EmptyHeader>
            <EmptyTitle>Nothing matches that search</EmptyTitle>
            <EmptyDescription>
              Try a shorter word, or use the contact options below and we will
              point you to the right place.
            </EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" type="button" onClick={() => setQuery("")}>
            Clear search
          </Button>
        </Empty>
      ) : (
        <div className="space-y-10">
          {groups.map(({ category, articles }) => (
            <section
              key={category.id}
              aria-labelledby={`help-category-${category.id}`}
            >
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <h2
                  id={`help-category-${category.id}`}
                  className="text-base font-semibold tracking-tight text-foreground"
                >
                  {category.label}
                </h2>
                <span className="text-xs font-medium text-muted-foreground tabular-nums">
                  {articles.length} {articles.length === 1 ? "guide" : "guides"}
                </span>
              </div>
              <ul className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {articles.map((article) => (
                  <GuideCard key={article.slug} article={article} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
