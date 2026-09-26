"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { ArrowLeft, Orbit, type LucideIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@coursemap/ui/primitives/sidebar";
import { useCoursemap } from "@/app/providers";
import { AccountMenu } from "@/ui/shell/account-menu";
import { BrandMark } from "@/ui/brand-mark";
import { CourseFind } from "@/ui/course-find";
import { routeIcons } from "@/ui/shell/route-icons";

type NavItem = {
  href: string;
  activePath?: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
};

type NavSection = {
  label: string | null;
  items: NavItem[];
};

const studentNav: NavSection[] = [
  {
    label: null,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: routeIcons.dashboard },
      { href: "/plan", label: "Planner", icon: routeIcons.plan },
      {
        href: "/requirements",
        label: "Requirements",
        icon: routeIcons.requirements,
      },
      {
        href: "/academic",
        label: "Academic history",
        icon: routeIcons.academic,
      },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/compass/new", label: "Compass", icon: Orbit, badge: "Beta" },
      { href: "/courses", label: "Explore courses", icon: routeIcons.courses },
      { href: "/calendar", label: "Calendar", icon: routeIcons.calendar },
      { href: "/key-dates", label: "Key dates", icon: routeIcons["key-dates"] },
      {
        href: "/rooms",
        label: "Room finder",
        icon: routeIcons.rooms,
        badge: "Preview",
      },
    ],
  },
  {
    label: "Support",
    items: [
      { href: "/roadmap", label: "Product roadmap", icon: routeIcons.roadmap },
      { href: "/help", label: "Help centre", icon: routeIcons.help },
    ],
  },
];

/** Grouped around the operator's jobs: catalogue, campus data and access control. */
function adminNavigation(catalogueYear: number): NavSection[] {
  const catalogueItem = (
    segment: string,
    label: string,
    icon: LucideIcon,
  ): NavItem => ({
    href: `/admin/${segment}/${catalogueYear}`,
    activePath: `/admin/${segment}`,
    label,
    icon,
  });

  return [
    {
      label: null,
      items: [
        {
          href: "/admin/dashboard",
          label: "Dashboard",
          icon: routeIcons["admin-dashboard"],
        },
      ],
    },
    {
      label: "Catalogue",
      items: [
        catalogueItem("courses", "Courses", routeIcons.courses),
        catalogueItem("programmes", "Programmes", routeIcons.programmes),
        catalogueItem("majors", "Majors", routeIcons.majors),
        catalogueItem("minors", "Minors", routeIcons.minors),
        catalogueItem(
          "specialisations",
          "Specialisations",
          routeIcons.specialisations,
        ),
        {
          href: "/admin/key-dates",
          label: "Key dates",
          icon: routeIcons["key-dates"],
        },
        {
          href: "/admin/operations/catalogue",
          label: "Activity",
          icon: routeIcons.sync,
        },
      ],
    },
    {
      label: "Campus",
      items: [
        {
          href: "/admin/rooms",
          label: "Indoor maps",
          icon: routeIcons["admin-rooms"],
        },
      ],
    },
    {
      label: "Access",
      items: [
        { href: "/admin/users", label: "Users", icon: routeIcons.users },
        { href: "/admin/roles", label: "Roles", icon: routeIcons.roles },
      ],
    },
  ];
}

export function adminCatalogueNavigationYear(
  pathname: string,
  profileCatalogueYear: number,
) {
  const match = pathname.match(
    /^\/admin\/(?:courses|programmes|majors|minors|specialisations)\/(\d{4})(?:\/|$)/,
  );
  return match ? Number(match[1]) : profileCatalogueYear;
}

/** Shown to students who hold an admin role. */
const adminEntryNav: NavSection[] = [
  {
    label: "Administration",
    items: [
      {
        href: "/admin/dashboard",
        label: "Admin console",
        icon: routeIcons.admin,
      },
    ],
  },
];

