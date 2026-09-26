import { TabsLoading } from "@/ui/common/tabs-loading";
import {
  KeyDatesListLoading,
  KeyDatesToolbarLoading,
} from "@/ui/admin/key-dates/key-dates-loading";
import { AppShell } from "@/ui/shell";

/** The whole page, shown on first load and when the year changes. */
export default function AdminKeyDatesYearLoading() {
  return (
    <AppShell
      admin
      fill
      loading
      tabs={<TabsLoading widths={["w-14", "w-12", "w-20"]} />}
    >
      <div className="workspace-stack w-full">
        <KeyDatesToolbarLoading />
        <KeyDatesListLoading />
      </div>
    </AppShell>
  );
}
