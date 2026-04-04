import type { User, LeaveBalance, LeaveRequest, AttendanceRecord, Setting, Department, UserGroup, EmployeeType, LeaveRule, LeaveRulePhase, ContractHistory, Grievance, InsertGrievance, PublicHoliday, InsertPublicHoliday, Notification, InsertNotification, OrgPosition, InsertOrgPosition } from "@shared/schema";

const API_BASE = "/api";

// All API calls include credentials so the session cookie is sent automatically.
const apiFetch: typeof fetch = (input, init) =>
  fetch(input, { credentials: "include", ...init });

// Auth API
export const authApi = {
  async loginWorker(id: string, password: string): Promise<User> {
    const res = await apiFetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as any).error || "Login failed");
    }
    return res.json();
  },

  async loginAdmin(email: string, password: string): Promise<User> {
    const res = await apiFetch(`${API_BASE}/auth/admin-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error("Login failed");
    return res.json();
  },

  async loginByFace(id: string): Promise<User> {
    const res = await apiFetch(`${API_BASE}/auth/login-by-face`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error("Face login failed");
    return res.json();
  },

  async managerApprovedLogin(employeeId: string, managerEmail: string, managerPassword: string): Promise<User> {
    const res = await apiFetch(`${API_BASE}/auth/manager-approved-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, managerEmail, managerPassword }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as any).error || "Authorization failed");
    }
    return res.json();
  },

  async me(): Promise<User | null> {
    const res = await apiFetch(`${API_BASE}/auth/me`);
    if (res.status === 401) return null;
    if (!res.ok) throw new Error("Failed to fetch session");
    return res.json();
  },

  async logout(): Promise<void> {
    await apiFetch(`${API_BASE}/auth/logout`, { method: "POST" });
  },
};

export type FaceDescriptorUser = {
  id: string;
  firstName: string;
  surname: string;
  email: string | null;
  role: string;
  faceDescriptor: string;
};

export type EmployeeSearchResult = {
  id: string;
  firstName: string;
  surname: string;
  department: string | null;
  role: string;
  photoUrl: string | null;
};

