import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, Video } from "lucide-react";
import { ArticleToc } from "@/ui/help/article-toc";
import { helpCategoryTints, helpTopicIcons } from "@/ui/help/topic-icons";
import { AppShell } from "@/ui/shell";
import { cn } from "@/lib/cn";

import {
  adjacentHelpArticles,
  helpArticleBySlug,
  helpArticles,
  helpCategoryById,
  helpSectionId,
  relatedHelpArticles,
  type HelpArticle,
} from "@/lib/help";

type HelpArticlePageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return helpArticles.map((article) => ({ slug: article.slug }));
}

function RelatedGuideCard({ article }: { article: HelpArticle }) {
  const Icon = helpTopicIcons[article.slug] ?? BookOpen;
  const tint = helpCategoryTints[article.category];
  return (
    <li>
      <Link
        href={`/help/${article.slug}`}
        prefetch={true}
        className="group flex h-full items-start gap-4 rounded-xl border border-border bg-card p-5 shadow-xs transition hover:border-input hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
      >
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-lg",
            tint.tile,
          )}
        >
          <Icon size={16} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-base leading-snug font-semibold text-foreground group-hover:text-primary">
            {article.title}
          </span>
          <span className="mt-1.5 block text-sm leading-relaxed text-muted-foreground">
            {article.description}
          </span>
        </span>
      </Link>
    </li>
  );
}

function AdjacentLink({
  article,
  direction,
}: {
  article: HelpArticle;
  direction: "previous" | "next";
}) {
  const next = direction === "next";
  return (
    <Link
      rel={next ? "next" : "prev"}
      href={`/help/${article.slug}`}
      prefetch={true}
      className={cn(
        "group flex min-w-0 flex-1 flex-col rounded-xl border border-border bg-card p-4 shadow-xs transition hover:border-input hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
        next ? "items-end text-right sm:col-start-2" : "items-start",
      )}
    >
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {!next && (
          <ArrowLeft
            size={13}
            aria-hidden="true"
            className="transition-transform group-hover:-translate-x-0.5 motion-reduce:transition-none"
          />
        )}
        {next ? "Next" : "Previous"}
        {next && (
          <ArrowRight
            size={13}
            aria-hidden="true"
            className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
          />
        )}
      </span>
      <span className="mt-1.5 text-[14px] font-semibold text-foreground group-hover:text-primary">
        {article.title}
      </span>
    </Link>
  );
}

export default async function HelpArticlePage({
  params,
}: HelpArticlePageProps) {
  const { slug } = await params;
  const article = helpArticleBySlug(slug);

  if (!article) notFound();

  const category = helpCategoryById(article.category);
  const { previous, next } = adjacentHelpArticles(article.slug);
  const related = relatedHelpArticles(article.slug);
  const tocItems = article.sections.map((section) => ({
    id: helpSectionId(section.heading),
    label: section.heading,
  }));

  return (
    <AppShell currentBreadcrumbLabel={article.title}>
      <div
        key={article.slug}
        className="mx-auto grid w-full animate-fade-in items-start gap-10 py-2 sm:py-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-10"
      >
        <article className="max-w-3xl min-w-0">
          <h1 className="sr-only">{article.title}</h1>

          <header className="space-y-3">
            <Link
              href="/help"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {category.label}
            </Link>
            <p className="text-xl leading-snug font-medium tracking-tight text-foreground sm:text-2xl">
              {article.description}
            </p>
          </header>

          <div className="mt-10 space-y-8 sm:mt-12 sm:space-y-10">
            {article.sections.map((section, index) => {
              const id = helpSectionId(section.heading);
              return (
                <section
                  key={section.heading}
                  id={id}
                  aria-labelledby={`${id}-heading`}
                  className="grid scroll-mt-24 gap-x-5 gap-y-3 sm:grid-cols-[2.25rem_minmax(0,1fr)]"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-9 place-items-center rounded-full border border-border bg-card text-xs font-semibold text-muted-foreground tabular-nums shadow-xs"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <h2
                      id={`${id}-heading`}
                      className="text-lg leading-snug font-semibold tracking-tight text-foreground sm:pt-1.5"
                    >
                      {section.heading}
                    </h2>
                    <p className="mt-2.5 max-w-prose text-[15px] leading-7 text-muted-foreground">
                      {section.body}
                    </p>
                    {section.steps && section.steps.length > 0 ? (
                      <ol className="mt-4 space-y-2.5">
                        {section.steps.map((step, stepIndex) => (
                          <li
                            key={step}
                            className="flex gap-3 text-[15px] leading-7 text-foreground/90"
                          >
                            <span
                              aria-hidden="true"
                              className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] leading-none font-semibold text-primary tabular-nums"
                            >
                              {stepIndex + 1}
                            </span>
                            <span className="min-w-0">{step}</span>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                    {section.image ? (
                      <figure className="mt-6">
                        <Image
                          src={section.image.src}
                          loading="eager"
                          unoptimized
                          alt={section.image.alt}
                          width={484}
                          height={285}
                          className="h-auto w-full max-w-md rounded-lg border border-border"
                        />
                        <figcaption className="mt-2 text-sm leading-6 text-muted-foreground">
                          {section.image.caption}
                        </figcaption>
                      </figure>
                    ) : null}
                    {section.videoPlaceholder ? (
                      <figure className="mt-6">
                        <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-lg border border-border bg-muted px-6 text-center">
                          <Video
                            className="size-8 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <p className="text-sm font-medium">
                            {section.videoPlaceholder}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Video placeholder · Recording to be added
                          </p>
                        </div>
                      </figure>
                    ) : null}
                    {section.tip ? (
                      <p className="mt-4 text-sm leading-6 text-muted-foreground">
                        <span className="font-medium text-foreground">
                          Tip:{" "}
                        </span>
                        {section.tip}
                      </p>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>

          {(previous || next) && (
            <nav
              aria-label="More help guides"
              className="mt-10 grid gap-3 sm:grid-cols-2"
            >
              {previous && (
                <AdjacentLink article={previous} direction="previous" />
              )}
              {next && <AdjacentLink article={next} direction="next" />}
            </nav>
          )}
        </article>

        <aside className="min-w-0 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-7.5rem)] lg:overflow-y-auto lg:pr-3">
          <div className="hidden lg:block">
            <ArticleToc items={tocItems} />
          </div>
          {related.length > 0 ? (
            <section aria-labelledby="related-guides-heading" className="mt-8">
              <h2
                id="related-guides-heading"
                className="text-base font-semibold tracking-tight text-foreground"
              >
                Related guides
              </h2>
              <ul className="mt-4 grid gap-3">
                {related.map((item) => (
                  <RelatedGuideCard key={item.slug} article={item} />
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </AppShell>
  );
}
