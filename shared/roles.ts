// Role derivation from the legacy role fields.
//
// `users.roles` (text[]) is the RBAC source of truth — see requireRole() in server/routes.ts.
// It was introduced after `role` / `adminRole` / `hasFullAdminAccess`, which are still written for
// backwards compatibility. Backups exported before `roles` existed (version "1.0") carry only the
// legacy fields, so anything reading such a backup has to derive the array.
//
// This MUST stay semantically identical to the startup backfill SQL in server/routes.ts
// (`UPDATE users SET roles = CASE WHEN admin_role IS NOT NULL ... END WHERE roles = ARRAY['employee']`)
// and to migrations/0005_user_roles.sql. If the three ever disagree, a restored database ends up in
// a different state depending on whether the app happened to restart — which is exactly the class of
// bug this function exists to remove.

export type LegacyRoleFields = {
  roles?: string[] | null;
  role?: string | null;
  adminRole?: string | null;
};

export function deriveRolesFromLegacy(user: LegacyRoleFields): string[] {
  // Already a v2-era record — never clobber an explicit roles array.
  if (Array.isArray(user.roles) && user.roles.length > 0) return user.roles;

  if (user.adminRole != null && user.adminRole !== '') {
    return ['employee', 'manager', 'admin'];
  }
  if (user.role === 'manager') {
    return ['employee', 'manager'];
  }
  return ['employee'];
}
