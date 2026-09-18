export function academicStructureModelResponseError({
  finishReason,
  responseError,
}: {
  finishReason: string | null;
  responseError: string | null;
}) {
  if (finishReason === "length") {
    return "The model reached its output limit before completing the import response. Retry the import with a larger output allowance or another model.";
  }
  return responseError;
}
