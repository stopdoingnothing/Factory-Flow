import type { LeaveRequest } from '@shared/schema';

/** Check if a user object has a specific role in their roles[] array */
export const userHasRole = (user: any, role: string): boolean =>
  Array.isArray(user?.roles) && user.roles.includes(role);

/** Check if a user is a manager (has 'manager', 'admin', or 'hr' role) */
export const isManagerOrAbove = (user: any): boolean =>
  userHasRole(user, 'manager') || userHasRole(user, 'admin') || userHasRole(user, 'hr');

/** Display label for a user's primary role */
export const getRoleLabel = (user: any): string => {
  if (userHasRole(user, 'admin')) return 'Admin';
  if (userHasRole(user, 'hr')) return 'HR';
  if (userHasRole(user, 'manager')) return 'Manager';
  return 'Employee';
};

export const formatDateForDisplay = (isoDate: string | null | undefined): string => {
  if (!isoDate) return '';
  const dateOnly = isoDate.split('T')[0];
  const parts = dateOnly.split('-');
  if (parts.length !== 3) return isoDate;
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
};

export const parseDateFromDisplay = (displayDate: string): string => {
  if (!displayDate) return '';
  const parts = displayDate.split('/');
  if (parts.length !== 3) return displayDate;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
};

export const isValidDateFormat = (date: string): boolean => {
  if (!date) return true;
  const regex = /^\d{2}\/\d{2}\/\d{4}$/;
  return regex.test(date);
};

export const getEmploymentDuration = (startDateStr: string | null | undefined): string => {
  if (!startDateStr) return '-';

  const startDate = new Date(startDateStr);
  const today = new Date();

  let years = today.getFullYear() - startDate.getFullYear();
  let months = today.getMonth() - startDate.getMonth();

  if (months < 0) {
    years--;
    months += 12;
  }

  if (years > 0 && months > 0) {
    return `${years}y ${months}m`;
  } else if (years > 0) {
    return `${years} year${years > 1 ? 's' : ''}`;
  } else if (months > 0) {
    return `${months} month${months > 1 ? 's' : ''}`;
  } else {
    const days = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    return `${days} day${days !== 1 ? 's' : ''}`;
  }
};

export const formatLeaveStatus = (status: string): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; color?: string } => {
  switch (status) {
    case 'pending_manager':
      return { label: 'Awaiting Recommendation', variant: 'secondary' };
    case 'pending_hr':
      return { label: 'Pending HR', variant: 'secondary' };
    case 'pending_md':
      return { label: 'Pending HR', variant: 'secondary' }; // legacy — treat as pending_hr
    case 'approved':
      return { label: 'Approved', variant: 'default' };
    case 'rejected':
      return { label: 'Rejected', variant: 'destructive' };
    case 'cancelled':
      return { label: 'Cancelled', variant: 'outline' };
    case 'pending':
      return { label: 'Pending', variant: 'secondary' };
    default:
      return { label: status, variant: 'secondary' };
  }
};

export const canTakeAction = (request: LeaveRequest): { canAct: boolean; role: 'manager' | 'hr' | null; stage: string } => {
  const status = request.status;
  if (status === 'pending_manager') {
    return { canAct: true, role: 'manager', stage: 'Manager Review' };
  } else if (status === 'pending_hr' || status === 'pending_md') {
    return { canAct: true, role: 'hr', stage: 'HR Approval' };
  }
  return { canAct: false, role: null, stage: '' };
};

/**
 * Format a leave day count: up to 2 decimal places, no trailing zeros.
 * 15     → "15"
 * 15.8   → "15.8"
 * 15.83  → "15.83"
 * 15.836 → "15.84"
 */
export const formatLeaveDays = (days: number | null | undefined): string => {
  if (days == null) return '0';
  return parseFloat(days.toFixed(2)).toString();
};

export const STANDARD_LEAVE_TYPES = ['Annual Leave', 'Sick Leave', 'Family Responsibility'];

export function groupLeaveBalances<T extends { leaveType: string }>(
  balances: T[]
): { standard: T[]; other: T[] } {
  const unique = balances.filter(
    (b, i, arr) => arr.findIndex(x => x.leaveType === b.leaveType) === i
  );
  const standard = STANDARD_LEAVE_TYPES
    .map(t => unique.find(b => b.leaveType === t))
    .filter(Boolean) as T[];
  const other = unique.filter(b => !STANDARD_LEAVE_TYPES.includes(b.leaveType));
  return { standard, other };
}

export const generatePassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};
