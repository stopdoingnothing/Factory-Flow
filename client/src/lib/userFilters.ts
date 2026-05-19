export interface UserForFiltering {
  terminationDate?: string | null;
  excludeFromLeave?: boolean;
  exclude?: boolean;
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