/** Shown at the bottom of the admin shell. */
const studentEntryNav: NavSection[] = [
  {
    label: null,
    items: [
      {
        href: "/dashboard",
        label: "Back to dashboard",
        icon: ArrowLeft,
      },
    ],
  },
];

function NavMenuItem({
  item,
  onNavigate,
}: {
  item: NavItem;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const activePath = item.activePath ?? item.href;
  const isActive =
    item.href === "/admin/dashboard"
      ? pathname === item.href || pathname === "/admin"
      : pathname === activePath || pathname.startsWith(`${activePath}/`);
  const Icon = item.icon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={item.label}
        className="h-10 gap-3 px-3 data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground data-[active=true]:hover:bg-sidebar-primary data-[active=true]:hover:text-sidebar-primary-foreground"
      >
        <Link href={item.href} onClick={onNavigate}>
          <Icon aria-hidden="true" />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
      {item.badge ? (
        <SidebarMenuBadge className="top-1/2! right-3 -translate-y-1/2 rounded-sm bg-primary/10 px-1.5 text-[9px] font-bold text-primary uppercase">
          {item.badge}
        </SidebarMenuBadge>
      ) : null}
    </SidebarMenuItem>
  );
}

function NavSections({
  sections,
  onNavigate,
}: {
  sections: NavSection[];
  onNavigate: () => void;
}) {
  return (
    <>
      {sections.map((section, index) => (
        <Fragment key={section.label ?? "primary"}>
          {index > 0 ? <SidebarSeparator className="mx-0 w-full" /> : null}
          <SidebarGroup className="px-3 py-2 group-data-[collapsible=icon]:px-2">
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {section.items.map((item) => (
                  <NavMenuItem
                    key={item.href}
                    item={item}
                    onNavigate={onNavigate}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </Fragment>
      ))}
    </>
  );
}

export function AppSidebar({ admin }: { admin: boolean }) {
  const { canAccessAdmin, state } = useCoursemap();
  const pathname = usePathname();
  const catalogueYear = adminCatalogueNavigationYear(
    pathname,
    state.profile.catalogueYear,
  );
  const { isMobile, setOpenMobile } = useSidebar();
  const closeMobileNav = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar variant="inset" collapsible="icon" className="select-none">
      <SidebarHeader className="gap-3 px-3 pb-3 transition-[padding] duration-200 ease-linear group-data-[collapsible=icon]:px-2 motion-reduce:transition-none">
        <Link
          href={admin ? "/admin/dashboard" : "/dashboard"}
          aria-label="Coursemap home"
          onClick={closeMobileNav}
          className="flex h-12 items-center gap-2.5 overflow-hidden rounded-md px-1.5 transition-[padding] duration-200 ease-linear group-data-[collapsible=icon]:px-0 motion-reduce:transition-none"
        >
          <BrandMark className="size-8 shrink-0" />
          <strong className="brand-wordmark shrink-0 text-[17px] transition-opacity duration-200 ease-linear group-data-[collapsible=icon]:opacity-0 motion-reduce:transition-none">
            coursemap
          </strong>
        </Link>

        <CourseFind admin={admin} onNavigate={closeMobileNav} />
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label={admin ? "Admin navigation" : "Student navigation"}>
          <NavSections
            sections={admin ? adminNavigation(catalogueYear) : studentNav}
            onNavigate={closeMobileNav}
          />
        </nav>

        {/* Cross-links between the student and admin shells share the same item styling as the main navigation. */}
        {!admin && canAccessAdmin ? (
          <>
            <SidebarSeparator className="mx-0 w-full" />
            <NavSections sections={adminEntryNav} onNavigate={closeMobileNav} />
          </>
        ) : null}
        {admin ? (
          <>
            <SidebarSeparator className="mx-0 w-full" />
            <NavSections
              sections={studentEntryNav}
              onNavigate={closeMobileNav}
            />
          </>
        ) : null}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <AccountMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
