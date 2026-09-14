import { LinkedTableRow } from "@/ui/common/linked-table-row";
import { badgeVariantForTone } from "@/lib/ui";
import { Badge } from "@coursemap/ui/components/badge";
import Link from "next/link";

import {
  DataTableShell,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/admin/catalogue-table/catalogue-table";
import { CatalogueEmpty } from "@/ui/admin/catalogue-table/catalogue-empty";
import { CatalogueRowActions } from "@/ui/admin/catalogue-table/catalogue-row-actions";
import { GeneratedAvatar } from "@/ui/common/generated-avatar";
import type { AdminRole, AdminUser, AdminUserRole } from "@/lib/admin/users";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function roleTone(role: AdminRole): "brand" | "neutral" {
  return role.key === "admin" ? "brand" : "neutral";
}

export function UserDirectory({
  users,
  roles,
  assignments,
  currentUserId,
  filtered = false,
}: {
  users: AdminUser[];
  roles: AdminRole[];
  assignments: AdminUserRole[];
  currentUserId: string;
  filtered?: boolean;
}) {
  const rolesByKey = new Map(roles.map((role) => [role.key, role]));
  const rolesByUser = new Map<string, AdminRole>();
  for (const assignment of assignments) {
    const role = rolesByKey.get(assignment.roleKey);
    if (!role) continue;
    rolesByUser.set(assignment.userId, role);
  }

  return (
    <DataTableShell
      selectable={false}
      layout="users"
      footer={
        <p className="flex h-8 items-center text-xs text-muted-foreground tabular-nums">
          {users.length.toLocaleString("en-AU")}{" "}
          {users.length === 1 ? "user" : "users"}
        </p>
      }
    >
      {users.length === 0 ? (
        <CatalogueEmpty
          filtered={filtered}
          title="No users yet"
          description="Users will appear here after they sign up."
          clearHref="/admin/users"
        />
      ) : (
        <Table>
          <TableCaption className="sr-only">
            Coursemap users and roles
          </TableCaption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const href = `/admin/users/${user.userId}`;
              const userRole = rolesByUser.get(user.userId);
              return (
                <LinkedTableRow key={user.userId} className="group">
                  <TableCell className="p-0">
                    <Link
                      data-row-link
                      href={href}
                      className="flex items-center gap-2.5 rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
                    >
                      <span className="shrink-0">
                        <GeneratedAvatar
                          name={user.displayName}
                          email={user.email}
                          className="size-7 text-[10px]"
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-[13px] font-medium text-foreground group-hover:text-primary">
                            {user.displayName}
                          </span>
                          {user.userId === currentUserId ? (
                            <Badge
                              className="px-2 py-0.5"
                              variant={"primary-light"}
                            >
                              You
                            </Badge>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {user.email ?? "No email"}
                        </span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex min-h-10 items-center gap-1.5">
                      {userRole ? (
                        <Badge
                          variant={badgeVariantForTone[roleTone(userRole)]}
                        >
                          {userRole.name}
                        </Badge>
                      ) : (
                        <Badge variant={"outline"}>User</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatDate(user.createdAt)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatDate(user.updatedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <CatalogueRowActions
                      label={user.displayName}
                      links={[{ label: "View user", href }]}
                    />
                  </TableCell>
                </LinkedTableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </DataTableShell>
  );
}