// Employee name search — used by manager-approval login flow (no auth required)
export const userSearchApi = {
  async searchByName(q: string): Promise<EmployeeSearchResult[]> {
    const res = await apiFetch(`${API_BASE}/users/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error("Search failed");
    return res.json();
  },
};

// Face Recognition API
export const faceApi = {
  async getAllFaceDescriptors(includeAdmins: boolean = false): Promise<FaceDescriptorUser[]> {
    const url = includeAdmins 
      ? `${API_BASE}/users/face-descriptors?includeAdmins=true`
      : `${API_BASE}/users/face-descriptors`;
    const res = await apiFetch(url);
    if (!res.ok) throw new Error("Failed to fetch face descriptors");
    return res.json();
  },
};

// Helper to get current user ID from localStorage for access control
const getCurrentUserId = (): string | null => {
  try {
    const stored = localStorage.getItem('aece_user');
    if (stored) {
      const user = JSON.parse(stored);
      return user?.id || null;
    }
  } catch {
    // Ignore parsing errors
  }
  return null;
};

// User API
export const userApi = {
  async getAll(): Promise<User[]> {
    const headers: Record<string, string> = {};
    const userId = getCurrentUserId();
    if (userId) {
      headers['X-User-Id'] = userId;
    }
    const res = await apiFetch(`${API_BASE}/users`, { headers });
    if (!res.ok) throw new Error("Failed to fetch users");
    return res.json();
  },

  async getForOrgChart(): Promise<User[]> {
    const res = await apiFetch(`${API_BASE}/users?view=org-chart`);
    if (!res.ok) throw new Error("Failed to fetch users");
    return res.json();
  },

  // Used by tile mode kiosk — public endpoint, no session required
  async getAllForKiosk(): Promise<User[]> {
    const res = await apiFetch(`${API_BASE}/users/kiosk`);
    if (!res.ok) throw new Error("Failed to fetch users");
    return res.json();
  },

  async getById(id: string): Promise<User> {
    const res = await apiFetch(`${API_BASE}/users/${id}`);
    if (!res.ok) throw new Error("Failed to fetch user");
    return res.json();
  },

  async kioskLookup(id: string): Promise<{ id: string; firstName: string; surname: string; department: string | null }> {
    const res = await apiFetch(`${API_BASE}/users/kiosk-lookup/${encodeURIComponent(id)}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as any).error || "Employee not found");
    }
    return res.json();
  },

  async create(user: Partial<User>): Promise<User> {
    const res = await apiFetch(`${API_BASE}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(user),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || "Failed to create user");
    }
    return res.json();
  },

  async update(id: string, user: Partial<User>): Promise<User> {
    const res = await apiFetch(`${API_BASE}/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(user),
    });
    if (!res.ok) throw new Error("Failed to update user");
    return res.json();
  },

  async delete(id: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/users/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete user");
  },

  async changeId(oldId: string, newId: string): Promise<User> {
    const res = await apiFetch(`${API_BASE}/users/${oldId}/change-id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newId }),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to change employee ID");
    }
    return res.json();
  },

  async resendCredentials(id: string): Promise<{ message: string }> {
    const res = await apiFetch(`${API_BASE}/users/${id}/resend-credentials`, {
      method: "POST",
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to send credentials email");
    }
    return res.json();
  },
};

// Leave Balance API
export const leaveBalanceApi = {
  async getByUserId(userId: string): Promise<LeaveBalance[]> {
    const res = await apiFetch(`${API_BASE}/leave-balances/${userId}`);
    if (!res.ok) throw new Error("Failed to fetch leave balances");
    return res.json();
  },

  async getAll(): Promise<LeaveBalance[]> {
    const res = await apiFetch(`${API_BASE}/leave-balances`);
    if (!res.ok) throw new Error("Failed to fetch leave balances");
    return res.json();
  },

  async create(balance: { userId: string; leaveType: string; total: number; taken?: number; pending?: number }): Promise<LeaveBalance> {
    const res = await apiFetch(`${API_BASE}/leave-balances`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(balance),
    });
    if (!res.ok) throw new Error("Failed to create leave balance");
    return res.json();
  },

  async update(id: number, balance: Partial<LeaveBalance>): Promise<LeaveBalance> {
    const res = await apiFetch(`${API_BASE}/leave-balances/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(balance),
    });
    if (!res.ok) throw new Error("Failed to update leave balance");
    return res.json();
  },

  async bulkImport(records: { employeeId: string; leaveType: string; total: number; taken?: number; pending?: number }[]): Promise<{ imported: number; updated: number; errors: string[] }> {
    const res = await apiFetch(`${API_BASE}/leave-balances/bulk-import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records }),
    });
    if (!res.ok) throw new Error("Failed to import leave balances");
    return res.json();
  },

  async recalculateSA(employeeIds?: string[]): Promise<{ message: string; updated: number; skipped: number; errors: string[]; details: { userId: string; name: string; annualLeave: number; sickLeave: number; familyResponsibility: number; monthsWorked: number }[] }> {
    const res = await apiFetch(`${API_BASE}/leave-balances/recalculate-sa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeIds }),
    });
    if (!res.ok) throw new Error("Failed to recalculate SA leave balances");
    return res.json();
  },

  async getSAPreview(userId: string): Promise<{ annualLeave: number; sickLeave: number; familyResponsibility: number; monthsWorked: number; notes: { annualLeave: string; sickLeave: string; familyResponsibility: string } }> {
    const res = await apiFetch(`${API_BASE}/leave-balances/sa-preview/${userId}`);
    if (!res.ok) throw new Error("Failed to fetch SA preview");
    return res.json();
  },
};

