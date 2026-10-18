import { Check, KeyRound, LogOut, MonitorSmartphone } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { ComingSoon } from "@/ui/profile/coming-soon";
import { SettingsRow, SettingsSection } from "@/ui/profile/settings-section";

/**
 * How the student signs in. Only signing out works today; the rest shows
 * where linking providers, passwords and sessions will live.
 */
export function SecuritySettings({
  logoutFormId,
}: {
  /** The standalone logout form, so signing out never submits the profile. */
  logoutFormId: string;
}) {
  return (
    <SettingsSection title="Sign-in and security">
      <SettingsRow
        label="Sign-in methods"
        description="Link Google or Microsoft to sign in with them."
      >
        <ul className="w-full max-w-xs divide-y divide-border rounded-lg border border-border text-[13px]">
          <li className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="text-foreground">Email and password</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Check aria-hidden="true" className="size-3.5 text-primary" />
              Connected
            </span>
          </li>
          {["Google", "Microsoft"].map((provider) => (
            <li
              key={provider}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span className="text-muted-foreground">{provider}</span>
              <ComingSoon />
            </li>
          ))}
        </ul>
      </SettingsRow>
      <SettingsRow
        label={
          <>
            Password <ComingSoon />
          </>
        }
      >
        <Button type="button" variant="outline" disabled>
          <KeyRound aria-hidden="true" />
          Change password
        </Button>
      </SettingsRow>
      <SettingsRow
        label="Sessions"
        description="Your plan stays in your account when you sign out."
      >
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Button form={logoutFormId} type="submit" variant="outline">
            <LogOut aria-hidden="true" />
            Sign out
          </Button>
          <Button type="button" variant="ghost" disabled>
            <MonitorSmartphone aria-hidden="true" />
            Sign out everywhere
          </Button>
        </div>
      </SettingsRow>
    </SettingsSection>
  );
}
