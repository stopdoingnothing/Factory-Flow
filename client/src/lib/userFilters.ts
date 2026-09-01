// `exclude` and `excludeFromLeave` are declared as `boolean().default(false)` without `.notNull()`
// in shared/schema.ts, so a User read from the database types them as `boolean | null`. Every check
// below is a falsy test, so null behaves the same as false — the type just has to admit it.
export interface UserForFiltering {
  terminationDate?: string | null;
  excludeFromLeave?: boolean | null;
  exclude?: boolean | null;
  roles?: string[];
}

/**
 * Attendance/clock-in scope. HR and admin users are office staff who don't clock in, so they stay
 * out of attendance reporting and AWOL checks — mirrors the same role filter in
 * server/absentCheck.ts and the kiosk routes.
 *
 * NOT for leave: holding an hr/admin role says nothing about whether someone accrues leave.
 * Use isLeaveEligible() for anything leave-related.
 */
export function isTrackableEmployee(user: UserForFiltering): boolean {
  const adminRoles = ['admin', 'hr'];
  const hasAdminRole = (user.roles ?? []).some(r => adminRoles.includes(r));

  return (
    !user.terminationDate &&
    !user.excludeFromLeave &&
    !user.exclude &&
    !hasAdminRole
  );
}

/**
 * Leave scope. Driven purely by the explicit `excludeFromLeave` flag (external contractors,
 * system accounts) — roles are irrelevant. An HR manager or admin is still an employee who
 * accrues and takes leave.
 */
export function isLeaveEligible(user: UserForFiltering): boolean {
  return (
    !user.terminationDate &&
    !user.excludeFromLeave &&
    !user.exclude
  );
}