// Leave Request API
export const leaveRequestApi = {
  async getAll(userId?: string): Promise<LeaveRequest[]> {
    const url = userId 
      ? `${API_BASE}/leave-requests?userId=${userId}` 
      : `${API_BASE}/leave-requests`;
    const res = await apiFetch(url);
    if (!res.ok) throw new Error("Failed to fetch leave requests");
    return res.json();
  },

  async create(request: Partial<LeaveRequest>): Promise<LeaveRequest> {
    const res = await apiFetch(`${API_BASE}/leave-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || "Failed to create leave request");
    }
    return res.json();
  },

  async updateStatus(id: number, status: string, adminNotes?: string): Promise<LeaveRequest> {
    const res = await apiFetch(`${API_BASE}/leave-requests/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, adminNotes }),
    });
    if (!res.ok) throw new Error("Failed to update leave request");
    return res.json();
  },

  async cancel(id: number): Promise<{ message: string }> {
    const res = await apiFetch(`${API_BASE}/leave-requests/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to cancel leave request");
    }
    return res.json();
  },

  async permanentDelete(id: number): Promise<{ message: string }> {
    const res = await apiFetch(`${API_BASE}/leave-requests/${id}/permanent`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to delete leave request");
    }
    return res.json();
  },

  async getByStatus(status: string | string[]): Promise<LeaveRequest[]> {
    const statusStr = Array.isArray(status) ? status.join(',') : status;
    const res = await apiFetch(`${API_BASE}/leave-requests/by-status/${statusStr}`);
    if (!res.ok) throw new Error("Failed to fetch leave requests by status");
    return res.json();
  },

  async managerDecision(id: number, approverId: string, decision: 'approved' | 'rejected', notes?: string): Promise<LeaveRequest> {
    const res = await apiFetch(`${API_BASE}/leave-requests/${id}/manager-decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approverId, decision, notes }),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to process manager decision");
    }
    return res.json();
  },

  async hrDecision(id: number, approverId: string, decision: 'approved' | 'rejected', notes?: string): Promise<LeaveRequest> {
    const res = await apiFetch(`${API_BASE}/leave-requests/${id}/hr-decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approverId, decision, notes }),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to process HR decision");
    }
    return res.json();
  },

  async mdDecision(id: number, approverId: string, decision: 'approved' | 'rejected', notes?: string, bypassHR?: boolean): Promise<LeaveRequest> {
    const res = await apiFetch(`${API_BASE}/leave-requests/${id}/md-decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approverId, decision, notes, bypassHR }),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to process MD decision");
    }
    return res.json();
  },

  async adminCancel(id: number, adminId: string, reason?: string): Promise<{ message: string; request: LeaveRequest; balanceAdjusted: boolean }> {
    const res = await apiFetch(`${API_BASE}/leave-requests/${id}/admin-cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, reason }),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to cancel leave request");
    }
    return res.json();
  },

  async createHistoric(data: {
    userId: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    reason?: string;
    authorizedBy?: string;
    referenceNumber?: string;
    notes?: string;
  }): Promise<LeaveRequest> {
    const res = await apiFetch(`${API_BASE}/leave-requests/historic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to create historic leave entry");
    }
    return res.json();
  },

  async updateHistoric(id: number, data: {
    userId?: string;
    leaveType?: string;
    startDate?: string;
    endDate?: string;
    reason?: string;
    authorizedBy?: string;
    referenceNumber?: string;
    notes?: string;
  }): Promise<LeaveRequest> {
    const res = await apiFetch(`${API_BASE}/leave-requests/historic/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to update historic leave entry");
    }
    return res.json();
  },
};

// Attendance API
export const attendanceApi = {
  async getByUserId(userId: string, limit = 10, startDate?: string, endDate?: string): Promise<AttendanceRecord[]> {
    let url = `${API_BASE}/attendance/${userId}?limit=${limit}`;
    if (startDate) url += `&startDate=${startDate}`;
    if (endDate) url += `&endDate=${endDate}`;
    const res = await apiFetch(url);
    if (!res.ok) throw new Error("Failed to fetch attendance records");
    return res.json();
  },

  async getAll(startDate?: string, endDate?: string): Promise<AttendanceRecord[]> {
    let url = `${API_BASE}/attendance`;
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (params.toString()) url += `?${params.toString()}`;
    const res = await apiFetch(url);
    if (!res.ok) throw new Error("Failed to fetch attendance records");
    return res.json();
  },

  async create(record: { 
    userId: string; 
    type: string; 
    photoUrl?: string | null;
    method?: string;
    context?: string;
  }): Promise<AttendanceRecord> {
    const res = await apiFetch(`${API_BASE}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const error = new Error(errorData.message || "Failed to create attendance record");
      (error as any).status = res.status;
      (error as any).code = errorData.error;
      throw error;
    }
    return res.json();
  },

  async createBulk(records: { userId: string; type: string; timestamp: string }[]): Promise<AttendanceRecord[]> {
    const res = await apiFetch(`${API_BASE}/attendance/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records }),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to create attendance records");
    }
    return res.json();
  },

  async getStatus(userId: string): Promise<{ isClockedIn: boolean; lastRecord: AttendanceRecord | null }> {
    const res = await apiFetch(`${API_BASE}/attendance/status/${userId}`);
    if (!res.ok) throw new Error("Failed to fetch clock-in status");
    return res.json();
  },

  async triggerAutoReset(): Promise<{ message: string; processed: number; results: any[] }> {
    const res = await apiFetch(`${API_BASE}/attendance/auto-reset`, {
      method: "POST",
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to trigger auto-reset");
    }
    return res.json();
  },

  async updateInfringementReason(id: number, infringementReason: string): Promise<AttendanceRecord> {
    const res = await apiFetch(`${API_BASE}/attendance/${id}/infringement-reason`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ infringementReason }),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to update infringement reason");
    }
    return res.json();
  },

  async update(id: number, data: { timestamp?: string; type?: string; isInfringement?: string | null; infringementReason?: string | null }): Promise<AttendanceRecord> {
    const res = await apiFetch(`${API_BASE}/attendance/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to update attendance record");
    }
    return res.json();
  },

  async delete(id: number): Promise<void> {
    const res = await apiFetch(`${API_BASE}/attendance/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to delete attendance record");
    }
  },
};

// Password Reset API
export const passwordResetApi = {
  async requestReset(email: string): Promise<{ message: string }> {
    const res = await apiFetch(`${API_BASE}/auth/request-reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || "Failed to send reset email");
    }
    return res.json();
  },

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const res = await apiFetch(`${API_BASE}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || "Failed to reset password");
    }
    return res.json();
  },
};

// Settings API
export const settingsApi = {
  async get(key: string): Promise<Setting | null> {
    const res = await apiFetch(`${API_BASE}/settings/${key}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("Failed to fetch setting");
    return res.json();
  },

  async set(key: string, value: string): Promise<Setting> {
    const res = await apiFetch(`${API_BASE}/settings/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    if (!res.ok) throw new Error("Failed to update setting");
    return res.json();
  },
};

// Department API
export const companyApi = {
  async getAll(): Promise<any[]> {
    const res = await apiFetch(`${API_BASE}/companies`);
    if (!res.ok) throw new Error("Failed to fetch companies");
    return res.json();
  },

  async create(company: { name: string; registrationNumber?: string; description?: string }): Promise<any> {
    const res = await apiFetch(`${API_BASE}/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(company),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to create company");
    }
    return res.json();
  },

  async update(id: number, company: { name?: string; registrationNumber?: string; description?: string }): Promise<any> {
    const res = await apiFetch(`${API_BASE}/companies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(company),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to update company");
    }
    return res.json();
  },

  async delete(id: number): Promise<void> {
    const res = await apiFetch(`${API_BASE}/companies/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to delete company");
    }
  },
};

