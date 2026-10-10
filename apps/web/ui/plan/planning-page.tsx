import type { ReactNode } from "react";
import { AppProvider } from "@/app/providers";
import { getAuthContext } from "@/lib/auth/viewer";
import { readGuestPlan } from "@/lib/coursemap/guest-plan-server";
import { loadCoursemapState } from "@/lib/coursemap/state";

/**
 * Loads private state below loading.tsx so default prefetching stops before
 * plan reads. The page and state loaders run together and share request reads.
 */
export function withPlanningState<Props>(
  renderPage: (props: Props) => ReactNode | Promise<ReactNode>,
) {
  return async function PlanningPage(props: Props) {
    const { viewer, canAccessAdmin } = await getAuthContext();
    const [initialState, children] = await Promise.all([
      viewer ? loadCoursemapState(viewer) : readGuestPlan(),
      renderPage(props),
    ]);
    return (
      <AppProvider
        viewer={viewer}
        canAccessAdmin={canAccessAdmin}
        guest={!viewer && Boolean(initialState)}
        initialState={initialState ?? undefined}
        renderGlobalUi={false}
      >
        {children}
      </AppProvider>
    );
  };
}
