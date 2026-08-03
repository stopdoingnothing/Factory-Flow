// `exclude` and `excludeFromLeave` are declared as `boolean().default(false)` without `.notNull()`
// in shared/schema.ts, so a User read from the database types them as `boolean | null`. Every check
// below is a falsy test, so null behaves the same as false — the type just has to admit it.
export interface UserForFiltering {
  terminationDate?: string | null;
  excludeFromLeave?: boolean | null;
  exclude?: boolean | null;
  roles?: string[];
}

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
