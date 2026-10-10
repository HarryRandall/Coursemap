import type { Profile } from "@/lib/coursemap/types";

/** Untouched fields follow the latest profile; edits compare array contents too. */
export function reconcileProfileDraft(
  draft: Profile,
  previousProfile: Profile,
  profile: Profile,
): Profile {
  const reconciled = { ...profile };
  function keepEditedField<Key extends keyof Profile>(key: Key) {
    if (JSON.stringify(draft[key]) !== JSON.stringify(previousProfile[key])) {
      reconciled[key] = draft[key];
    }
  }
  for (const key of Object.keys(draft) as (keyof Profile)[]) {
    keepEditedField(key);
  }
  return reconciled;
}
