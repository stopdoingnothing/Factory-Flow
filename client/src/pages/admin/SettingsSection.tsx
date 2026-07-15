import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/lib/auth-context';
import {
  Settings, Shield, Palette, Mail, Download, Upload, Save,
  UserCog, Plus, Pencil, Trash2, Key, Copy, RefreshCw, Eye, EyeOff, Lock, AlertTriangle
} from 'lucide-react';
import { useRolePermissions, ROLE_PERMISSION_DEFAULTS, type RolePermissionsMap } from '@/hooks/use-role-permissions';
import {
  settingsApi, userApi, userGroupApi, backupApi, leaveBalanceApi, adminApi
} from '@/lib/api';
import type { User, UserGroup } from '@shared/schema';
import { generatePassword, isManagerOrAbove } from './utils';

export default function SettingsSection() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [settingsTab, setSettingsTab] = useState<'general' | 'user-groups' | 'branding' | 'api' | 'role-permissions'>('general');

  // Role Permissions state
  const { permissions: currentPermissions } = useRolePermissions();
  const [rolePerms, setRolePerms] = useState<RolePermissionsMap>(ROLE_PERMISSION_DEFAULTS);

  const { data: rolePermsSetting } = useQuery({
    queryKey: ['settings', 'role_permissions'],
    queryFn: () => settingsApi.get('role_permissions'),
  });

  useEffect(() => {
    if (rolePermsSetting?.value) {
      try {
        const saved = JSON.parse(rolePermsSetting.value);
        setRolePerms({ ...ROLE_PERMISSION_DEFAULTS, ...saved });
      } catch {
        setRolePerms(currentPermissions);
      }
    } else {
      setRolePerms(ROLE_PERMISSION_DEFAULTS);
    }
  }, [rolePermsSetting]);

  // External API Key state
  const [apiKey, setApiKey] = useState<string>('');
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [apiKeyRegenerating, setApiKeyRegenerating] = useState(false);

  // General Settings State
  const [emailSettings, setEmailSettings] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [clockInCutoff, setClockInCutoff] = useState('08:00');
  const [clockOutCutoff, setClockOutCutoff] = useState('17:00');
  const [absentCheckTime, setAbsentCheckTime] = useState('09:00');
  const [absentCheckRunning, setAbsentCheckRunning] = useState(false);
  const [absentCheckResult, setAbsentCheckResult] = useState<{
    date: string; checked: number; absent: number; emailsSent: number;
    absentEmployees: { id: string; name: string; department?: string }[];
    note?: string;
  } | null>(null);
  const [lateArrivalMessage, setLateArrivalMessage] = useState('{name} (ID: {id}) clocked in late at {time}.');
  const [earlyDepartureMessage, setEarlyDepartureMessage] = useState('{name} (ID: {id}) left early at {time}.');
  const [timezone, setTimezone] = useState('Africa/Johannesburg');

  // Branding Settings State
  const [companyName, setCompanyName] = useState('AECE Checkpoint');
  const [companyLogo, setCompanyLogo] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#1e40af');
  const [accentColor, setAccentColor] = useState('#3b82f6');
  const [termEmployee, setTermEmployee] = useState('Employee');
  const [termDepartment, setTermDepartment] = useState('Department');
  const [termClockIn, setTermClockIn] = useState('Clock In');
  const [termClockOut, setTermClockOut] = useState('Clock Out');

  // User Group Management State
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [currentGroup, setCurrentGroup] = useState<Partial<UserGroup>>({});
  const [isEditingGroup, setIsEditingGroup] = useState(false);

  // Admin User Creation State
  const [isAdminDialogOpen, setIsAdminDialogOpen] = useState(false);
  const [adminData, setAdminData] = useState<{
    firstName: string;
    surname: string;
    email: string;
    password: string;
    userGroupId?: number;
  }>({ firstName: '', surname: '', email: '', password: '' });

  // Queries
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: userApi.getAll,
  });

  const { data: userGroups = [] } = useQuery({
    queryKey: ['userGroups'],
    queryFn: userGroupApi.getAll,
  });

  const { data: emailSetting } = useQuery({
    queryKey: ['settings', 'admin_email'],
    queryFn: () => settingsApi.get('admin_email'),
  });

  const { data: senderEmailSetting } = useQuery({
    queryKey: ['settings', 'sender_email'],
    queryFn: () => settingsApi.get('sender_email'),
  });

  const { data: clockInCutoffSetting } = useQuery({
    queryKey: ['settings', 'clock_in_cutoff'],
    queryFn: () => settingsApi.get('clock_in_cutoff'),
  });

  const { data: clockOutCutoffSetting } = useQuery({
    queryKey: ['settings', 'clock_out_cutoff'],
    queryFn: () => settingsApi.get('clock_out_cutoff'),
  });

  const { data: absentCheckTimeSetting, isFetched: absentCheckTimeFetched } = useQuery({
    queryKey: ['settings', 'absent_check_time'],
    queryFn: () => settingsApi.get('absent_check_time'),
  });

  const { data: lateArrivalMessageSetting } = useQuery({
    queryKey: ['settings', 'late_arrival_message'],
    queryFn: () => settingsApi.get('late_arrival_message'),
  });

  const { data: earlyDepartureMessageSetting } = useQuery({
    queryKey: ['settings', 'early_departure_message'],
    queryFn: () => settingsApi.get('early_departure_message'),
  });

  const { data: timezoneSetting } = useQuery({
    queryKey: ['settings', 'timezone'],
    queryFn: () => settingsApi.get('timezone'),
  });

  const { data: companyNameSetting } = useQuery({
    queryKey: ['settings', 'company_name'],
    queryFn: () => settingsApi.get('company_name'),
  });

  const { data: companyLogoSetting } = useQuery({
    queryKey: ['settings', 'company_logo'],
    queryFn: () => settingsApi.get('company_logo'),
  });

  const { data: primaryColorSetting } = useQuery({
    queryKey: ['settings', 'primary_color'],
    queryFn: () => settingsApi.get('primary_color'),
  });

  const { data: accentColorSetting } = useQuery({
    queryKey: ['settings', 'accent_color'],
    queryFn: () => settingsApi.get('accent_color'),
  });

  const { data: termEmployeeSetting } = useQuery({
    queryKey: ['settings', 'term_employee'],
    queryFn: () => settingsApi.get('term_employee'),
  });

  const { data: termDepartmentSetting } = useQuery({
    queryKey: ['settings', 'term_department'],
    queryFn: () => settingsApi.get('term_department'),
  });

  const { data: termClockInSetting } = useQuery({
    queryKey: ['settings', 'term_clock_in'],
    queryFn: () => settingsApi.get('term_clock_in'),
  });

  const { data: termClockOutSetting } = useQuery({
    queryKey: ['settings', 'term_clock_out'],
    queryFn: () => settingsApi.get('term_clock_out'),
  });

  // Effects to load settings
  useEffect(() => { if (emailSetting) setEmailSettings(emailSetting.value); }, [emailSetting]);
  useEffect(() => { if (senderEmailSetting) setSenderEmail(senderEmailSetting.value); }, [senderEmailSetting]);
  useEffect(() => { if (clockInCutoffSetting) setClockInCutoff(clockInCutoffSetting.value); }, [clockInCutoffSetting]);
  useEffect(() => { if (clockOutCutoffSetting) setClockOutCutoff(clockOutCutoffSetting.value); }, [clockOutCutoffSetting]);
  useEffect(() => {
    if (absentCheckTimeSetting) {
      setAbsentCheckTime(absentCheckTimeSetting.value);
    } else if (absentCheckTimeFetched && clockInCutoffSetting) {
      // No saved value yet — default to one hour after the clock-in cut-off
      const [h, m] = clockInCutoffSetting.value.split(':').map(Number);
      setAbsentCheckTime(`${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }, [absentCheckTimeSetting, absentCheckTimeFetched, clockInCutoffSetting]);
  useEffect(() => { if (lateArrivalMessageSetting) setLateArrivalMessage(lateArrivalMessageSetting.value); }, [lateArrivalMessageSetting]);
  useEffect(() => { if (earlyDepartureMessageSetting) setEarlyDepartureMessage(earlyDepartureMessageSetting.value); }, [earlyDepartureMessageSetting]);
  useEffect(() => { if (timezoneSetting) setTimezone(timezoneSetting.value); }, [timezoneSetting]);
  useEffect(() => { if (companyNameSetting) setCompanyName(companyNameSetting.value); }, [companyNameSetting]);
  useEffect(() => { if (companyLogoSetting) setCompanyLogo(companyLogoSetting.value); }, [companyLogoSetting]);

  useEffect(() => {
    if (settingsTab === 'api' && !apiKey) {
      setApiKeyLoading(true);
      fetch('/api/admin/external-api-key')
        .then(r => r.json())
        .then(data => setApiKey(data.key || ''))
        .catch(() => {})
        .finally(() => setApiKeyLoading(false));
    }
  }, [settingsTab]);
  useEffect(() => { if (primaryColorSetting) setPrimaryColor(primaryColorSetting.value); }, [primaryColorSetting]);
  useEffect(() => { if (accentColorSetting) setAccentColor(accentColorSetting.value); }, [accentColorSetting]);
  useEffect(() => { if (termEmployeeSetting) setTermEmployee(termEmployeeSetting.value); }, [termEmployeeSetting]);
  useEffect(() => { if (termDepartmentSetting) setTermDepartment(termDepartmentSetting.value); }, [termDepartmentSetting]);
  useEffect(() => { if (termClockInSetting) setTermClockIn(termClockInSetting.value); }, [termClockInSetting]);
  useEffect(() => { if (termClockOutSetting) setTermClockOut(termClockOutSetting.value); }, [termClockOutSetting]);

  // Mutations
  const updateSettingMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => settingsApi.set(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: (group: any) => userGroupApi.create(group),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userGroups'] });
      setIsGroupDialogOpen(false);
      toast({ title: "Group Created", description: "User group has been created." });
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: ({ id, ...group }: any) => userGroupApi.update(id, group),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userGroups'] });
      setIsGroupDialogOpen(false);
      toast({ title: "Group Updated", description: "User group has been updated." });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: userGroupApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userGroups'] });
      toast({ title: "Group Deleted", description: "User group has been removed." });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: userApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsAdminDialogOpen(false);
      toast({ title: "Admin Created", description: "Admin user has been added successfully." });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to create admin" });
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: userApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: "User Deleted", description: "User has been removed." });
    },
  });

  // Role Permissions helpers
  const togglePerm = (role: string, permission: string) => {
    setRolePerms(prev => {
      const current = prev[role] ?? [];
      const next = current.includes(permission)
        ? current.filter(p => p !== permission)
        : [...current, permission];
      return { ...prev, [role]: next };
    });
  };

  const hasZeroPermsRole = Object.entries(rolePerms).some(([, perms]) => perms.length === 0);

  const handleSaveRolePermissions = async () => {
    try {
      await updateSettingMutation.mutateAsync({ key: 'role_permissions', value: JSON.stringify(rolePerms) });
      queryClient.invalidateQueries({ queryKey: ['settings', 'role_permissions'] });
      toast({ title: "Permissions Saved", description: "Role permissions have been updated." });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to save role permissions." });
    }
  };

  // Handlers
  const handleSaveSettings = async () => {
    try {
      await Promise.all([
        updateSettingMutation.mutateAsync({ key: 'admin_email', value: emailSettings }),
        updateSettingMutation.mutateAsync({ key: 'sender_email', value: senderEmail }),
        updateSettingMutation.mutateAsync({ key: 'clock_in_cutoff', value: clockInCutoff }),
        updateSettingMutation.mutateAsync({ key: 'clock_out_cutoff', value: clockOutCutoff }),
        updateSettingMutation.mutateAsync({ key: 'absent_check_time', value: absentCheckTime }),
        updateSettingMutation.mutateAsync({ key: 'late_arrival_message', value: lateArrivalMessage }),
        updateSettingMutation.mutateAsync({ key: 'early_departure_message', value: earlyDepartureMessage }),
        updateSettingMutation.mutateAsync({ key: 'timezone', value: timezone }),
      ]);
      toast({ title: "Settings Saved", description: "General system configuration has been updated." });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to save settings." });
    }
  };

  const handleOpenCreateGroup = () => {
    setCurrentGroup({});
    setIsEditingGroup(false);
    setIsGroupDialogOpen(true);
  };

  const handleOpenEditGroup = (group: UserGroup) => {
    setCurrentGroup(group);
    setIsEditingGroup(true);
    setIsGroupDialogOpen(true);
  };

  const handleSaveGroup = () => {
    if (isEditingGroup && currentGroup.id) {
      updateGroupMutation.mutate(currentGroup);
    } else {
      createGroupMutation.mutate(currentGroup);
    }
  };

  const handleDeleteGroup = (id: number) => {
    if (window.confirm('Are you sure you want to delete this group?')) {
      deleteGroupMutation.mutate(id);
    }
  };

  const handleOpenCreateAdmin = () => {
    setAdminData({ firstName: '', surname: '', email: '', password: generatePassword() });
    setIsAdminDialogOpen(true);
  };

  const handleSaveAdmin = () => {
    createUserMutation.mutate({
      ...adminData,
      role: 'manager',
      id: adminData.email.split('@')[0].toUpperCase(), // Simple ID generation
    });
  };

  const handleResendCredentials = async (id: string) => {
    try {
      await userApi.resendCredentials(id);
      toast({ title: "Credentials Sent", description: "Email has been sent to the user." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleDeleteUser = (id: string) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      deleteUserMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-heading font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground">Configure system settings and manage user groups</p>
      </div>
      
      {/* Settings Sub-tabs */}
      <div className="flex gap-2 border-b pb-2">
        <button
          onClick={() => setSettingsTab('general')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            settingsTab === 'general' 
              ? 'bg-primary text-white' 
              : 'bg-muted text-muted-foreground hover:bg-muted/70'
          }`}
          data-testid="settings-tab-general"
        >
          <Settings className="inline h-4 w-4 mr-2" />
          General
        </button>
        <button
          onClick={() => setSettingsTab('user-groups')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            settingsTab === 'user-groups' 
              ? 'bg-primary text-white' 
              : 'bg-muted text-muted-foreground hover:bg-muted/70'
          }`}
          data-testid="settings-tab-user-groups"
        >
          <Shield className="inline h-4 w-4 mr-2" />
          User Groups
        </button>
        <button
          onClick={() => setSettingsTab('branding')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            settingsTab === 'branding' 
              ? 'bg-primary text-white' 
              : 'bg-muted text-muted-foreground hover:bg-muted/70'
          }`}
          data-testid="settings-tab-branding"
        >
          <Palette className="inline h-4 w-4 mr-2" />
          Branding
        </button>
        <button
          onClick={() => setSettingsTab('api')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            settingsTab === 'api'
              ? 'bg-primary text-white'
              : 'bg-muted text-muted-foreground hover:bg-muted/70'
          }`}
          data-testid="settings-tab-api"
        >
          <Key className="inline h-4 w-4 mr-2" />
          API Access
        </button>
        <button
          onClick={() => setSettingsTab('role-permissions')}
          className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            settingsTab === 'role-permissions'
              ? 'bg-primary text-white'
              : 'bg-muted text-muted-foreground hover:bg-muted/70'
          }`}
          data-testid="settings-tab-role-permissions"
        >
          <Lock className="inline h-4 w-4 mr-2" />
          Role Permissions
        </button>
      </div>
      
      {/* General Settings Tab */}
      {settingsTab === 'general' && (
      <>
        <Card>
          <CardHeader>
            <CardTitle>Regional Settings</CardTitle>
            <CardDescription>Configure timezone and regional preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 max-w-xl">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Time Zone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger className="w-full" data-testid="select-timezone">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Africa/Johannesburg">Africa/Johannesburg (SAST, UTC+2)</SelectItem>
                    <SelectItem value="Africa/Cairo">Africa/Cairo (EET, UTC+2)</SelectItem>
                    <SelectItem value="Africa/Lagos">Africa/Lagos (WAT, UTC+1)</SelectItem>
                    <SelectItem value="Africa/Nairobi">Africa/Nairobi (EAT, UTC+3)</SelectItem>
                    <SelectItem value="Africa/Casablanca">Africa/Casablanca (WET, UTC+0/+1)</SelectItem>
                    <SelectItem value="Europe/London">Europe/London (GMT/BST, UTC+0/+1)</SelectItem>
                    <SelectItem value="Europe/Paris">Europe/Paris (CET/CEST, UTC+1/+2)</SelectItem>
                    <SelectItem value="Europe/Berlin">Europe/Berlin (CET/CEST, UTC+1/+2)</SelectItem>
                    <SelectItem value="Asia/Dubai">Asia/Dubai (GST, UTC+4)</SelectItem>
                    <SelectItem value="Asia/Singapore">Asia/Singapore (SGT, UTC+8)</SelectItem>
                    <SelectItem value="Asia/Tokyo">Asia/Tokyo (JST, UTC+9)</SelectItem>
                    <SelectItem value="Australia/Sydney">Australia/Sydney (AEST/AEDT, UTC+10/+11)</SelectItem>
                    <SelectItem value="America/New_York">America/New York (EST/EDT, UTC-5/-4)</SelectItem>
                    <SelectItem value="America/Chicago">America/Chicago (CST/CDT, UTC-6/-5)</SelectItem>
                    <SelectItem value="America/Denver">America/Denver (MST/MDT, UTC-7/-6)</SelectItem>
                    <SelectItem value="America/Los_Angeles">America/Los Angeles (PST/PDT, UTC-8/-7)</SelectItem>
                    <SelectItem value="Pacific/Auckland">Pacific/Auckland (NZST/NZDT, UTC+12/+13)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  All times in the application will be displayed in this timezone.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notification Settings</CardTitle>
            <CardDescription>Configure email notifications for HR and Management</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 max-w-xl">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Sender Email Address (FROM)</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    type="email"
                    value={senderEmail} 
                    onChange={(e) => setSenderEmail(e.target.value)}
                    className="pl-9"
                    placeholder="noreply@yourcompany.com"
                    data-testid="input-sender-email"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  This email address will appear as the sender for all system notifications.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Notification Recipients (TO)</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Textarea 
                    value={emailSettings} 
                    onChange={(e) => setEmailSettings(e.target.value)}
                    className="pl-9 min-h-[80px]"
                    placeholder="hr@company.com&#10;management@company.com&#10;supervisor@company.com"
                    data-testid="input-admin-email"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter one email address per line. All listed emails will receive leave requests and attendance notifications.
                </p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {emailSettings.split('\n').filter(e => e.trim()).map((email, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {email.trim()}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg bg-slate-50 dark:bg-slate-800">
                <div className="space-y-0.5">
                  <Label className="text-base">Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">Receive an email when a new request is submitted</p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Attendance Cut-off Times</CardTitle>
            <CardDescription>Set the times for late arrivals and early departures</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 max-w-xl">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Clock-In Cut-off Time</Label>
                <Input 
                  type="time"
                  value={clockInCutoff} 
                  onChange={(e) => setClockInCutoff(e.target.value)}
                  className="w-40"
                  data-testid="input-clock-in-cutoff"
                />
                <p className="text-xs text-muted-foreground">Employees clocking in after this time will be marked as late, and HR will be notified.</p>
              </div>

              <div className="space-y-2">
                <Label>Clock-Out Cut-off Time</Label>
                <Input
                  type="time"
                  value={clockOutCutoff}
                  onChange={(e) => setClockOutCutoff(e.target.value)}
                  className="w-40"
                  data-testid="input-clock-out-cutoff"
                />
                <p className="text-xs text-muted-foreground">Employees clocking out before this time will be flagged for early departure.</p>
              </div>

              <div className="space-y-2">
                <Label>Daily Absent Check Time</Label>
                <Input
                  type="time"
                  value={absentCheckTime}
                  onChange={(e) => setAbsentCheckTime(e.target.value)}
                  className="w-40"
                  data-testid="input-absent-check-time"
                />
                <p className="text-xs text-muted-foreground">
                  Each day at this time the system emails managers a list of employees who have not clocked in and have no approved leave. Defaults to one hour after the clock-in cut-off.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Absent / No-Show Check</CardTitle>
            <CardDescription>Manually run today's absent check or review the last result</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-w-xl">
            <p className="text-sm text-muted-foreground">
              Checks all active employees who haven't clocked in today and have no approved leave, then emails their manager
              (or the admin email for unmanaged employees). The check also runs automatically each day at the time configured above.
            </p>
            <Button
              data-testid="button-run-absent-check"
              onClick={async () => {
                setAbsentCheckRunning(true);
                setAbsentCheckResult(null);
                try {
                  const result = await adminApi.runAbsentCheck();
                  setAbsentCheckResult(result);
                  toast({ title: "Check Complete", description: result.note || `${result.absent} absent of ${result.checked} employees checked. ${result.emailsSent} email(s) sent.` });
                } catch {
                  toast({ variant: "destructive", title: "Error", description: "Failed to run absent check." });
                } finally {
                  setAbsentCheckRunning(false);
                }
              }}
              disabled={absentCheckRunning}
              variant="outline"
            >
              {absentCheckRunning ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Running...</> : <><RefreshCw className="h-4 w-4 mr-2" />Run Check Now</>}
            </Button>

            {absentCheckResult && (
              <div className="rounded-lg border p-4 space-y-3 bg-slate-50 dark:bg-slate-800">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <span><span className="font-medium">Date:</span> {absentCheckResult.date}</span>
                  <span><span className="font-medium">Checked:</span> {absentCheckResult.checked}</span>
                  <span className={absentCheckResult.absent > 0 ? 'text-status-error font-medium' : 'text-status-success font-medium'}>
                    Absent: {absentCheckResult.absent}
                  </span>
                  <span><span className="font-medium">Emails sent:</span> {absentCheckResult.emailsSent}</span>
                </div>
                {absentCheckResult.note && (
                  <p className="text-sm text-muted-foreground">{absentCheckResult.note}</p>
                )}
                {absentCheckResult.absentEmployees.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Absent employees</p>
                    <div className="divide-y rounded border bg-card">
                      {absentCheckResult.absentEmployees.map(e => (
                        <div key={e.id} className="flex justify-between px-3 py-2 text-sm">
                          <span>{e.name} <span className="text-muted-foreground text-xs">({e.id})</span></span>
                          {e.department && <span className="text-muted-foreground text-xs">{e.department}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notification Message Templates</CardTitle>
            <CardDescription>Customize the messages sent to HR for attendance infringements</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 max-w-2xl">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Late Arrival Message</Label>
                <Textarea 
                  value={lateArrivalMessage} 
                  onChange={(e) => setLateArrivalMessage(e.target.value)}
                  rows={3}
                  placeholder="{firstName} {surname} (ID: {id}) clocked in late at {time}."
                  data-testid="input-late-arrival-message"
                />
              </div>

              <div className="space-y-2">
                <Label>Early Departure Message</Label>
                <Textarea 
                  value={earlyDepartureMessage} 
                  onChange={(e) => setEarlyDepartureMessage(e.target.value)}
                  rows={3}
                  placeholder="{firstName} {surname} (ID: {id}) left early at {time}."
                  data-testid="input-early-departure-message"
                />
              </div>

              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-2">Available placeholders:</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span><code className="bg-card px-1 rounded">{'{firstName}'}</code> - First name</span>
                  <span><code className="bg-card px-1 rounded">{'{surname}'}</code> - Surname</span>
                  <span><code className="bg-card px-1 rounded">{'{id}'}</code> - Employee ID</span>
                  <span><code className="bg-card px-1 rounded">{'{department}'}</code> - Department</span>
                  <span><code className="bg-card px-1 rounded">{'{time}'}</code> - Actual clock time</span>
                  <span><code className="bg-card px-1 rounded">{'{cutoff}'}</code> - Cut-off time</span>
                  <span><code className="bg-card px-1 rounded">{'{date}'}</code> - Date</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Backup & Restore</CardTitle>
            <CardDescription>Export or import your database including all records and images</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4 p-4 border rounded-lg">
                <div className="flex items-center gap-2">
                  <Download className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Export Backup</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Download a complete backup of all data including employees, departments, leave requests, attendance records, and photos.
                </p>
                <Button 
                  onClick={async () => {
                    try {
                      toast({ title: "Exporting...", description: "Preparing your backup file" });
                      const blob = await backupApi.export();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `aece-backup-${new Date().toISOString().split('T')[0]}.json`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                      toast({ title: "Backup Exported", description: "Your backup file has been downloaded" });
                    } catch (error) {
                      toast({ variant: "destructive", title: "Export Failed", description: "Could not export backup" });
                    }
                  }}
                  className="w-full"
                  data-testid="backup-export"
                >
                  <Download className="mr-2 h-4 w-4" /> Download Backup
                </Button>
              </div>
              
              <div className="space-y-4 p-4 border rounded-lg">
                <div className="flex items-center gap-2">
                  <Upload className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Import Backup</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Restore data from a previously exported backup file. Existing records will be preserved.
                </p>
                <div className="space-y-2">
                  <Input
                    type="file"
                    accept=".json"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      try {
                        const text = await file.text();
                        const backup = JSON.parse(text);
                        
                        const validation = await backupApi.validate(backup);
                        if (!validation.valid) {
                          toast({ variant: "destructive", title: "Invalid Backup", description: "The selected file is not a valid backup" });
                          return;
                        }
                        
                        const totalRecords = Object.values(validation.counts).reduce((a: number, b: number) => a + b, 0);
                        if (window.confirm(`Import backup from ${validation.exportedAt}?\n\nThis backup contains:\n- ${validation.counts.users || 0} users\n- ${validation.counts.departments || 0} departments\n- ${validation.counts.leaveRequests || 0} leave requests\n- ${validation.counts.attendanceRecords || 0} attendance records\n- ${totalRecords} total records\n\nExisting records will be preserved.`)) {
                          toast({ title: "Importing...", description: "Restoring your backup" });
                          const result = await backupApi.import(backup);
                          
                          queryClient.invalidateQueries();
                          toast({ title: "Backup Imported", description: result.message });
                        }
                      } catch (error) {
                        toast({ variant: "destructive", title: "Import Failed", description: "Could not import backup file" });
                      }
                      
                      e.target.value = '';
                    }}
                    className="cursor-pointer"
                    data-testid="backup-import"
                  />
                  <p className="text-xs text-muted-foreground">Select a .json backup file</p>
                </div>
              </div>
            </div>
            
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Note:</strong> Backup files include all photos and face data encoded as base64. Large databases may result in large backup files.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bulk Leave Balance Import</CardTitle>
            <CardDescription>Import leave balances from a CSV file</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Upload a CSV file with columns: <code className="bg-muted px-1 rounded">employeeId, leaveType, total, taken, pending</code>
              </p>
              <p className="text-sm text-muted-foreground">
                Example: <code className="bg-muted px-1 rounded">EMP001,Annual Leave,15,5,0</code>
              </p>
            </div>
            <Input
              type="file"
              accept=".csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                try {
                  const text = await file.text();
                  const lines = text.trim().split('\n');
                  
                  // Skip header if present
                  const hasHeader = lines[0].toLowerCase().includes('employeeid') || lines[0].toLowerCase().includes('leavetype');
                  const dataLines = hasHeader ? lines.slice(1) : lines;

                  const records = dataLines.map(line => {
                    const [employeeId, leaveType, total, taken, pending] = line.split(',').map(s => s.trim());
                    return {
                      employeeId,
                      leaveType,
                      total: parseFloat(total) || 0,
                      taken: parseFloat(taken) || 0,
                      pending: parseFloat(pending) || 0,
                    };
                  }).filter(r => r.employeeId && r.leaveType);

                  if (records.length === 0) {
                    toast({ variant: "destructive", title: "No Valid Records", description: "No valid records found in the CSV file" });
                    return;
                  }

                  if (window.confirm(`Import ${records.length} leave balance records?\n\nThis will update existing balances or create new ones.`)) {
                    toast({ title: "Importing...", description: `Processing ${records.length} records` });
                    const result = await leaveBalanceApi.bulkImport(records);
                    
                    queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
                    
                    let message = `Imported: ${result.imported}, Updated: ${result.updated}`;
                    if (result.errors.length > 0) {
                      message += `\nErrors: ${result.errors.length}`;
                      console.log('Import errors:', result.errors);
                    }
                    
                    toast({ 
                      title: "Import Complete", 
                      description: message,
                      variant: result.errors.length > 0 ? "destructive" : "default"
                    });
                  }
                } catch (error) {
                  toast({ variant: "destructive", title: "Import Failed", description: "Could not process CSV file" });
                }
                
                e.target.value = '';
              }}
              className="cursor-pointer"
              data-testid="leave-balance-import"
            />
            <Button
              variant="outline"
              onClick={() => {
                const template = "employeeId,leaveType,total,taken,pending\nEMP001,Annual Leave,15,5,0\nEMP001,Sick Leave,12,2,0\nEMP002,Annual Leave,20,3,1";
                const blob = new Blob([template], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'leave-balance-template.csv';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              data-testid="download-leave-template"
            >
              <Download className="mr-2 h-4 w-4" /> Download Template
            </Button>
          </CardContent>
        </Card>
            
        <Button onClick={handleSaveSettings} className="btn-industrial">
          <Save className="mr-2 h-4 w-4" /> Save Configuration
        </Button>
      </>
      )}
      
      {/* User Groups Tab */}
      {settingsTab === 'user-groups' && (
      <>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>User Groups</CardTitle>
              <CardDescription>Manage admin user groups for access control</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleOpenCreateAdmin} className="btn-industrial bg-status-warning hover:bg-status-warning/80 text-white" data-testid="button-add-admin">
                <UserCog className="mr-2 h-4 w-4" /> Add Admin User
              </Button>
              <Button onClick={handleOpenCreateGroup} className="btn-industrial bg-primary text-white" data-testid="button-add-group">
                <Plus className="mr-2 h-4 w-4" /> Add Group
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {userGroups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No user groups created yet. Click "Add Group" to create your first one.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Admins</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userGroups.map((group) => {
                    const adminCount = users.filter(u => u.userGroupId === group.id).length;
                    return (
                      <TableRow key={group.id} data-testid={`row-group-${group.id}`}>
                        <TableCell className="font-medium">{group.name}</TableCell>
                        <TableCell className="text-muted-foreground">{group.description || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{adminCount}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleOpenEditGroup(group)} data-testid={`button-edit-group-${group.id}`}>
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleDeleteGroup(group.id)}
                            disabled={adminCount > 0}
                            title={adminCount > 0 ? "Cannot delete group with assigned admins" : "Delete group"}
                            data-testid={`button-delete-group-${group.id}`}
                          >
                            <Trash2 className={`h-4 w-4 ${adminCount > 0 ? 'text-muted-foreground/40' : 'text-destructive'}`} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Admin Users</CardTitle>
            <CardDescription>Administrators with system access</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>User Group</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.filter(u => isManagerOrAbove(u)).map((admin) => {
                  const group = userGroups.find(g => g.id === admin.userGroupId);
                  return (
                    <TableRow key={admin.id} data-testid={`row-admin-${admin.id}`}>
                      <TableCell className="font-medium">{admin.firstName} {admin.surname}</TableCell>
                      <TableCell>{admin.email}</TableCell>
                      <TableCell>
                        {group ? (
                          <Badge variant="secondary">{group.name}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleResendCredentials(admin.id)}
                          title="Resend credentials email"
                          data-testid={`button-resend-credentials-${admin.id}`}
                        >
                          <Mail className="h-4 w-4 text-status-info" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(admin.id)}>
                          <Trash2 className="h-4 w-4 text-destructive00" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </>
      )}
      
      {/* Branding Tab */}
      {settingsTab === 'branding' && (
      <>
        <Card>
          <CardHeader>
            <CardTitle>Company Branding</CardTitle>
            <CardDescription>Customize the application appearance for your organization</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 max-w-xl">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Company Name</Label>
                <Input 
                  value={companyName} 
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Your Company Name"
                  data-testid="input-company-name"
                />
                <p className="text-xs text-muted-foreground">
                  This name appears in the header, login page, and throughout the application.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Company Logo (URL or Base64)</Label>
                <Input 
                  value={companyLogo} 
                  onChange={(e) => setCompanyLogo(e.target.value)}
                  placeholder="https://example.com/logo.png or paste base64 image"
                  data-testid="input-company-logo"
                />
                <p className="text-xs text-muted-foreground">
                  Enter a URL to your company logo or paste a base64-encoded image.
                </p>
                {companyLogo && (
                  <div className="mt-2 p-4 border rounded-lg bg-slate-50 dark:bg-slate-800">
                    <p className="text-xs text-muted-foreground mb-2">Preview:</p>
                    <img 
                      src={companyLogo} 
                      alt="Company Logo Preview" 
                      className="h-12 object-contain"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Color Scheme</CardTitle>
            <CardDescription>Customize the application colors to match your brand</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 max-w-xl">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Primary Color</Label>
                <div className="flex gap-2 items-center">
                  <input 
                    type="color" 
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-12 h-10 rounded border cursor-pointer"
                    data-testid="input-primary-color"
                  />
                  <Input 
                    value={primaryColor} 
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-32"
                    placeholder="#1e40af"
                  />
                  <div 
                    className="w-24 h-10 rounded flex items-center justify-center text-white text-xs font-medium"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Preview
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Main color used for headers, buttons, and navigation.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Accent Color</Label>
                <div className="flex gap-2 items-center">
                  <input 
                    type="color" 
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-12 h-10 rounded border cursor-pointer"
                    data-testid="input-accent-color"
                  />
                  <Input 
                    value={accentColor} 
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-32"
                    placeholder="#3b82f6"
                  />
                  <div 
                    className="w-24 h-10 rounded flex items-center justify-center text-white text-xs font-medium"
                    style={{ backgroundColor: accentColor }}
                  >
                    Preview
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Secondary color used for links, highlights, and interactive elements.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Terminology</CardTitle>
            <CardDescription>Customize the terms used in the application to match your organization</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 max-w-xl">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Term for "Employee"</Label>
                <Input 
                  value={termEmployee} 
                  onChange={(e) => setTermEmployee(e.target.value)}
                  placeholder="Employee"
                  data-testid="input-term-employee"
                />
              </div>
              <div className="space-y-2">
                <Label>Term for "Department"</Label>
                <Input 
                  value={termDepartment} 
                  onChange={(e) => setTermDepartment(e.target.value)}
                  placeholder="Department"
                  data-testid="input-term-department"
                />
              </div>
              <div className="space-y-2">
                <Label>Term for "Clock In"</Label>
                <Input 
                  value={termClockIn} 
                  onChange={(e) => setTermClockIn(e.target.value)}
                  placeholder="Clock In"
                  data-testid="input-term-clock-in"
                />
              </div>
              <div className="space-y-2">
                <Label>Term for "Clock Out"</Label>
                <Input 
                  value={termClockOut} 
                  onChange={(e) => setTermClockOut(e.target.value)}
                  placeholder="Clock Out"
                  data-testid="input-term-clock-out"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              These terms will be used throughout the application. For example, "Worker" instead of "Employee", or "Section" instead of "Department".
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <Button 
              onClick={async () => {
                try {
                  await Promise.all([
                    updateSettingMutation.mutateAsync({ key: 'company_name', value: companyName }),
                    updateSettingMutation.mutateAsync({ key: 'company_logo', value: companyLogo }),
                    updateSettingMutation.mutateAsync({ key: 'primary_color', value: primaryColor }),
                    updateSettingMutation.mutateAsync({ key: 'accent_color', value: accentColor }),
                    updateSettingMutation.mutateAsync({ key: 'term_employee', value: termEmployee }),
                    updateSettingMutation.mutateAsync({ key: 'term_department', value: termDepartment }),
                    updateSettingMutation.mutateAsync({ key: 'term_clock_in', value: termClockIn }),
                    updateSettingMutation.mutateAsync({ key: 'term_clock_out', value: termClockOut }),
                  ]);
                  toast({ title: "Branding Settings Saved", description: "Your customizations have been saved. Refresh the page to see changes." });
                } catch (error) {
                  toast({ variant: "destructive", title: "Error", description: "Failed to save branding settings" });
                }
              }}
              className="w-full"
              data-testid="button-save-branding"
            >
              <Save className="mr-2 h-4 w-4" />
              Save Branding Settings
            </Button>
          </CardContent>
        </Card>
      </>
      )}

      {/* API Access Tab */}
      {settingsTab === 'api' && (
      <>
        <Card>
          <CardHeader>
            <CardTitle>External Employee API</CardTitle>
            <CardDescription>
              Allow external systems to securely pull employee data using this API key.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 max-w-2xl">
            {/* Endpoint */}
            <div className="space-y-2">
              <Label>API Endpoint</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted rounded px-3 py-2 text-sm font-mono break-all">
                  GET {window.location.origin}/api/external/employees
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/api/external/employees`);
                    toast({ title: "Copied", description: "Endpoint URL copied to clipboard" });
                  }}
                  data-testid="button-copy-endpoint"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* API Key */}
            <div className="space-y-2">
              <Label>API Key</Label>
              {apiKeyLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : (
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted rounded px-3 py-2 text-sm font-mono break-all">
                    {apiKeyVisible ? apiKey : '•'.repeat(Math.min(apiKey.length, 48))}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setApiKeyVisible(v => !v)}
                    data-testid="button-toggle-key-visibility"
                  >
                    {apiKeyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(apiKey);
                      toast({ title: "Copied", description: "API key copied to clipboard" });
                    }}
                    data-testid="button-copy-api-key"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={apiKeyRegenerating}
                    onClick={async () => {
                      if (!confirm('Regenerating the key will immediately revoke access for any app using the old key. Continue?')) return;
                      setApiKeyRegenerating(true);
                      try {
                        const res = await fetch('/api/admin/external-api-key/regenerate', { method: 'POST' });
                        const data = await res.json();
                        setApiKey(data.key);
                        setApiKeyVisible(true);
                        toast({ title: "Key Regenerated", description: "The old key has been revoked. Update all connected apps with the new key." });
                      } catch {
                        toast({ variant: "destructive", title: "Error", description: "Failed to regenerate key" });
                      } finally {
                        setApiKeyRegenerating(false);
                      }
                    }}
                    data-testid="button-regenerate-api-key"
                  >
                    <RefreshCw className={`h-4 w-4 mr-1 ${apiKeyRegenerating ? 'animate-spin' : ''}`} />
                    Regenerate
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Keep this key secret. Treat it like a password — do not share it publicly.
              </p>
            </div>

            {/* Usage example */}
            <div className="space-y-2">
              <Label>How to Use</Label>
              <div className="bg-slate-900 text-slate-100 rounded-lg p-4 space-y-3 text-sm font-mono">
                <p className="text-slate-400"># Pass the key in the X-API-Key header</p>
                <p>curl \</p>
                <p className="pl-4">-H "X-API-Key: YOUR_API_KEY" \</p>
                <p className="pl-4">{window.location.origin}/api/external/employees</p>
              </div>
            </div>

            {/* Response shape */}
            <div className="space-y-2">
              <Label>Response Format</Label>
              <div className="bg-muted rounded-lg p-4 text-xs font-mono space-y-1">
                <p>{'{'}</p>
                <p className="pl-4">"count": 42,</p>
                <p className="pl-4">"generatedAt": "2026-01-01T08:00:00.000Z",</p>
                <p className="pl-4">"employees": [</p>
                <p className="pl-8">{'{ "id", "firstName", "surname", "nickname", "email", "mobile",'}</p>
                <p className="pl-10">{'"role", "departmentId", "departmentName", "employeeTypeName",'}</p>
                <p className="pl-10">{'"companyId", "companyName", "managerId", ... }'}</p>
                <p className="pl-4">]</p>
                <p>{'}'}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Sensitive fields (face data, password hashes) are always excluded from the response.
              </p>
            </div>
          </CardContent>
        </Card>
      </>
      )}

      {/* Group Dialog */}
      <Dialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditingGroup ? 'Edit User Group' : 'Add New User Group'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="groupName" className="text-right">Name</Label>
              <Input 
                id="groupName" 
                value={currentGroup.name || ''} 
                onChange={(e) => setCurrentGroup({...currentGroup, name: e.target.value})}
                className="col-span-3"
                placeholder="e.g., HR Managers"
                data-testid="input-group-name"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="groupDesc" className="text-right">Description</Label>
              <Input 
                id="groupDesc" 
                value={currentGroup.description || ''} 
                onChange={(e) => setCurrentGroup({...currentGroup, description: e.target.value})}
                className="col-span-3"
                placeholder="Optional description"
                data-testid="input-group-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveGroup} data-testid="button-save-group">
              {isEditingGroup ? 'Save Changes' : 'Create User Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin User Dialog */}
      <Dialog open={isAdminDialogOpen} onOpenChange={setIsAdminDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Admin User</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">First Name</Label>
              <Input 
                value={adminData.firstName} 
                onChange={(e) => setAdminData({...adminData, firstName: e.target.value})}
                className="col-span-3"
                data-testid="input-admin-firstname"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Surname</Label>
              <Input 
                value={adminData.surname} 
                onChange={(e) => setAdminData({...adminData, surname: e.target.value})}
                className="col-span-3"
                data-testid="input-admin-surname"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Email</Label>
              <Input 
                type="email"
                value={adminData.email} 
                onChange={(e) => setAdminData({...adminData, email: e.target.value})}
                className="col-span-3"
                data-testid="input-admin-email"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">User Group</Label>
              <div className="col-span-3">
                <Select 
                  value={adminData.userGroupId?.toString()} 
                  onValueChange={(value) => setAdminData({...adminData, userGroupId: parseInt(value)})}
                >
                  <SelectTrigger data-testid="select-admin-group">
                    <SelectValue placeholder="Select group" />
                  </SelectTrigger>
                  <SelectContent>
                    {userGroups.map(group => (
                      <SelectItem key={group.id} value={group.id.toString()}>{group.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Password</Label>
              <div className="col-span-3 flex gap-2">
                <Input 
                  value={adminData.password} 
                  onChange={(e) => setAdminData({...adminData, password: e.target.value})}
                  className="flex-1"
                  data-testid="input-admin-password"
                />
                <Button variant="outline" size="sm" onClick={() => setAdminData({...adminData, password: generatePassword()})}>
                  Regen
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveAdmin} data-testid="button-save-admin">Create Admin</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role Permissions Tab */}
      {settingsTab === 'role-permissions' && (() => {
        const CONFIGURABLE_ROLES = ['employee', 'manager', 'hr'] as const;
        const ROLE_LABELS: Record<string, string> = { employee: 'Employee', manager: 'Manager', hr: 'HR' };

        const NAV_GROUPS = [
          {
            label: 'My Tools',
            items: [
              { key: 'nav.apply-leave', label: 'Apply for Leave' },
              { key: 'nav.my-attendance', label: 'My Attendance' },
              { key: 'nav.profile', label: 'My Profile' },
              { key: 'nav.grievances', label: 'Grievances' },
            ],
          },
          {
            label: 'Management',
            items: [
              { key: 'nav.admin-insights', label: 'Admin Insights' },
              { key: 'nav.personnel', label: 'Personnel (full list)' },
              { key: 'nav.my-team', label: 'My Team (direct reports)' },
              { key: 'nav.org-chart', label: 'Organization Chart' },
              { key: 'nav.leave-requests', label: 'Leave Requests' },
              { key: 'nav.attendance', label: 'Attendance' },
              { key: 'nav.reports', label: 'Attendance Reports' },
              { key: 'nav.leave-calendar', label: 'Leave Calendar' },
            ],
          },
        ];

        const PERSONNEL_ITEMS = [
          { key: 'personnel.add-person', label: 'Add Person' },
          { key: 'personnel.export-pdf', label: 'Export PDF' },
          { key: 'personnel.missing-info', label: 'Missing Information Report' },
          { key: 'personnel.edit', label: 'Edit Employee' },
          { key: 'personnel.terminate', label: 'Terminate / Reactivate' },
          { key: 'personnel.delete', label: 'Delete Employee' },
          { key: 'personnel.assign-roles', label: 'Assign Roles' },
        ];

        const CheckboxCell = ({ role, permKey }: { role: string; permKey: string }) => (
          <TableCell className="text-center">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-primary"
              checked={(rolePerms[role] ?? []).includes(permKey)}
              onChange={() => togglePerm(role, permKey)}
            />
          </TableCell>
        );

        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5" /> Role Permissions</CardTitle>
              <CardDescription>Control which pages and capabilities each role can access. Admin always has full access.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {hasZeroPermsRole && (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-status-warning/40 bg-status-warning-muted text-sm text-status-warning">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  One or more roles have zero permissions — those users will see a blank sidebar.
                </div>
              )}

              {/* Navigation permissions */}
              <div>
                <h3 className="font-semibold text-sm text-foreground mb-3">Navigation</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-64">Page</TableHead>
                      {CONFIGURABLE_ROLES.map(r => (
                        <TableHead key={r} className="text-center w-24">{ROLE_LABELS[r]}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {NAV_GROUPS.map(group => (
                      <>
                        <TableRow key={group.label} className="bg-muted/30">
                          <TableCell colSpan={4} className="py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {group.label}
                          </TableCell>
                        </TableRow>
                        {group.items.map(item => (
                          <TableRow key={item.key}>
                            <TableCell className="pl-6 text-sm">{item.label}</TableCell>
                            {CONFIGURABLE_ROLES.map(r => <CheckboxCell key={r} role={r} permKey={item.key} />)}
                          </TableRow>
                        ))}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Personnel capabilities */}
              <div>
                <h3 className="font-semibold text-sm text-foreground mb-1">Personnel Capabilities</h3>
                <p className="text-xs text-muted-foreground mb-3">Only applies to roles with Personnel page access. My Team is always read-only. "Add Admin" is always admin-only.</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-64">Capability</TableHead>
                      {CONFIGURABLE_ROLES.map(r => (
                        <TableHead key={r} className="text-center w-24">{ROLE_LABELS[r]}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {PERSONNEL_ITEMS.map(item => (
                      <TableRow key={item.key}>
                        <TableCell className="text-sm">{item.label}</TableCell>
                        {CONFIGURABLE_ROLES.map(r => <CheckboxCell key={r} role={r} permKey={item.key} />)}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Button onClick={handleSaveRolePermissions} className="w-full" data-testid="button-save-role-permissions">
                <Save className="mr-2 h-4 w-4" /> Save Permissions
              </Button>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
