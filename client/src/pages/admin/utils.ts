import type { LeaveRequest } from '@shared/schema';

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

export const generatePassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};
