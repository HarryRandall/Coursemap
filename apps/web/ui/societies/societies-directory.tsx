"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, SearchX } from "lucide-react";
import { Badge } from "@coursemap/ui/primitives/badge";
import { Button } from "@coursemap/ui/primitives/button";
import { Card } from "@coursemap/ui/primitives/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@coursemap/ui/primitives/tabs";
import {
  SOCIETY_CATEGORIES,
  filterSocieties,
  type Society,
} from "@/lib/societies";
import { FilterBar } from "@/ui/common/filter-bar";
import type { SocietyEvent } from "@/lib/society-events";
import { SocietyEmblem } from "@/ui/societies/society-emblem";
import { useSocietyParams } from "@/ui/societies/use-society-params";
import { SocietyEvents } from "@/ui/societies/society-events";
import { SocietyScrollContent } from "@/ui/societies/society-scroll-content";

export function SocietiesDirectory({
  societies,
  events,
  initialQuery = "",
}: {
  societies: Society[];
  events: SocietyEvent[];
  initialQuery?: string;
}) {
  const params = useSocietyParams(initialQuery);
  const pathname = usePathname();
  const router = useRouter();
  const selectTab = (tab: string) => {
    const next = new URLSearchParams(params.toString());
    if (tab === "clubs") next.delete("tab");
    else next.set("tab", tab);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const visible = filterSocieties(
    societies,
    params.get("q") ?? "",
    params.get("category") ?? "",
  );
  const eventQuery = (params.get("q") ?? "").trim().toLowerCase();
  const eventCategory = params.get("event-category") ?? "";
  const organiser = params.get("society") ?? "";
  const visibleEvents = events.filter(
    (event) =>
      (!eventCategory || event.category === eventCategory) &&
      (!organiser || event.societySlug === organiser) &&
      [event.title, event.host, event.location].some((value) =>
        value.toLowerCase().includes(eventQuery),
      ),
  );
  const organisers = societies.filter((society) =>
    events.some((event) => event.societySlug === society.slug),
  );
  return (
    <Tabs
      value={params.get("tab") === "events" ? "events" : "clubs"}
      onValueChange={selectTab}
      className="workspace-stack gap-5"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b">
        <TabsList variant="line" aria-label="Societies">
          <TabsTrigger value="clubs">Clubs</TabsTrigger>
          <TabsTrigger value="events">Upcoming events</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="clubs" className="workspace-stack gap-5">
        <FilterBar
          searchPlaceholder="Search societies or interests..."
          filters={[
            {
              key: "category",
              label: "Category",
              allLabel: "All categories",
              options: SOCIETY_CATEGORIES.map((category) => ({
                value: category,
                label: category,
              })),
            },
          ]}
        />
        <SocietyScrollContent>
          {visible.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((society) => (
                <li key={society.slug} className="min-w-0">
                  <Link
                    href={`/societies/${society.slug}`}
                    aria-label={`View ${society.name}`}
                    className="group block h-full rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Card className="h-full gap-0 p-4 ring-1 ring-border group-hover:ring-foreground/20 dark:ring-0 dark:group-hover:ring-1">
                      <div className="mb-4 flex items-center gap-3">
                        <SocietyEmblem society={society} />
                        <h2 className="min-w-0 flex-1 text-base leading-snug font-semibold">
                          {society.name}
                        </h2>
                        <ArrowUpRight
                          aria-hidden="true"
                          className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground"
                        />
                      </div>
                      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                        {society.summary}
                      </p>
                      <div className="mt-auto">
                        <Badge variant="secondary">{society.category}</Badge>
                      </div>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Card className="items-center gap-3 px-5 py-12 text-center">
              <SearchX
                aria-hidden="true"
                className="size-7 text-muted-foreground"
              />
              <h2 className="text-sm font-semibold">No societies match</h2>
              <p className="text-sm text-muted-foreground">
                Try another interest or clear your filters.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/societies" scroll={false}>
                  Clear search and filters
                </Link>
              </Button>
            </Card>
          )}
        </SocietyScrollContent>
      </TabsContent>
      <TabsContent value="events" className="workspace-stack gap-5">
        <FilterBar
          searchPlaceholder="Search events, societies or locations..."
          filters={[
            {
              key: "event-category",
              label: "Category",
              allLabel: "All categories",
              options: [
                { value: "workshop", label: "Workshops" },
                { value: "social", label: "Social" },
                { value: "gaming", label: "Gaming" },
              ],
            },
            {
              key: "society",
              label: "Society",
              allLabel: "All societies",
              options: organisers.map((society) => ({
                value: society.slug,
                label: society.name,
              })),
            },
          ]}
        />
        <SocietyScrollContent>
          {events.length > 0 && visibleEvents.length === 0 ? (
            <Card className="items-center gap-3 px-5 py-12 text-center">
              <SearchX
                aria-hidden="true"
                className="size-7 text-muted-foreground"
              />
              <h2 className="text-sm font-semibold">No events match</h2>
              <p className="text-sm text-muted-foreground">
                Try another search or clear your filters.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/societies?tab=events" scroll={false}>
                  Clear search and filters
                </Link>
              </Button>
            </Card>
          ) : (
            <SocietyEvents events={visibleEvents} />
          )}
        </SocietyScrollContent>
      </TabsContent>
    </Tabs>
  );
}
