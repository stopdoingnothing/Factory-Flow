import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { settingsApi } from '@/lib/api';

type RolePermissionsMap = Record<string, string[]>;

const DEFAULTS: RolePermissionsMap = {
  employee: ['nav.apply-leave', 'nav.my-attendance', 'nav.profile', 'nav.grievances'],
  manager: [
    'nav.my-team', 'nav.org-chart', 'nav.leave-requests',
    'nav.attendance', 'nav.reports', 'nav.leave-calendar',
  ],
  hr: [
    'nav.admin-insights', 'nav.personnel', 'nav.org-chart', 'nav.leave-requests',
    'nav.attendance', 'nav.reports', 'nav.leave-calendar',
    'personnel.add-person', 'personnel.export-pdf', 'personnel.missing-info',
    'personnel.edit', 'personnel.terminate', 'personnel.delete', 'personnel.assign-roles',
  ],
};

function mergeWithDefaults(saved: RolePermissionsMap | null): RolePermissionsMap {
  if (!saved) return DEFAULTS;
  const merged: RolePermissionsMap = { ...DEFAULTS };
  for (const role of Object.keys(DEFAULTS)) {
    if (saved[role] !== undefined) {
      merged[role] = saved[role];
    }
  }
  return merged;
}

export function useRolePermissions() {
  const { user, hasRole } = useAuth();

  const { data: setting, isLoading } = useQuery({
    queryKey: ['settings', 'role_permissions'],
    queryFn: () => settingsApi.get('role_permissions'),
    staleTime: 5 * 60 * 1000,
  });

  const permissions: RolePermissionsMap = (() => {
    if (!setting?.value) return DEFAULTS;
    try {
      return mergeWithDefaults(JSON.parse(setting.value));
    } catch {
      return DEFAULTS;
    }
  })();

  const userRoles: string[] = (user as any)?.roles ?? [];

  function check(permission: string): boolean {
    if (!user) return false;
    if (userRoles.includes('admin')) return true;
    return userRoles.some(role => permissions[role]?.includes(permission));
  }

  return {
    canSee: check,
    canDo: check,
    permissions,
    isLoading,
  };
}

export { DEFAULTS as ROLE_PERMISSION_DEFAULTS };
export type { RolePermissionsMap };
