import { HelpContact } from "@/ui/help/help-contact";
import { HelpGuides } from "@/ui/help/help-guides";
import { AppShell } from "@/ui/shell";

export default function HelpPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full animate-fade-in space-y-12 py-2 sm:py-4">
        <h1 className="sr-only">Help centre</h1>
        <HelpGuides />
        <HelpContact />
      </div>
    </AppShell>
  );
}
