import {
  Award,
  BookOpen,
  CalendarDays,
  CalendarRange,
  Eye,
  FileText,
  GitCompareArrows,
  GraduationCap,
  History,
  Import,
  KeyRound,
  LayoutDashboard,
  Library,
  LifeBuoy,
  ListChecks,
  Map,
  MapPin,
  MapPinned,
  Radar,
  RefreshCw,
  Route,
  Shield,
  Tag,
  Target,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

/**
 * One icon per route segment, shared by the sidebar, the breadcrumbs and any
 * page that refers to another part of the product. Keeping this in one place
 * is what stops the breadcrumb drifting away from the sidebar entry.
 */
export const routeIcons = {
  dashboard: LayoutDashboard,
  plan: Map,
  courses: BookOpen,
  requirements: ListChecks,
  academic: GraduationCap,
  calendar: CalendarDays,
  "key-dates": CalendarRange,
  roadmap: Route,
  rooms: MapPin,
  help: LifeBuoy,
  profile: UserRound,
  admin: Shield,
  "admin-dashboard": LayoutDashboard,
  "admin-rooms": MapPinned,
  programmes: GraduationCap,
  majors: Award,
  minors: Tag,
  specialisations: Target,
  users: UsersRound,
  roles: KeyRound,
  imports: Import,
  sync: RefreshCw,
  timetable: CalendarDays,
  // Catalogue activity, and the two questions it is asked.
  catalogue: Library,
  syncs: RefreshCw,
  discovery: Radar,
  // The sections of one catalogue record. "content" is the record path itself
  // rather than a segment of its own, and is named here so its tab and every
  // link to it wear the same icon as its siblings.
  content: FileText,
  "student-view": Eye,
  changes: GitCompareArrows,
  changelog: History,
} satisfies Record<string, LucideIcon>;

export type RouteIconKey = keyof typeof routeIcons;