export const departmentApi = {
  async getAll(): Promise<Department[]> {
    const res = await apiFetch(`${API_BASE}/departments`);
    if (!res.ok) throw new Error("Failed to fetch departments");
    return res.json();
  },

  async getById(id: number): Promise<Department> {
    const res = await apiFetch(`${API_BASE}/departments/${id}`);
    if (!res.ok) throw new Error("Failed to fetch department");
    return res.json();
  },

  async create(department: { name: string; description?: string }): Promise<Department> {
    const res = await apiFetch(`${API_BASE}/departments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(department),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to create department");
    }
    return res.json();
  },

  async update(id: number, department: { name?: string; description?: string }): Promise<Department> {
    const res = await apiFetch(`${API_BASE}/departments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(department),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to update department");
    }
    return res.json();
  },

  async delete(id: number): Promise<void> {
    const res = await apiFetch(`${API_BASE}/departments/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to delete department");
    }
  },
};

// User Group API
export const userGroupApi = {
  async getAll(): Promise<UserGroup[]> {
    const res = await apiFetch(`${API_BASE}/user-groups`);
    if (!res.ok) throw new Error("Failed to fetch user groups");
    return res.json();
  },

  async getById(id: number): Promise<UserGroup> {
    const res = await apiFetch(`${API_BASE}/user-groups/${id}`);
    if (!res.ok) throw new Error("Failed to fetch user group");
    return res.json();
  },

  async create(group: { name: string; description?: string }): Promise<UserGroup> {
    const res = await apiFetch(`${API_BASE}/user-groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(group),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to create user group");
    }
    return res.json();
  },

  async update(id: number, group: { name?: string; description?: string }): Promise<UserGroup> {
    const res = await apiFetch(`${API_BASE}/user-groups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(group),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to update user group");
    }
    return res.json();
  },

  async delete(id: number): Promise<void> {
    const res = await apiFetch(`${API_BASE}/user-groups/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to delete user group");
    }
  },
};

