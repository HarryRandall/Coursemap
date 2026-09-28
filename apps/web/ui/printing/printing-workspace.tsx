"use client";

import { useState } from "react";
import { ExternalLink, FileText, Printer, Upload, Wallet } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { Card, CardContent } from "@coursemap/ui/primitives/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@coursemap/ui/primitives/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coursemap/ui/primitives/table";

const ANU_WEB_PRINT_URL =
  "https://app.anu-mskm.com.au/app?service=page/UserWebPrint";

function PrintingBars({ compact = false }: { compact?: boolean }) {
  return (
    <div aria-hidden="true" className="flex h-full flex-col gap-3">
      <div className="flex flex-1 items-end justify-around gap-3 border-b border-dashed border-border">
        {(compact
          ? [25, 45, 35, 65, 80]
          : [25, 40, 30, 60, 45, 75, 55, 85]
        ).map((height, index) => (
          <span
            key={index}
            className="w-full max-w-10 rounded-t-md bg-muted"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <div className="flex justify-around gap-3">
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className="h-2 w-8 rounded-sm bg-muted" />
        ))}
      </div>
    </div>
  );
}

function PrintingLine() {
  return (
    <div aria-hidden="true" className="flex h-full flex-col gap-3">
      <svg
        className="min-h-0 flex-1 text-muted"
        viewBox="0 0 300 100"
        preserveAspectRatio="none"
      >
        <path
          d="M0 75 L50 65 L100 70 L150 45 L200 50 L250 35 L300 25 L300 100 L0 100 Z"
          fill="currentColor"
          opacity={0.35}
        />
        <path
          d="M0 75 L50 65 L100 70 L150 45 L200 50 L250 35 L300 25"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex justify-between">
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className="h-2 w-8 rounded-sm bg-muted" />
        ))}
      </div>
    </div>
  );
}

function PrintingHistory({ transactions = false }: { transactions?: boolean }) {
  const headings = transactions
    ? ["Date", "Account", "Type", "Amount", "Balance"]
    : ["Document", "Date", "Pages", "Cost", "Status"];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {headings.map((heading) => (
            <TableHead key={heading} className="first:pl-5 last:pr-5">
              {heading}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell colSpan={headings.length} className="h-48 text-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              {transactions ? (
                <Wallet className="size-7 opacity-40" aria-hidden="true" />
              ) : (
                <Printer className="size-7 opacity-40" aria-hidden="true" />
              )}
              <p className="text-sm">
                {transactions ? "No transactions yet" : "No print jobs yet"}
              </p>
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

export function PrintingWorkspace() {
  const [activity, setActivity] = useState("pages");
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-3">
        <Card className="min-w-0 py-0">
          <CardContent className="flex flex-col gap-4 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Available credit</h2>
              <Wallet
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
            <div className="flex h-24 flex-col justify-end">
              <dl className="space-y-2 text-xs">
                {["University", "Top-up"].map((account) => (
                  <div
                    key={account}
                    className="flex items-center justify-between gap-4"
                  >
                    <dt className="text-muted-foreground">{account}</dt>
                    <dd>
                      <span className="sr-only">Unavailable</span>
                      <span
                        aria-hidden="true"
                        className="block h-2.5 w-12 rounded-sm bg-muted"
                      />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </CardContent>
        </Card>
        {[
          { title: "Pages printed", Icon: FileText },
          { title: "Print jobs", Icon: Printer },
        ].map(({ title, Icon }, index) => (
          <Card key={title} className="min-w-0 py-0">
            <CardContent className="flex flex-col gap-4 p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{title}</h2>
                <Icon
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
              <div className="relative h-24">
                <span className="absolute top-0 right-0 text-xs text-muted-foreground">
                  No usage yet
                </span>
                <div className="h-full pt-6">
                  {index === 0 ? <PrintingBars compact /> : <PrintingLine />}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="min-w-0 py-0 lg:col-span-2">
          <CardContent className="flex flex-col gap-5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Printing activity</h2>
              <Tabs value={activity} onValueChange={setActivity}>
                <TabsList aria-label="Printing activity measure">
                  <TabsTrigger value="pages">Pages</TabsTrigger>
                  <TabsTrigger value="spending">Spending</TabsTrigger>
                </TabsList>
                <TabsContent value="pages" className="sr-only">
                  No page usage available.
                </TabsContent>
                <TabsContent value="spending" className="sr-only">
                  No spending history available.
                </TabsContent>
              </Tabs>
            </div>
            <div className="h-44">
              {activity === "pages" ? <PrintingBars /> : <PrintingLine />}
            </div>
          </CardContent>
        </Card>
        <Card className="min-w-0 py-0">
          <CardContent className="flex h-full flex-col gap-4 p-5">
            <h2 className="text-sm font-semibold">Print a document</h2>
            <div className="flex min-h-36 flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-5">
              <Upload
                className="size-6 text-muted-foreground/50"
                aria-hidden="true"
              />
              <Button disabled size="sm" variant="outline">
                Upload document
              </Button>
            </div>
            <Button asChild variant="ghost" size="sm" className="self-center">
              <a href={ANU_WEB_PRINT_URL} target="_blank" rel="noreferrer">
                Use ANU Web Print <ExternalLink aria-hidden="true" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0 gap-0 overflow-hidden py-0">
        <Tabs defaultValue="jobs" className="gap-0">
          <div className="border-b border-border px-5 pt-2">
            <TabsList variant="line" aria-label="Printing history">
              <TabsTrigger value="jobs">Recent jobs</TabsTrigger>
              <TabsTrigger value="transactions">Transactions</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="jobs">
            <PrintingHistory />
          </TabsContent>
          <TabsContent value="transactions">
            <PrintingHistory transactions />
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
