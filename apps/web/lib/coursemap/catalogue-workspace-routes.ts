/** Stable page routes; section and import selection remain shareable options. */
export function catalogueWorkspacePath(
  pathname: string,
  view = "review",
  search = "",
) {
  const base = pathname.replace(/\/(history|preview|versions\/[^/]+)$/, "");
  const params = new URLSearchParams(search);
  params.delete("view");
  params.delete("snapshot");
  params.delete("section");
  const page = view === "history" || view === "preview" ? `/${view}` : "";
  if (!["history", "preview", "review", "overview", "details"].includes(view))
    params.set("section", view);
  return `${base}${page}${params.size ? `?${params}` : ""}`;
}

export function catalogueWorkspaceView(
  pathname: string,
  search: URLSearchParams,
) {
  if (pathname.endsWith("/history")) return "history";
  if (pathname.endsWith("/preview")) return "preview";
  return search.get("section") ?? "review";
}