// Employee Type API
export const employeeTypeApi = {
  async getAll(): Promise<EmployeeType[]> {
    const res = await apiFetch(`${API_BASE}/employee-types`);
    if (!res.ok) throw new Error("Failed to fetch employee types");
    return res.json();
  },

  async getById(id: number): Promise<EmployeeType> {
    const res = await apiFetch(`${API_BASE}/employee-types/${id}`);
    if (!res.ok) throw new Error("Failed to fetch employee type");
    return res.json();
  },

  async create(type: { name: string; description?: string; leaveLabel?: string; hasLeaveEntitlement?: string; isDefault?: string; isPermanent?: string }): Promise<EmployeeType> {
    const res = await apiFetch(`${API_BASE}/employee-types`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(type),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to create employee type");
    }
    return res.json();
  },

  async update(id: number, type: Partial<EmployeeType>): Promise<EmployeeType> {
    const res = await apiFetch(`${API_BASE}/employee-types/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(type),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to update employee type");
    }
    return res.json();
  },

  async delete(id: number): Promise<void> {
    const res = await apiFetch(`${API_BASE}/employee-types/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to delete employee type");
    }
  },
};

// Leave Rule API
export const leaveRuleApi = {
  async getAll(): Promise<LeaveRule[]> {
    const res = await apiFetch(`${API_BASE}/leave-rules`);
    if (!res.ok) throw new Error("Failed to fetch leave rules");
    return res.json();
  },

  async getById(id: number): Promise<LeaveRule> {
    const res = await apiFetch(`${API_BASE}/leave-rules/${id}`);
    if (!res.ok) throw new Error("Failed to fetch leave rule");
    return res.json();
  },

  async create(rule: { name: string; leaveType: string; description?: string; employeeTypeId?: number; accrualType?: string; accrualRate?: string; daysEarned?: string; periodDaysWorked?: number; maxAccrual?: number; waitingPeriodDays?: number; cycleMonths?: number; notes?: string }): Promise<LeaveRule> {
    const res = await apiFetch(`${API_BASE}/leave-rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rule),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to create leave rule");
    }
    return res.json();
  },

  async update(id: number, rule: Partial<LeaveRule>): Promise<LeaveRule> {
    const res = await apiFetch(`${API_BASE}/leave-rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rule),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to update leave rule");
    }
    return res.json();
  },

  async getActivatableTypes(): Promise<{ leaveType: string; defaultDays: number; source: 'statutory' | 'custom'; description: string }[]> {
    const res = await apiFetch(`${API_BASE}/leave-balances/activatable-types`);
    if (!res.ok) throw new Error("Failed to fetch activatable leave types");
    return res.json();
  },

  async delete(id: number): Promise<void> {
    const res = await apiFetch(`${API_BASE}/leave-rules/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to delete leave rule");
    }
  },
};

// Leave Rule Phase API
export const leaveRulePhaseApi = {
  async getByRuleId(ruleId: number): Promise<LeaveRulePhase[]> {
    const res = await apiFetch(`${API_BASE}/leave-rules/${ruleId}/phases`);
    if (!res.ok) throw new Error("Failed to fetch leave rule phases");
    return res.json();
  },

  async create(ruleId: number, phase: { phaseName: string; sequence: number; accrualType: string; daysEarned: string; periodDaysWorked?: number | null; startsAfterMonths?: number | null; startsAfterDaysWorked?: number | null; cycleMonths?: number | null; maxBalanceDays?: number | null; notes?: string | null }): Promise<LeaveRulePhase> {
    const res = await apiFetch(`${API_BASE}/leave-rules/${ruleId}/phases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(phase),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to create leave rule phase");
    }
    return res.json();
  },

  async update(id: number, phase: Partial<LeaveRulePhase>): Promise<LeaveRulePhase> {
    const res = await apiFetch(`${API_BASE}/leave-rule-phases/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(phase),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to update leave rule phase");
    }
    return res.json();
  },

  async delete(id: number): Promise<void> {
    const res = await apiFetch(`${API_BASE}/leave-rule-phases/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to delete leave rule phase");
    }
  },

  async deleteAll(ruleId: number): Promise<void> {
    const res = await apiFetch(`${API_BASE}/leave-rules/${ruleId}/phases`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to delete leave rule phases");
    }
  },
};

