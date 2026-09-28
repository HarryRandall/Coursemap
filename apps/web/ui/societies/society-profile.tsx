"use client";

import { usePathname, useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Badge } from "@coursemap/ui/primitives/badge";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@coursemap/ui/primitives/tabs";
import type { Society } from "@/lib/societies";
import type { SocietyEvent } from "@/lib/society-events";
import { SocietyEmblem } from "@/ui/societies/society-emblem";
import { useSocietyParams } from "@/ui/societies/use-society-params";
import { SocietyEvents } from "@/ui/societies/society-events";
import { SocietySocialLinks } from "@/ui/societies/society-social-links";
import { SocietyEmptyState } from "@/ui/societies/society-empty-state";

export function SocietyProfile({
  society,
  upcoming,
  past,
  initialQuery = "",
}: {
  society: Society;
  upcoming: SocietyEvent[];
  past: SocietyEvent[];
  initialQuery?: string;
}) {
  const params = useSocietyParams(initialQuery);
  const pathname = usePathname();
  const router = useRouter();
  const selectTab = (tab: string) => {
    const next = new URLSearchParams(params.toString());
    if (tab === "overview") next.delete("tab");
    else next.set("tab", tab);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const initialTab = params.get("tab");
  const directoryUrl =
    society.directoryUrl ?? "https://anusa.com.au/clubs/clubs-list/";
  return (
    <div className="workspace-stack gap-8">
      <header className="flex shrink-0 flex-wrap items-center gap-4">
        <div className="flex min-w-0 basis-full items-center gap-4 sm:flex-1 sm:basis-0">
          <SocietyEmblem society={society} large />
          <div className="min-w-0 flex-1 space-y-2">
            <h1 className="text-xl leading-snug font-semibold sm:text-2xl">
              {society.name}
            </h1>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="secondary">{society.category}</Badge>
              <SocietySocialLinks links={society.links} />
            </div>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <a
            href={society.website ?? directoryUrl}
            target="_blank"
            rel="noreferrer"
          >
            {society.website ? "Club website" : "Club directory"}
            <ExternalLink aria-hidden="true" />
          </a>
        </Button>
      </header>
      <Tabs
        value={
          initialTab &&
          ["overview", "events", "membership", "reviews"].includes(initialTab)
            ? initialTab
            : "overview"
        }
        onValueChange={selectTab}
        className="workspace-stack gap-6"
      >
        <div className="shrink-0 overflow-x-auto border-b">
          <TabsList variant="line" aria-label="Club profile">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="membership">Membership</TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overview" className="workspace-stack">
          <div className="workspace-scroll">
            <div className="grid items-start gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <section className="space-y-5 rounded-xl bg-card p-6 ring-1 ring-border dark:ring-0">
                  <h2 className="text-base font-semibold">About the club</h2>
                  <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                    {society.overview}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {society.interests.map((interest) => (
                      <Badge key={interest} variant="secondary">
                        {interest}
                      </Badge>
                    ))}
                  </div>
                </section>
                <section className="space-y-4">
                  <h2 className="text-base font-semibold">Next event</h2>
                  <SocietyEvents
                    events={upcoming.slice(0, 1)}
                    layout="single"
                  />
                </section>
              </div>
              <SocietyEmptyState
                size="compact"
                kind="membership"
                directoryUrl={directoryUrl}
              />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="events" className="workspace-stack">
          <div className="workspace-scroll flex flex-col gap-8">
            {!upcoming.length && !past.length ? (
              <SocietyEmptyState kind="events" />
            ) : (
              <>
                <section className="space-y-4">
                  <h2 className="text-base font-semibold">Upcoming events</h2>
                  <SocietyEvents events={upcoming} />
                </section>
                <section className="space-y-4">
                  <h2 className="text-base font-semibold">Past events</h2>
                  <SocietyEvents events={past} past />
                </section>
              </>
            )}
          </div>
        </TabsContent>
        <TabsContent value="membership" className="workspace-stack">
          <div className="workspace-scroll flex flex-col">
            <SocietyEmptyState kind="membership" directoryUrl={directoryUrl} />
          </div>
        </TabsContent>
        <TabsContent value="reviews" className="workspace-stack">
          <div className="workspace-scroll flex flex-col">
            <SocietyEmptyState kind="reviews" directoryUrl={directoryUrl} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
