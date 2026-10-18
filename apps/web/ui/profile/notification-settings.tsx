import { Checkbox } from "@coursemap/ui/primitives/checkbox";
import { ComingSoon } from "@/ui/profile/coming-soon";
import { SettingsSection } from "@/ui/profile/settings-section";

const REMINDERS = [
  {
    key: "census",
    label: "Census dates",
    description: "The last day to drop a course without paying for it.",
  },
  {
    key: "enrolment",
    label: "Enrolment opening",
    description: "When the next semester's enrolment opens.",
  },
  {
    key: "results",
    label: "Results released",
    description: "When final grades are published.",
  },
  {
    key: "summary",
    label: "Weekly plan summary",
    description: "What's left in your requirements.",
  },
] as const;

/** Email reminders, shown so their place is clear before they are sent. */
export function NotificationSettings() {
  return (
    <SettingsSection title="Email reminders" description={<ComingSoon />}>
      <ul className="divide-y divide-border">
        {REMINDERS.map((reminder) => (
          <li key={reminder.key}>
            <label className="flex cursor-not-allowed items-start gap-3 px-5 py-3.5 opacity-70">
              <Checkbox disabled className="mt-0.5" />
              <span>
                <span className="block text-[13px] font-medium text-foreground">
                  {reminder.label}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {reminder.description}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </SettingsSection>
  );
}
