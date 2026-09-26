"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  EllipsisVertical,
  GraduationCap,
  LogOut,
  MessageCircle,
  Shield,
  SunMoon,
  UserRound,
} from "lucide-react";
import styles from "./account-menu.module.css";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@coursemap/ui/primitives/popover";
import {
  SidebarMenuButton,
  useSidebar,
} from "@coursemap/ui/primitives/sidebar";
import { useCoursemap } from "@/app/providers";
import { GeneratedAvatar } from "@/ui/common/generated-avatar";
import { AccountAppearance } from "@/ui/shell/account-appearance";

const accountLinks = [
  { href: "/profile", label: "Edit details", icon: UserRound },
  {
    href: "/profile?tab=study",
    label: "Update degree plan",
    icon: GraduationCap,
  },
  { href: "/profile?tab=account", label: "Account", icon: Shield },
];

export function AccountMenu() {
  const { state } = useCoursemap();
  const { isMobile, setOpenMobile, state: sidebarState } = useSidebar();
  const [open, setOpen] = useState(false);
  const profileLink = useRef<HTMLAnchorElement>(null);
  const profile = state.profile;
  const name = profile.name || "Your account";
  const collapsed = !isMobile && sidebarState === "collapsed";
  const closeOnNavigate = () => {
    setOpen(false);
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <SidebarMenuButton
          size="lg"
          tooltip="Account options"
          aria-label="Account options"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <GeneratedAvatar name={profile.name} email={profile.email} />
          <span className="grid min-w-0 flex-1 text-left leading-tight">
            <span className="truncate text-[13px] font-semibold">{name}</span>
            <span className="truncate text-[11px] text-muted-foreground">
              {profile.studentId || "Personal account"}
            </span>
          </span>
          <EllipsisVertical
            aria-hidden="true"
            className="ml-auto size-4 text-muted-foreground group-data-[collapsible=icon]:hidden"
          />
        </SidebarMenuButton>
      </PopoverTrigger>
      <PopoverContent
        aria-label="Account options"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          profileLink.current?.focus();
        }}
        side={collapsed ? "right" : "top"}
        align={collapsed ? "end" : "start"}
        sideOffset={8}
        collisionPadding={12}
        // Open level with the account row and exactly as wide, so the menu sits
        // inside the sidebar. A collapsed sidebar has no row width to match.
        className={`${styles.panel} max-h-[var(--radix-popover-content-available-height)] ${collapsed ? "w-60" : "w-(--radix-popover-trigger-width)"} max-w-[calc(100vw-24px)] gap-0 overflow-y-auto rounded-xl p-0`}
      >
        <div className="flex items-center gap-3 px-3 py-3">
          <GeneratedAvatar
            name={profile.name}
            email={profile.email}
            className="size-9 text-xs"
          />
          <div className="min-w-0">
            <p className="truncate font-medium">{name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {profile.email || "Personal account"}
            </p>
          </div>
        </div>
        <div className="border-t p-1.5">
          {accountLinks.map(({ href, label, icon: Icon }) => (
            <Button key={href} asChild variant="ghost" className={styles.row}>
              <Link
                ref={href === "/profile" ? profileLink : undefined}
                href={href}
                onClick={closeOnNavigate}
              >
                <Icon aria-hidden="true" />
                {label}
              </Link>
            </Button>
          ))}
        </div>
        <div className="border-t p-1.5">
          <div className={styles.themeRow}>
            <span className="flex items-center gap-2.5">
              <SunMoon aria-hidden="true" />
              Theme
            </span>
            <AccountAppearance />
          </div>
          <Button asChild variant="ghost" className={styles.row}>
            <Link href="/help#contact" onClick={closeOnNavigate}>
              <MessageCircle aria-hidden="true" />
              Feedback
            </Link>
          </Button>
        </div>
        <form action="/auth/logout" method="post" className="border-t p-1.5">
          <Button
            type="submit"
            variant="ghost"
            className={`${styles.row} ${styles.signOut}`}
          >
            <LogOut aria-hidden="true" />
            Sign out
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