// Contract History API
export const contractHistoryApi = {
  async getByUserId(userId: string): Promise<ContractHistory[]> {
    const res = await apiFetch(`${API_BASE}/users/${userId}/contract-history`);
    if (!res.ok) throw new Error("Failed to fetch contract history");
    return res.json();
  },

  async create(userId: string, history: { action: string; previousEmployeeTypeId?: number | null; newEmployeeTypeId?: number | null; previousEndDate?: string | null; newEndDate?: string | null; reason?: string | null; performedBy?: string | null }): Promise<ContractHistory> {
    const res = await apiFetch(`${API_BASE}/users/${userId}/contract-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(history),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to create contract history");
    }
    return res.json();
  },
};

// Grievance API
export const grievanceApi = {
  async getAll(): Promise<Grievance[]> {
    const res = await apiFetch(`${API_BASE}/grievances`);
    if (!res.ok) throw new Error("Failed to fetch grievances");
    return res.json();
  },

  async getByUserId(userId: string): Promise<Grievance[]> {
    const res = await apiFetch(`${API_BASE}/grievances?userId=${userId}`);
    if (!res.ok) throw new Error("Failed to fetch grievances");
    return res.json();
  },

  async getById(id: number): Promise<Grievance> {
    const res = await apiFetch(`${API_BASE}/grievances/${id}`);
    if (!res.ok) throw new Error("Failed to fetch grievance");
    return res.json();
  },

  async create(grievance: InsertGrievance): Promise<Grievance> {
    const res = await apiFetch(`${API_BASE}/grievances`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(grievance),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to create grievance");
    }
    return res.json();
  },

  async update(id: number, grievance: Partial<InsertGrievance>): Promise<Grievance> {
    const res = await apiFetch(`${API_BASE}/grievances/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(grievance),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to update grievance");
    }
    return res.json();
  },

  async updateStatus(id: number, status: string, adminNotes?: string, resolution?: string): Promise<Grievance> {
    const res = await apiFetch(`${API_BASE}/grievances/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, adminNotes, resolution }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to update grievance status");
    }
    return res.json();
  },
};

// Public Holiday API
export const publicHolidayApi = {
  async getAll(): Promise<PublicHoliday[]> {
    const res = await apiFetch(`${API_BASE}/public-holidays`);
    if (!res.ok) throw new Error("Failed to fetch public holidays");
    return res.json();
  },

  async create(holiday: Partial<InsertPublicHoliday>): Promise<PublicHoliday> {
    const res = await apiFetch(`${API_BASE}/public-holidays`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(holiday),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to create public holiday");
    }
    return res.json();
  },

  async update(id: number, holiday: Partial<InsertPublicHoliday>): Promise<PublicHoliday> {
    const res = await apiFetch(`${API_BASE}/public-holidays/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(holiday),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to update public holiday");
    }
    return res.json();
  },

  async delete(id: number): Promise<void> {
    const res = await apiFetch(`${API_BASE}/public-holidays/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete public holiday");
  },
};

// Notification API
export const notificationApi = {
  async getAll(userId: string): Promise<Notification[]> {
    const res = await apiFetch(`${API_BASE}/notifications?userId=${userId}`);
    if (!res.ok) throw new Error("Failed to fetch notifications");
    return res.json();
  },

  async getUnreadCount(userId: string): Promise<number> {
    const res = await apiFetch(`${API_BASE}/notifications/unread-count?userId=${userId}`);
    if (!res.ok) throw new Error("Failed to fetch unread count");
    const data = await res.json();
    return data.count;
  },

  async create(notification: Partial<InsertNotification>): Promise<Notification> {
    const res = await apiFetch(`${API_BASE}/notifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(notification),
    });
    if (!res.ok) throw new Error("Failed to create notification");
    return res.json();
  },

  async markAsRead(id: number): Promise<Notification> {
    const res = await apiFetch(`${API_BASE}/notifications/${id}/read`, {
      method: "PATCH",
    });
    if (!res.ok) throw new Error("Failed to mark notification as read");
    return res.json();
  },

  async markAllAsRead(userId: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/notifications/mark-all-read`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) throw new Error("Failed to mark all notifications as read");
  },

  async delete(id: number): Promise<void> {
    const res = await apiFetch(`${API_BASE}/notifications/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete notification");
  },
};

