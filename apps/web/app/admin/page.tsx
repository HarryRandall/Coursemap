import { UsersRound } from "lucide-react";
import { ImportModelCard } from "@/ui/admin/imports/import-model-card";
import { loadImportModelSetting } from "@/lib/admin/settings";
import { loadAdminUserSummary } from "@/lib/admin/users";
import { canManageCatalogueOperations } from "@/lib/auth/viewer";
import { AppShell } from "@/ui/shell";
import { StatTile } from "@/ui/common/stat-tile";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const [users, importModel, canManageImports] = await Promise.all([
    loadAdminUserSummary(),
    loadImportModelSetting(),
    canManageCatalogueOperations(),
  ]);

  return (
    <AppShell admin>
      <div className="mx-auto w-full space-y-5">
        <h1 className="sr-only">Administration overview</h1>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            href="/admin/users"
            icon={<UsersRound aria-hidden="true" />}
            label="Users"
            trend={users.history}
            trendLabel="Account growth to the current total"
            value={users.users}
          />
          <ImportModelCard
            canManage={canManageImports}
            model={importModel.model}
            models={importModel.models}
            error={importModel.error}
            updatedAt={importModel.updatedAt}
          />
        </div>
      </div>
    </AppShell>
  );
}
