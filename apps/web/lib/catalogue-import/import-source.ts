export type ImportDiagnostic = {
  code: string;
  severity: "warning" | "error";
  message: string;
  field?: string;
  sourceFragment?: string;
};

export type ImportManifestSource = {
  name: string;
  kind: string;
  baseUrl: string;
};
