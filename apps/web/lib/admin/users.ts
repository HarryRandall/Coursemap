import { cumulativeGrowthSeries } from "@/lib/coursemap/admin-catalogue-history";
import { createClient } from "@/lib/supabase/server";

export type AdminUser = {
  userId: string;
  email: string | null;
  displayName: string;
  studentNumber: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminRole = {
  id: number;
  key: string;
  name: string;
  description: string;
  permissionKeys: string[];
};

export type AdminPermission = {
  id: number;
  key: string;
  name: string;
  description: string;
  category: string;
};

export type AdminRolePermission = {
  roleId: number;
  permissionId: number;
};

export type AdminUserRole = {
  userId: string;
  roleKey: string;
  grantedBy: string | null;
  grantedByDisplayName: string | null;
  grantedAt: string | null;
};

export type AdminUserPlan = {
  id: string;
  name: string;
  status: string;
  catalogueYear: number;
  commencementYear: number;
  studyLoad: "full_time" | "part_time";
  extensionYears: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminUserPlanStructure = {
  role: string;
  code: string;
  name: string;
  units: number;
};

export type AdminUserCourseStatus =
  "planned" | "enrolled" | "completed" | "failed" | "withdrawn" | "credited";

export type AdminUserCourse = {
  id: string;
  code: string;
  title: string;
  units: number;
  unitsEarned: number;
  calendarYear: number | null;
  periodCode: string | null;
  periodName: string | null;
  periodShortName: string | null;
  status: AdminUserCourseStatus;
  mark: number | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminUserStudy = {
  plan: AdminUserPlan | null;
  structures: AdminUserPlanStructure[];
  courses: AdminUserCourse[];
};

export type AdminUserManagementData = {
  users: AdminUser[];
  roles: AdminRole[];
  assignments: AdminUserRole[];
};

export type AdminUserDetailData = {
  user: AdminUser;
  roles: AdminRole[];
  permissions: AdminPermission[];
  assignments: AdminUserRole[];
  study: AdminUserStudy;
};

export type AdminRoleManagementData = {
  roles: AdminRole[];
  permissions: AdminPermission[];
  grants: AdminRolePermission[];
};

type AdminPlanItemRow = {
  academic_period_id: number | null;
  academic_year_id: number;
  course_id: number;
  created_at: string;
  id: string;
  planned_calendar_year: number | null;
  planned_period_code: string | null;
  sort_order: number;
  updated_at: string;
};

type AdminCourseAttemptRow = {
  academic_period_id: number;
  course_id: number;
  course_snapshot_id: number;
  created_at: string;
  id: string;
  mark: number | null;
  status: string;
  units_attempted: number;
  units_earned: number;
  updated_at: string;
};

function mapUser(user: {
  user_id: string | null;
  email: string | null;
  display_name: string | null;
  student_number: string | null;
  created_at: string | null;
  updated_at: string | null;
}): AdminUser | null {
  if (!user.user_id || !user.display_name || !user.created_at) return null;
  return {
    userId: user.user_id,
    email: user.email,
    displayName: user.display_name,
    studentNumber: user.student_number,
    createdAt: user.created_at,
    updatedAt: user.updated_at ?? user.created_at,
  };
}

function mapRole(role: {
  role_id: number | null;
  role_key: string | null;
  role_name: string | null;
  role_description: string | null;
  permission_keys: string[] | null;
}): AdminRole | null {
  if (
    role.role_id === null ||
    !role.role_key ||
    !role.role_name ||
    !role.role_description
  ) {
    return null;
  }
  return {
    id: role.role_id,
    key: role.role_key,
    name: role.role_name,
    description: role.role_description,
    permissionKeys: role.permission_keys ?? [],
  };
}

function mapPermission(permission: {
  permission_id: number | null;
  permission_key: string | null;
  permission_name: string | null;
  permission_description: string | null;
  permission_category: string | null;
}): AdminPermission | null {
  if (
    permission.permission_id === null ||
    !permission.permission_key ||
    !permission.permission_name ||
    !permission.permission_description ||
    !permission.permission_category
  ) {
    return null;
  }
  return {
    id: permission.permission_id,
    key: permission.permission_key,
    name: permission.permission_name,
    description: permission.permission_description,
    category: permission.permission_category,
  };
}

function mapRolePermission(grant: {
  role_id: number | null;
  permission_id: number | null;
}): AdminRolePermission | null {
  if (grant.role_id === null || grant.permission_id === null) return null;
  return { roleId: grant.role_id, permissionId: grant.permission_id };
}

function mapAssignment(assignment: {
  user_id: string | null;
  role_key: string | null;
  granted_by: string | null;
  granted_at: string | null;
}): AdminUserRole | null {
  if (!assignment.user_id || !assignment.role_key) return null;
  return {
    userId: assignment.user_id,
    roleKey: assignment.role_key,
    grantedBy: assignment.granted_by,
    grantedByDisplayName: null,
    grantedAt: assignment.granted_at,
  };
}

function studyLoad(value: string): AdminUserPlan["studyLoad"] {
  return value === "part_time" ? "part_time" : "full_time";
}

function courseStatus(value: string): AdminUserCourseStatus | null {
  return ["enrolled", "completed", "failed", "withdrawn", "credited"].includes(
    value,
  )
    ? (value as AdminUserCourseStatus)
    : null;
}

export type AdminUserSummary = {
  history: number[];
  users: number;
};

export async function loadAdminUserSummary(): Promise<AdminUserSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("admin_users")
    .select("created_at");
  if (error) throw new Error("Coursemap could not load user totals.");
  const rows = data ?? [];
  return {
    history: cumulativeGrowthSeries(
      rows
        .map((row) => row.created_at)
        .filter((value): value is string => typeof value === "string"),
    ),
    users: rows.length,
  };
}

export async function loadAdminUserManagement(): Promise<AdminUserManagementData> {
  const supabase = await createClient();
  const [usersResult, rolesResult, assignmentsResult] = await Promise.all([
    supabase
      .from("admin_users")
      .select("user_id,email,display_name,created_at,updated_at,student_number")
      .order("created_at", { ascending: false }),
    supabase
      .from("admin_roles")
      .select("role_id,role_key,role_name,role_description,permission_keys")
      .order("role_name"),
    supabase
      .from("admin_user_roles")
      .select("user_id,role_key,granted_by,granted_at"),
  ]);

  const error =
    usersResult.error ?? rolesResult.error ?? assignmentsResult.error;
  if (error) throw new Error("Coursemap could not load user access settings.");

  return {
    users: (usersResult.data ?? []).flatMap((user) => {
      const mapped = mapUser(user);
      return mapped ? [mapped] : [];
    }),
    roles: (rolesResult.data ?? []).flatMap((role) => {
      const mapped = mapRole(role);
      return mapped ? [mapped] : [];
    }),
    assignments: (assignmentsResult.data ?? []).flatMap((assignment) => {
      const mapped = mapAssignment(assignment);
      return mapped ? [mapped] : [];
    }),
  };
}

export async function loadAdminUserDetail(
  userId: string,
): Promise<AdminUserDetailData | null> {
  const supabase = await createClient();
  const [
    userResult,
    rolesResult,
    permissionsResult,
    assignmentsResult,
    planResult,
  ] = await Promise.all([
    supabase
      .from("admin_users")
      .select("user_id,email,display_name,created_at,updated_at,student_number")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("admin_roles")
      .select("role_id,role_key,role_name,role_description,permission_keys")
      .order("role_name"),
    supabase
      .from("admin_permissions")
      .select(
        "permission_id,permission_key,permission_name,permission_description,permission_category",
      )
      .order("permission_category")
      .order("permission_name"),
    supabase
      .from("admin_user_roles")
      .select("user_id,role_key,granted_by,granted_at")
      .eq("user_id", userId),
    supabase
      .from("plans")
      .select(
        "academic_year_id,id,name,status,commencement_year,study_load,extension_years,created_at,updated_at",
      )
      .eq("owner_id", userId)
      .eq("is_primary", true)
      .maybeSingle(),
  ]);

  const error =
    userResult.error ??
    rolesResult.error ??
    permissionsResult.error ??
    assignmentsResult.error ??
    planResult.error;
  if (error) throw new Error("Coursemap could not load that user.");

  const user = userResult.data ? mapUser(userResult.data) : null;
  if (!user) return null;

  const assignments = (assignmentsResult.data ?? []).flatMap((assignment) => {
    const mapped = mapAssignment(assignment);
    return mapped ? [mapped] : [];
  });
  const grantorIds = [
    ...new Set(
      assignments.flatMap((assignment) =>
        assignment.grantedBy ? [assignment.grantedBy] : [],
      ),
    ),
  ];
  const grantorsResult = grantorIds.length
    ? await supabase
        .from("admin_users")
        .select("user_id,display_name")
        .in("user_id", grantorIds)
    : { data: [], error: null };
  if (grantorsResult.error) {
    throw new Error("Coursemap could not load that user's role assignment.");
  }
  const grantorsById = new Map(
    (grantorsResult.data ?? []).flatMap((grantor) =>
      grantor.user_id && grantor.display_name
        ? [[grantor.user_id, grantor.display_name] as const]
        : [],
    ),
  );
  const assignmentsWithGrantors = assignments.map((assignment) => ({
    ...assignment,
    grantedByDisplayName: assignment.grantedBy
      ? (grantorsById.get(assignment.grantedBy) ?? null)
      : null,
  }));

  let study: AdminUserStudy = {
    plan: null,
    structures: [],
    courses: [],
  };

  if (planResult.data) {
    const plan = planResult.data;
    const [yearResult, structuresResult, itemsResult, attemptsResult] =
      await Promise.all([
        supabase
          .from("academic_years")
          .select("year")
          .eq("id", plan.academic_year_id)
          .maybeSingle(),
        supabase
          .from("plan_structures")
          .select("role,structure_year_id,position")
          .eq("plan_id", plan.id)
          .order("position"),
        supabase
          .from("plan_items")
          .select(
            "id,course_id,academic_year_id,academic_period_id,planned_calendar_year,planned_period_code,created_at,updated_at,sort_order",
          )
          .eq("plan_id", plan.id)
          .order("sort_order"),
        supabase
          .from("course_attempts")
          .select(
            "id,course_id,course_snapshot_id,academic_period_id,status,mark,units_attempted,units_earned,created_at,updated_at",
          )
          .eq("owner_id", userId)
          .order("created_at"),
      ]);

    const studyError =
      yearResult.error ??
      structuresResult.error ??
      itemsResult.error ??
      attemptsResult.error;
    if (studyError || !yearResult.data) {
      throw new Error("Coursemap could not load that user's study plan.");
    }

    const structureRows = structuresResult.data ?? [];
    const itemRows = (itemsResult.data ?? []) as unknown as AdminPlanItemRow[];
    const attemptRows = (attemptsResult.data ??
      []) as unknown as AdminCourseAttemptRow[];
    const structureYearIds = structureRows.map(
      (structure) => structure.structure_year_id,
    );
    const courseIds = [
      ...new Set([
        ...itemRows.map((item) => item.course_id),
        ...attemptRows.map((attempt) => attempt.course_id),
      ]),
    ];
    const periodIds = [
      ...new Set([
        ...itemRows.flatMap((item) =>
          item.academic_period_id ? [item.academic_period_id] : [],
        ),
        ...attemptRows.map((attempt) => attempt.academic_period_id),
      ]),
    ];

    const [
      structureYearsResult,
      courseIdentitiesResult,
      courseYearsResult,
      periodsResult,
    ] = await Promise.all([
      structureYearIds.length
        ? supabase
            .from("catalogue_item_years")
            .select("id,published_snapshot_id,item_id")
            .in("id", structureYearIds)
        : Promise.resolve({ data: [], error: null }),
      courseIds.length
        ? supabase.from("catalogue_items").select("id,code").in("id", courseIds)
        : Promise.resolve({ data: [], error: null }),
      courseIds.length
        ? supabase
            .from("catalogue_item_years")
            .select("item_id,academic_year_id,published_snapshot_id")
            .is("archived_at", null)
            .in("item_id", courseIds)
        : Promise.resolve({ data: [], error: null }),
      periodIds.length
        ? supabase
            .from("academic_periods")
            .select("id,calendar_year,code,name,short_name")
            .in("id", periodIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const relatedError =
      structureYearsResult.error ??
      courseIdentitiesResult.error ??
      courseYearsResult.error ??
      periodsResult.error;
    if (relatedError) {
      throw new Error("Coursemap could not load that user's study details.");
    }

    const structureYears = structureYearsResult.data ?? [];
    const structureIdentityIds = structureYears.map(
      (structureYear) => structureYear.item_id,
    );
    const structureIdentitiesResult = structureIdentityIds.length
      ? await supabase
          .from("catalogue_items")
          .select("id,code")
          .in("id", structureIdentityIds)
      : { data: [], error: null };
    if (structureIdentitiesResult.error) {
      throw new Error("Coursemap could not load that user's programme.");
    }

    const structureYearById = new Map(
      structureYears.map((structureYear) => [structureYear.id, structureYear]),
    );
    const structureCodeById = new Map(
      (structureIdentitiesResult.data ?? []).map((identity) => [
        identity.id,
        identity.code,
      ]),
    );
    const structureSnapshotIds = structureYears.flatMap((structureYear) =>
      structureYear.published_snapshot_id === null
        ? []
        : [structureYear.published_snapshot_id],
    );
    const structureSnapshotsResult = structureSnapshotIds.length
      ? await supabase
          .from("structure_snapshot_details")
          .select("snapshot_id,name,units")
          .in("snapshot_id", structureSnapshotIds)
      : { data: [], error: null };
    if (structureSnapshotsResult.error) {
      throw new Error("Coursemap could not load that user's programme.");
    }
    const structureSnapshotById = new Map(
      (structureSnapshotsResult.data ?? []).map((snapshot) => [
        snapshot.snapshot_id,
        snapshot,
      ]),
    );
    const courseCodeById = new Map(
      (courseIdentitiesResult.data ?? []).map((course) => [
        course.id,
        course.code,
      ]),
    );
    const publishedSnapshotByCourseYear = new Map(
      (courseYearsResult.data ?? []).flatMap((courseYear) =>
        courseYear.published_snapshot_id
          ? [
              [
                `${courseYear.item_id}:${courseYear.academic_year_id}`,
                courseYear.published_snapshot_id,
              ] as const,
            ]
          : [],
      ),
    );
    const snapshotIds = [
      ...new Set([
        ...publishedSnapshotByCourseYear.values(),
        ...attemptRows.map((attempt) => attempt.course_snapshot_id),
      ]),
    ];
    const snapshotsResult = snapshotIds.length
      ? await supabase
          .from("course_snapshot_details")
          .select("snapshot_id,title,units,minimum_units,maximum_units")
          .in("snapshot_id", snapshotIds)
      : { data: [], error: null };
    if (snapshotsResult.error) {
      throw new Error("Coursemap could not load that user's course details.");
    }
    const snapshotById = new Map(
      (snapshotsResult.data ?? []).map((snapshot) => [
        snapshot.snapshot_id,
        snapshot,
      ]),
    );
    const periodById = new Map(
      (periodsResult.data ?? []).map((period) => [period.id, period]),
    );

    const plannedCourses: AdminUserCourse[] = itemRows.flatMap((item) => {
      const code = courseCodeById.get(item.course_id);
      if (!code) return [];
      const publishedSnapshotId = publishedSnapshotByCourseYear.get(
        `${item.course_id}:${item.academic_year_id}`,
      );
      const snapshot = publishedSnapshotId
        ? snapshotById.get(publishedSnapshotId)
        : null;
      const period = item.academic_period_id
        ? periodById.get(item.academic_period_id)
        : null;
      return [
        {
          id: item.id,
          code,
          title: snapshot?.title ?? "Course details unavailable",
          units: Number(
            snapshot?.units ??
              snapshot?.minimum_units ??
              snapshot?.maximum_units ??
              0,
          ),
          unitsEarned: 0,
          calendarYear:
            period?.calendar_year ?? item.planned_calendar_year ?? null,
          periodCode: period?.code ?? item.planned_period_code ?? null,
          periodName: period?.name ?? null,
          periodShortName: period?.short_name ?? null,
          status: "planned" as const,
          mark: null,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        },
      ];
    });
    const recordedCourses: AdminUserCourse[] = attemptRows.flatMap(
      (attempt) => {
        const code = courseCodeById.get(attempt.course_id);
        const snapshot = snapshotById.get(attempt.course_snapshot_id);
        const period = periodById.get(attempt.academic_period_id);
        const status = courseStatus(attempt.status);
        if (!code || !status) return [];
        return [
          {
            id: attempt.id,
            code,
            title: snapshot?.title ?? "Course details unavailable",
            units: Number(attempt.units_attempted),
            unitsEarned: Number(attempt.units_earned),
            calendarYear: period?.calendar_year ?? null,
            periodCode: period?.code ?? null,
            periodName: period?.name ?? null,
            periodShortName: period?.short_name ?? null,
            status,
            mark: attempt.mark === null ? null : Number(attempt.mark),
            createdAt: attempt.created_at,
            updatedAt: attempt.updated_at,
          },
        ];
      },
    );

    study = {
      plan: {
        id: plan.id,
        name: plan.name,
        status: plan.status,
        catalogueYear: yearResult.data.year,
        commencementYear: plan.commencement_year,
        studyLoad: studyLoad(plan.study_load),
        extensionYears: plan.extension_years,
        createdAt: plan.created_at,
        updatedAt: plan.updated_at,
      },
      structures: structureRows.flatMap((structure) => {
        const structureYear = structureYearById.get(
          structure.structure_year_id,
        );
        const snapshot = structureYear?.published_snapshot_id
          ? structureSnapshotById.get(structureYear.published_snapshot_id)
          : null;
        const code = structureYear
          ? structureCodeById.get(structureYear.item_id)
          : null;
        return snapshot && code
          ? [
              {
                role: structure.role,
                code,
                name: snapshot.name,
                units: snapshot.units === null ? 0 : Number(snapshot.units),
              },
            ]
          : [];
      }),
      courses: [...plannedCourses, ...recordedCourses].toSorted(
        (left, right) =>
          (left.calendarYear ?? 9999) - (right.calendarYear ?? 9999) ||
          (left.periodCode ?? "ZZZ").localeCompare(right.periodCode ?? "ZZZ") ||
          left.code.localeCompare(right.code),
      ),
    };
  }

  return {
    user,
    roles: (rolesResult.data ?? []).flatMap((role) => {
      const mapped = mapRole(role);
      return mapped ? [mapped] : [];
    }),
    permissions: (permissionsResult.data ?? []).flatMap((permission) => {
      const mapped = mapPermission(permission);
      return mapped ? [mapped] : [];
    }),
    assignments: assignmentsWithGrantors,
    study,
  };
}

export async function loadAdminRoleManagement(): Promise<AdminRoleManagementData> {
  const supabase = await createClient();
  const [rolesResult, permissionsResult, grantsResult] = await Promise.all([
    supabase
      .from("admin_roles")
      .select("role_id,role_key,role_name,role_description,permission_keys")
      .order("role_name"),
    supabase
      .from("admin_permissions")
      .select(
        "permission_id,permission_key,permission_name,permission_description,permission_category",
      )
      .order("permission_category")
      .order("permission_name"),
    supabase.from("admin_role_permissions").select("role_id,permission_id"),
  ]);

  const error =
    rolesResult.error ?? permissionsResult.error ?? grantsResult.error;
  if (error) throw new Error("Coursemap could not load application roles.");

  return {
    roles: (rolesResult.data ?? []).flatMap((role) => {
      const mapped = mapRole(role);
      return mapped ? [mapped] : [];
    }),
    permissions: (permissionsResult.data ?? []).flatMap((permission) => {
      const mapped = mapPermission(permission);
      return mapped ? [mapped] : [];
    }),
    grants: (grantsResult.data ?? []).flatMap((grant) => {
      const mapped = mapRolePermission(grant);
      return mapped ? [mapped] : [];
    }),
  };
}
