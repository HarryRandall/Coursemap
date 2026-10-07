import { ImportModelPicker } from "@/ui/admin/imports/import-model-picker";
import { loadAdminDashboard } from "@/lib/admin/dashboard";
import { loadImportModelSetting } from "@/lib/admin/settings";
import { canManageCatalogueOperations } from "@/lib/auth/viewer";
import { AppShell } from "@/ui/shell";
import { AdminDashboard } from "@/ui/admin/dashboard/admin-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const [dashboard, importModel, canManageImports] = await Promise.all([
    loadAdminDashboard(),
    loadImportModelSetting(),
    canManageCatalogueOperations(),
  ]);

  return (
    <AppShell admin>
      <div className="mx-auto w-full">
        <h1 className="sr-only">Administration overview</h1>
        <AdminDashboard
          data={dashboard}
          importModel={
            <ImportModelPicker
              canManage={canManageImports}
              model={importModel.model}
              models={importModel.models}
              error={importModel.error}
              updatedAt={importModel.updatedAt}
            />
          }
        />
      </div>
    </AppShell>
  );
}
