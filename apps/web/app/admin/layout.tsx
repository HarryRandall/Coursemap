import { AppProvider } from "@/app/providers";
import { loadAdminShellState } from "@/lib/coursemap/state";
import { redirect } from "next/navigation";
import { AccessDeniedError } from "@/ui/errors/access-denied-error";
import { getAuthContext } from "@/lib/auth/viewer";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { viewer, canAccessAdmin } = await getAuthContext();
  if (!viewer) {
    redirect("/login?next=%2Fadmin%2Fdashboard");
  }

  if (!canAccessAdmin) {
    return <AccessDeniedError />;
  }

  return (
    <AppProvider
      viewer={viewer}
      canAccessAdmin={canAccessAdmin}
      initialState={await loadAdminShellState(viewer)}
      renderGlobalUi={false}
    >
      {children}
    </AppProvider>
  );
}
