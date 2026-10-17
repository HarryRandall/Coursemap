// Command-line imports write to the local database; there is no Next.js cache to expire.
export function revalidateTag() {}
export function revalidatePath() {}
export function updateTag() {}
export function unstable_cache(callback) {
  return callback;
}