// Dashboard Stats API
export type DashboardStats = {
  totalEmployees: number;
  eligibleForAttendance: number;
  currentlyClockedIn: number;
  pendingLeaveRequests: number;
  onLeaveToday: number;
  upcomingBirthdays: { user: User; date: string }[];
  upcomingHolidays: PublicHoliday[];
};

export const dashboardApi = {
  async getStats(): Promise<DashboardStats> {
    const res = await apiFetch(`${API_BASE}/dashboard/stats`);
    if (!res.ok) throw new Error("Failed to fetch dashboard stats");
    return res.json();
  },
};

// Backup API
export type BackupData = {
  version: string;
  exportedAt: string;
  data: {
    departments: any[];
    userGroups: any[];
    employeeTypes: any[];
    users: any[];
    leaveBalances: any[];
    leaveRequests: any[];
    attendanceRecords: any[];
    leaveRules: any[];
    leaveRulePhases: any[];
    settings: any[];
    grievances: any[];
    publicHolidays: any[];
    notifications: any[];
  };
};

export type BackupValidation = {
  valid: boolean;
  version: string;
  exportedAt: string;
  counts: Record<string, number>;
};

export type FaceDescriptorRecord = {
  id: number;
  userId: string;
  descriptor: string;
  photoData: string | null;
  label: string | null;
  createdAt: string;
};

export const faceDescriptorApi = {
  async getForUser(userId: string): Promise<FaceDescriptorRecord[]> {
    const res = await apiFetch(`${API_BASE}/face-descriptors/${userId}`);
    if (!res.ok) throw new Error("Failed to fetch face descriptors");
    return res.json();
  },

  async getAll(): Promise<{ userId: string; descriptor: string }[]> {
    const res = await apiFetch(`${API_BASE}/face-descriptors`);
    if (!res.ok) throw new Error("Failed to fetch face descriptors");
    return res.json();
  },

  async create(data: { userId: string; descriptor: string; photoData?: string; label?: string }): Promise<FaceDescriptorRecord> {
    const res = await apiFetch(`${API_BASE}/face-descriptors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to create face descriptor");
    return res.json();
  },

  async delete(id: number): Promise<void> {
    const res = await apiFetch(`${API_BASE}/face-descriptors/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete face descriptor");
  },
};

export const orgPositionApi = {
  async getAll(): Promise<OrgPosition[]> {
    const res = await apiFetch(`${API_BASE}/org-positions`);
    if (!res.ok) throw new Error("Failed to fetch org positions");
    return res.json();
  },

  async create(position: Partial<InsertOrgPosition>): Promise<OrgPosition> {
    const res = await apiFetch(`${API_BASE}/org-positions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(position),
    });
    if (!res.ok) throw new Error("Failed to create org position");
    return res.json();
  },

  async update(id: number, position: Partial<InsertOrgPosition>): Promise<OrgPosition> {
    const res = await apiFetch(`${API_BASE}/org-positions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(position),
    });
    if (!res.ok) throw new Error("Failed to update org position");
    return res.json();
  },

  async delete(id: number): Promise<void> {
    const res = await apiFetch(`${API_BASE}/org-positions/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete org position");
  },
};

export const backupApi = {
  async export(): Promise<Blob> {
    const res = await apiFetch(`${API_BASE}/backup/export`);
    if (!res.ok) throw new Error("Failed to export backup");
    return res.blob();
  },

  async validate(backup: BackupData): Promise<BackupValidation> {
    const res = await apiFetch(`${API_BASE}/backup/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backup }),
    });
    if (!res.ok) throw new Error("Failed to validate backup");
    return res.json();
  },

  async import(backup: BackupData, options?: { clearExisting?: boolean }): Promise<{ success: boolean; message: string; importedCounts: Record<string, number> }> {
    const res = await apiFetch(`${API_BASE}/backup/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backup, options }),
    });
    if (!res.ok) throw new Error("Failed to import backup");
    return res.json();
  },
};
