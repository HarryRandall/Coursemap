import { AppShell } from "@/ui/shell/app-shell";
import { PrintingWorkspace } from "@/ui/printing/printing-workspace";

export default function PrintingPage() {
  return (
    <AppShell>
      <h1 className="sr-only">Printing</h1>
      <PrintingWorkspace />
    </AppShell>
  );
}
