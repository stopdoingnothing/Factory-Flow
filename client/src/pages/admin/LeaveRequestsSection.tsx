import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { format } from 'date-fns';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/lib/auth-context';
import { leaveRequestApi, leaveBalanceApi, userApi, publicHolidayApi } from '@/lib/api';
import type { LeaveRequest, LeaveBalance } from '@shared/schema';
import { FileText, Check, X, Trash2, Loader2, Plus, Pencil, BookOpen, Lock, CalendarIcon, Users } from 'lucide-react';
import { Switch } from "@/components/ui/switch";
import { formatLeaveStatus, canTakeAction, formatLeaveDays } from './utils';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export default function LeaveRequestsSection() {
  const { toast } = useToast();
  const { user, hasRole } = useAuth();
  const queryClient = useQueryClient();

  // State
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [selectedLeaveRequest, setSelectedLeaveRequest] = useState<LeaveRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState('');

  // Historic leave entry state
  const [isHistoricDialogOpen, setIsHistoricDialogOpen] = useState(false);
  const [editingHistoric, setEditingHistoric] = useState<LeaveRequest | null>(null);
  const [historicForm, setHistoricForm] = useState({
    userId: '',
    leaveType: '',
    startDate: '',
    endDate: '',
    reason: '',
    authorizedBy: '',
    referenceNumber: '',
    notes: '',
  });

  // Queries
  const { data: leaveRequests = [] } = useQuery({
    queryKey: ['leave-requests'],
    queryFn: () => leaveRequestApi.getAll(),
  });

  const { data: leaveBalances = [] } = useQuery({
    queryKey: ['leave-balances'],
    queryFn: () => leaveBalanceApi.getAll(),
  });

  // Per-employee balance query for the review dialog — accessible to managers (no admin required)
  const { data: selectedEmployeeBalances = [] } = useQuery<LeaveBalance[]>({
    queryKey: ['leave-balances', selectedLeaveRequest?.userId],
    queryFn: () => leaveBalanceApi.getByUserId(selectedLeaveRequest!.userId),
    enabled: !!selectedLeaveRequest?.userId,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: userApi.getAll,
  });

  // When the role-filtered users list doesn't include the approvers (e.g. a manager viewing
  // their own leave request can't see who their manager is via /api/users), fetch them directly.
  const managerApproverInList = users.find(u => u.id === selectedLeaveRequest?.managerApproverId);
  const { data: managerApproverUser } = useQuery({
    queryKey: ['user', selectedLeaveRequest?.managerApproverId],
    queryFn: () => userApi.getById(selectedLeaveRequest!.managerApproverId!),
    enabled: !!(selectedLeaveRequest?.managerApproverId) && !managerApproverInList,
  });

  const hrApproverInList = users.find(u => u.id === selectedLeaveRequest?.hrApproverId);
  const { data: hrApproverUser } = useQuery({
    queryKey: ['user', selectedLeaveRequest?.hrApproverId],
    queryFn: () => userApi.getById(selectedLeaveRequest!.hrApproverId!),
    enabled: !!(selectedLeaveRequest?.hrApproverId) && !hrApproverInList,
  });

  const resolveApprover = (id: string | null | undefined) =>
    users.find(u => u.id === id) ??
    (id === selectedLeaveRequest?.managerApproverId ? managerApproverUser : undefined) ??
    (id === selectedLeaveRequest?.hrApproverId ? hrApproverUser : undefined);

  const { data: publicHolidays = [] } = useQuery({
    queryKey: ['public-holidays'],
    queryFn: () => publicHolidayApi.getAll(),
  });

  // Count Mon–Fri working days between two date strings, excluding public holidays.
  // Religion-specific holidays are only excluded when the employee's religion matches.
  function countWorkingDays(startStr: string, endStr: string, employeeReligion?: string | null): number {
    const recurringMmDd = new Set<string>();
    const specificYmd = new Set<string>();
    for (const h of publicHolidays as any[]) {
      // Skip religion-specific holidays unless the employee shares that religion
      if (h.religionGroup && h.religionGroup !== employeeReligion) continue;
      const d = new Date(h.date + 'T00:00:00');
      const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (h.isRecurring) recurringMmDd.add(mmdd);
      else specificYmd.add(h.date);
    }
    const start = new Date(startStr + 'T00:00:00');
    const end = new Date(endStr + 'T00:00:00');
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) {
        const ymd = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        const mmdd = `${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        if (!recurringMmDd.has(mmdd) && !specificYmd.has(ymd)) count++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }

  // Mutations
  const managerDecisionMutation = useMutation({
    mutationFn: ({ id, decision, notes }: { id: number; decision: 'approved' | 'rejected'; notes?: string }) =>
      leaveRequestApi.managerDecision(id, user?.id || '', decision, notes),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
      setAdminNotes('');
      setIsReviewDialogOpen(false);
      toast({
        title: variables.decision === 'approved' ? "Leave Recommended" : "Leave Not Recommended",
        description: variables.decision === 'approved'
          ? "You have recommended this leave request. The employee will be notified."
          : "You have not recommended this leave request. The employee will be notified."
      });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to process decision" });
    },
  });

  const hrDecisionMutation = useMutation({
    mutationFn: ({ id, decision, notes }: { id: number; decision: 'approved' | 'rejected'; notes?: string }) =>
      leaveRequestApi.hrDecision(id, user?.id || '', decision, notes),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
      setAdminNotes('');
      setIsReviewDialogOpen(false);
      toast({
        title: variables.decision === 'approved' ? "Leave Approved" : "Leave Rejected",
        description: variables.decision === 'approved'
          ? "Leave request has been approved. The employee will be notified."
          : "Leave request has been rejected. The employee will be notified."
      });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to process decision" });
    },
  });

  const adminCancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) => 
      leaveRequestApi.adminCancel(id, user?.id || '', reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
      setAdminNotes('');
      setIsReviewDialogOpen(false);
      toast({ title: "Leave Request Cancelled", description: "The request has been cancelled and leave balance adjusted." });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to cancel request" });
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: leaveRequestApi.permanentDelete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
      toast({ title: "Request Deleted", description: "The leave request has been permanently deleted." });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to delete request" });
    },
  });

  const createHistoricMutation = useMutation({
    mutationFn: (data: Parameters<typeof leaveRequestApi.createHistoric>[0]) => leaveRequestApi.createHistoric(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
      setIsHistoricDialogOpen(false);
      setEditingHistoric(null);
      setHistoricForm({ userId: '', leaveType: '', startDate: '', endDate: '', reason: '', authorizedBy: '', referenceNumber: '', notes: '' });
      toast({ title: "Historic Entry Added", description: "The leave record has been captured and the balance updated." });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to create historic entry" });
    },
  });

  const updateHistoricMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof leaveRequestApi.updateHistoric>[1] }) =>
      leaveRequestApi.updateHistoric(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
      setIsHistoricDialogOpen(false);
      setEditingHistoric(null);
      setHistoricForm({ userId: '', leaveType: '', startDate: '', endDate: '', reason: '', authorizedBy: '', referenceNumber: '', notes: '' });
      toast({ title: "Historic Entry Updated", description: "The leave record has been updated and balances adjusted." });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to update historic entry" });
    },
  });

  const openAddHistoric = () => {
    setEditingHistoric(null);
    setHistoricForm({ userId: '', leaveType: '', startDate: '', endDate: '', reason: '', authorizedBy: '', referenceNumber: '', notes: '' });
    setIsHistoricDialogOpen(true);
  };

  const openEditHistoric = (req: LeaveRequest) => {
    setEditingHistoric(req);
    setHistoricForm({
      userId: req.userId,
      leaveType: req.leaveType,
      startDate: req.startDate,
      endDate: req.endDate,
      reason: req.reason || '',
      authorizedBy: (req as any).authorizedBy || '',
      referenceNumber: (req as any).referenceNumber || '',
      notes: req.adminNotes || '',
    });
    setIsHistoricDialogOpen(true);
  };

  const submitHistoricForm = () => {
    if (!historicForm.userId || !historicForm.leaveType || !historicForm.startDate || !historicForm.endDate) {
      toast({ variant: "destructive", title: "Missing Fields", description: "Employee, leave type, start date and end date are required." });
      return;
    }
    if (editingHistoric) {
      updateHistoricMutation.mutate({ id: editingHistoric.id, data: historicForm });
    } else {
      createHistoricMutation.mutate(historicForm);
    }
  };


  const [historicShowCurrentOnly, setHistoricShowCurrentOnly] = useState(true);

  const historicRequestsAll = (leaveRequests as any[]).filter((r: any) => r.isHistoric);
  const historicRequests = historicShowCurrentOnly
    ? historicRequestsAll.filter((r: any) => {
        const emp = users.find((u: any) => u.id === r.userId);
        return emp && !emp.terminationDate;
      })
    : historicRequestsAll;
  const isHrOrAdmin = hasRole('hr') || hasRole('admin');
  const isManagerOnly = hasRole('manager') && !isHrOrAdmin;
  const isAdmin = isHrOrAdmin || isManagerOnly;
  const activeRequests = (leaveRequests as any[]).filter((r: any) => {
    if (r.isHistoric) return false;
    // Managers see requests pending their recommendation, plus ones they've already acted on awaiting HR
    if (isManagerOnly && r.userId !== user?.id) return r.status === 'pending_manager' || (r.status === 'pending_hr' && r.managerApproverId === user?.id);
    return true;
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-heading font-bold text-slate-900">Leave Requests</h1>
        <p className="text-muted-foreground">Review and approve/reject employee leave requests</p>
      </div>

      <Tabs defaultValue="requests">
        <TabsList className="mb-4">
          <TabsTrigger value="requests">Active Requests</TabsTrigger>
          <TabsTrigger value="balances">Leave Balances</TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="historic" className="flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5" />
              Historic Entries
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="requests">
      <Card>
        <CardHeader>
          <CardTitle>Active Leave Requests</CardTitle>
          <CardDescription>Review and approve/reject employee leave requests</CardDescription>
        </CardHeader>
        <CardContent>
          {activeRequests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No active leave requests found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeRequests.map((request: LeaveRequest) => {
                  const employee = users.find(u => u.id === request.userId);
                  const statusInfo = formatLeaveStatus(request.status);
                  const actionInfo = canTakeAction(request);
                  return (
                    <TableRow key={request.id} data-testid={`row-leave-request-${request.id}`}>
                      <TableCell className="font-medium">
                        {employee ? `${employee.firstName} ${employee.surname}` : request.userId}
                      </TableCell>
                      <TableCell className="capitalize">{request.leaveType.replace('_', ' ')}</TableCell>
                      <TableCell>
                        {format(new Date(request.startDate), 'd MMM')} - {format(new Date(request.endDate), 'd MMM yyyy')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusInfo.variant}>
                          {statusInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => {
                            setSelectedLeaveRequest(request);
                            setAdminNotes('');
                            setIsReviewDialogOpen(true);
                          }}
                          data-testid={`button-review-${request.id}`}
                          title="Review"
                        >
                          <FileText className="h-4 w-4 text-blue-500" />
                        </Button>
                        {actionInfo.canAct && (() => {
                          const canActHere =
                            (actionInfo.role === 'manager' && (hasRole('manager') || isHrOrAdmin)) ||
                            (actionInfo.role === 'hr' && isHrOrAdmin);
                          if (!canActHere) return null;
                          return (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (actionInfo.role === 'manager') {
                                    managerDecisionMutation.mutate({ id: request.id, decision: 'approved' });
                                  } else if (actionInfo.role === 'hr') {
                                    hrDecisionMutation.mutate({ id: request.id, decision: 'approved' });
                                  }
                                }}
                                data-testid={`button-approve-${request.id}`}
                                title={actionInfo.role === 'manager' ? 'Recommend' : 'Approve'}
                              >
                                <Check className="h-4 w-4 text-green-500" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (actionInfo.role === 'manager') {
                                    managerDecisionMutation.mutate({ id: request.id, decision: 'rejected' });
                                  } else if (actionInfo.role === 'hr') {
                                    hrDecisionMutation.mutate({ id: request.id, decision: 'rejected' });
                                  }
                                }}
                                data-testid={`button-reject-${request.id}`}
                                title={actionInfo.role === 'manager' ? 'Not Recommend' : 'Reject'}
                              >
                                <X className="h-4 w-4 text-red-500" />
                              </Button>
                            </>
                          );
                        })()}
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => {
                            if (confirm('Are you sure you want to permanently delete this leave request? This action cannot be undone.')) {
                              permanentDeleteMutation.mutate(request.id);
                            }
                          }}
                          data-testid={`button-delete-${request.id}`}
                          title="Permanently Delete"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
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
        </TabsContent>

        <TabsContent value="balances">
      <Card>
        <CardHeader>
          <CardTitle>Leave Balances</CardTitle>
          <CardDescription>Entitlement per leave type for each employee. Available = Entitlement + Carry Over − Taken − Pending.</CardDescription>
        </CardHeader>
        <CardContent>
          {leaveBalances.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No leave balances found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Leave Type</TableHead>
                  <TableHead className="text-right">Entitlement</TableHead>
                  <TableHead className="text-right">Carry Over</TableHead>
                  <TableHead className="text-right">Taken</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  // Group balances by employee so we can span the name cell
                  const employeeBalances = new Map<string, LeaveBalance[]>();
                  leaveBalances.forEach((balance: LeaveBalance) => {
                    const existing = employeeBalances.get(balance.userId) || [];
                    existing.push(balance);
                    employeeBalances.set(balance.userId, existing);
                  });

                  return Array.from(employeeBalances.entries()).flatMap(([userId, balances]) => {
                    const employee = users.find(u => u.id === userId);
                    const employeeName = employee ? `${employee.firstName} ${employee.surname}` : userId;
                    const today = new Date().toISOString().split('T')[0];
                    // Deduplicate: keep only the first balance entry per leave type
                    const uniqueBalances = balances.filter(
                      (b, i, arr) => arr.findIndex(x => x.leaveType === b.leaveType) === i
                    );

                    return uniqueBalances.map((balance, idx) => {
                      const carryOver = (balance as any).carryOverDays as number ?? 0;
                      const carryOverExpiry = (balance as any).carryOverExpiry as string | null ?? null;
                      // balance.total = pure entitlement + carryOver (stored together).
                      // Derive pure entitlement for display; available = total - taken - pending (no double-count).
                      const total = balance.total ?? 0;
                      const pureEntitlement = total - carryOver;
                      const taken = balance.taken ?? 0;
                      const pending = balance.pending ?? 0;
                      const available = total - taken - pending;
                      const expiringSoon = carryOver > 0 && carryOverExpiry && carryOverExpiry > today
                        && new Date(carryOverExpiry).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000;

                      return (
                        <TableRow key={balance.id} data-testid={`row-balance-detail-${balance.id}`}
                          className={idx === 0 ? 'border-t-2 border-t-slate-200' : ''}>
                          <TableCell className="font-medium align-top">
                            {idx === 0 ? employeeName : ''}
                          </TableCell>
                          <TableCell className="text-muted-foreground capitalize">
                            {balance.leaveType}
                          </TableCell>
                          <TableCell className="text-right">{formatLeaveDays(pureEntitlement)}</TableCell>
                          <TableCell className="text-right">
                            {carryOver > 0 ? (
                              <span className={`text-blue-600 font-medium${expiringSoon ? ' text-orange-600' : ''}`}>
                                +{formatLeaveDays(carryOver)}
                                {carryOverExpiry && (
                                  <span className="block text-[10px] font-normal text-muted-foreground">
                                    {expiringSoon ? '⚠ ' : ''}expires {new Date(carryOverExpiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{taken > 0 ? formatLeaveDays(taken) : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-right">{pending > 0 ? formatLeaveDays(pending) : <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={available > 0 ? 'outline' : 'destructive'} className="text-xs font-semibold">
                              {formatLeaveDays(available)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    });
                  });
                })()}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="historic">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-amber-600" />
                      Historic Leave Entries
                    </CardTitle>
                    <CardDescription>
                      Backfill past leave records from physical books. These bypass the approval workflow and immediately affect leave balances.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="historic-current-only"
                        checked={historicShowCurrentOnly}
                        onCheckedChange={setHistoricShowCurrentOnly}
                        data-testid="switch-historic-current-only"
                      />
                      <Label htmlFor="historic-current-only" className="flex items-center gap-1.5 text-sm cursor-pointer whitespace-nowrap">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        Current employees only
                        {historicShowCurrentOnly && (
                          <Badge variant="secondary" className="text-xs ml-1">
                            {historicRequests.length} / {historicRequestsAll.length}
                          </Badge>
                        )}
                      </Label>
                    </div>
                    {isHrOrAdmin && (
                      <Button onClick={openAddHistoric} data-testid="button-add-historic">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Historic Entry
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {historicRequests.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No historic entries yet</p>
                    <p className="text-sm">Click "Add Historic Entry" to capture leave records from your physical books.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ref #</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Leave Type</TableHead>
                        <TableHead>Dates</TableHead>
                        <TableHead>Days</TableHead>
                        <TableHead>Authorized By</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historicRequests.map((request: any) => {
                        const employee = users.find((u: any) => u.id === request.userId);
                        const days = countWorkingDays(request.startDate, request.endDate, (employee as any)?.religion || null);
                        return (
                          <TableRow key={request.id} data-testid={`row-historic-${request.id}`}>
                            <TableCell>
                              {request.referenceNumber ? (
                                <Badge variant="outline" className="font-mono text-xs">{request.referenceNumber}</Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs italic">—</span>
                              )}
                            </TableCell>
                            <TableCell className="font-medium">
                              {employee ? `${employee.firstName} ${employee.surname}` : request.userId}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{request.leaveType}</Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {format(new Date(request.startDate), 'd MMM yyyy')} – {format(new Date(request.endDate), 'd MMM yyyy')}
                            </TableCell>
                            <TableCell>
                              <span className="font-semibold">{days}</span>
                              <span className="text-muted-foreground text-xs ml-1">day{days !== 1 ? 's' : ''}</span>
                            </TableCell>
                            <TableCell className="text-sm">
                              {request.authorizedBy || <span className="text-muted-foreground italic">—</span>}
                            </TableCell>
                            <TableCell className="text-sm max-w-[200px] truncate">
                              {request.reason || <span className="text-muted-foreground italic">—</span>}
                            </TableCell>
                            <TableCell className="text-right">
                              {isHrOrAdmin && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openEditHistoric(request)}
                                    data-testid={`button-edit-historic-${request.id}`}
                                    title="Edit"
                                  >
                                    <Pencil className="h-4 w-4 text-blue-500" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      if (confirm('Delete this historic entry? The leave days will be credited back to the employee\'s balance.')) {
                                        permanentDeleteMutation.mutate(request.id);
                                      }
                                    }}
                                    data-testid={`button-delete-historic-${request.id}`}
                                    title="Delete"
                                  >
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  </Button>
                                </>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Leave Request Details</DialogTitle>
          </DialogHeader>
          {selectedLeaveRequest && (() => {
            const employee = users.find(u => u.id === selectedLeaveRequest.userId);
            // Prefer the dedicated per-employee query (works for managers); fall back to bulk admin data
            const employeeLeaveBalances = selectedEmployeeBalances.length > 0
              ? selectedEmployeeBalances
              : leaveBalances.filter((b: LeaveBalance) => b.userId === selectedLeaveRequest.userId);
            const relevantBalance = employeeLeaveBalances.find((b: LeaveBalance) => b.leaveType === selectedLeaveRequest.leaveType);
            const availableDays = relevantBalance ? (relevantBalance.total ?? 0) - (relevantBalance.taken ?? 0) - (relevantBalance.pending ?? 0) : 0;
            const requestedDays = countWorkingDays(
              selectedLeaveRequest.startDate,
              selectedLeaveRequest.endDate,
              employee?.religion ?? null
            );
            
            return (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground text-sm">Employee</Label>
                    <p className="font-medium">{employee ? `${employee.firstName} ${employee.surname}` : selectedLeaveRequest.userId}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">Leave Type</Label>
                    <p className="font-medium capitalize">{selectedLeaveRequest.leaveType.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">Start Date</Label>
                    <p className="font-medium">{format(new Date(selectedLeaveRequest.startDate), 'd MMMM yyyy')}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">End Date</Label>
                    <p className="font-medium">{format(new Date(selectedLeaveRequest.endDate), 'd MMMM yyyy')}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">Status</Label>
                    <Badge variant={formatLeaveStatus(selectedLeaveRequest.status).variant}>
                      {formatLeaveStatus(selectedLeaveRequest.status).label}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">Submitted</Label>
                    <p className="font-medium">{format(new Date(selectedLeaveRequest.createdAt), 'd MMM yyyy h:mm a')}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">Working Days</Label>
                    <p className="font-medium">{formatLeaveDays(requestedDays)} day{requestedDays !== 1 ? 's' : ''}</p>
                  </div>
                </div>

                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <Label className="text-green-800 text-sm font-medium">Employee Leave Balance ({selectedLeaveRequest.leaveType.replace('_', ' ')})</Label>
                  <p className="text-green-700 text-xs mt-1">
                    This request accounts for {formatLeaveDays(requestedDays)} of the {formatLeaveDays(relevantBalance?.pending ?? 0)} pending day(s).
                  </p>
                  <div className="grid grid-cols-4 gap-2 mt-2 text-sm">
                    <div className="text-center p-2 bg-white rounded">
                      <p className="text-muted-foreground text-xs">Total</p>
                      <p className="font-semibold">{formatLeaveDays(relevantBalance?.total || 0)}</p>
                    </div>
                    <div className="text-center p-2 bg-white rounded">
                      <p className="text-muted-foreground text-xs">Taken</p>
                      <p className="font-semibold text-amber-600">{formatLeaveDays(relevantBalance?.taken || 0)}</p>
                    </div>
                    <div className="text-center p-2 bg-white rounded">
                      <p className="text-muted-foreground text-xs">Pending</p>
                      <p className="font-semibold text-blue-600">{formatLeaveDays(relevantBalance?.pending || 0)}</p>
                    </div>
                    <div className="text-center p-2 bg-white rounded">
                      <p className="text-muted-foreground text-xs">Available</p>
                      <p className={`font-semibold ${availableDays > 0 ? 'text-green-600' : 'text-red-600'}`}>{formatLeaveDays(availableDays)}</p>
                    </div>
                  </div>
                  {availableDays <= 0 && (
                    <p className="text-red-600 text-xs mt-2 font-medium">Warning: Employee has no available leave for this type!</p>
                  )}
                </div>

                <div>
                  <Label className="text-muted-foreground text-sm">Reason</Label>
                  <div className="mt-1 p-3 bg-slate-50 rounded-lg border">
                    <p>{selectedLeaveRequest.reason || 'No reason provided'}</p>
                  </div>
                </div>

                {selectedLeaveRequest.comments && (
                  <div>
                    <Label className="text-muted-foreground text-sm">Additional Comments from Employee</Label>
                    <div className="mt-1 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-blue-800">{selectedLeaveRequest.comments}</p>
                    </div>
                  </div>
                )}

                {/* Approval History Section */}
                {(selectedLeaveRequest.managerDecision || selectedLeaveRequest.hrNotes) && (
                  <div className="space-y-3">
                    <Label className="text-muted-foreground text-sm">Approval History</Label>

                    {selectedLeaveRequest.managerDecision && (
                      <div className={`p-3 rounded-lg border ${selectedLeaveRequest.managerDecision === 'rejected' ? 'bg-red-50 border-red-300' : 'bg-purple-50 border-purple-200'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className={`text-xs ${selectedLeaveRequest.managerDecision === 'rejected' ? 'bg-red-100 text-red-700 border-red-300' : 'bg-purple-100 text-purple-700 border-purple-300'}`}>Manager Recommendation</Badge>
                          <span className="text-xs text-muted-foreground">
                            {selectedLeaveRequest.managerDecision === 'approved' ? '✓ Recommended' : '✗ Not Recommended'}
                            {selectedLeaveRequest.managerDecisionAt && ` on ${format(new Date(selectedLeaveRequest.managerDecisionAt), 'd MMM yyyy')}`}
                          </span>
                        </div>
                        {selectedLeaveRequest.managerNotes && (
                          <p className={`text-sm ${selectedLeaveRequest.managerDecision === 'rejected' ? 'text-red-800' : 'text-purple-800'}`}>{selectedLeaveRequest.managerNotes}</p>
                        )}
                        {selectedLeaveRequest.managerApproverId && (() => {
                          const approver = resolveApprover(selectedLeaveRequest.managerApproverId);
                          return approver ? (
                            <p className="text-xs text-muted-foreground mt-1">
                              By: {approver.firstName} {approver.surname}
                            </p>
                          ) : null;
                        })()}
                      </div>
                    )}

                    {selectedLeaveRequest.hrNotes && (
                      <div className="p-3 bg-cyan-50 rounded-lg border border-cyan-200">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs bg-cyan-100 text-cyan-700 border-cyan-300">HR Review</Badge>
                          <span className="text-xs text-muted-foreground">
                            {selectedLeaveRequest.hrDecision === 'approved' ? '✓ Approved' : '✗ Rejected'}
                            {selectedLeaveRequest.hrDecisionAt && ` on ${format(new Date(selectedLeaveRequest.hrDecisionAt), 'd MMM yyyy')}`}
                          </span>
                        </div>
                        <p className="text-sm text-cyan-800">{selectedLeaveRequest.hrNotes}</p>
                        {selectedLeaveRequest.hrApproverId && (() => {
                          const approver = resolveApprover(selectedLeaveRequest.hrApproverId);
                          return approver ? (
                            <p className="text-xs text-muted-foreground mt-1">
                              By: {approver.firstName} {approver.surname}
                            </p>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>
                )}

                {selectedLeaveRequest.documents && selectedLeaveRequest.documents.length > 0 && (
                  <div>
                    <Label className="text-muted-foreground text-sm">Supporting Documents</Label>
                    <div className="mt-2 space-y-2">
                      {selectedLeaveRequest.documents.map((doc, index) => {
                        const isPdf = doc.includes('application/pdf') || doc.includes('.pdf');
                        const isImage = doc.includes('image/');
                        
                        const openDocument = () => {
                          if (doc.startsWith('data:')) {
                            const byteString = atob(doc.split(',')[1]);
                            const mimeType = doc.split(',')[0].split(':')[1].split(';')[0];
                            const ab = new ArrayBuffer(byteString.length);
                            const ia = new Uint8Array(ab);
                            for (let i = 0; i < byteString.length; i++) {
                              ia[i] = byteString.charCodeAt(i);
                            }
                            const blob = new Blob([ab], { type: mimeType });
                            const url = URL.createObjectURL(blob);
                            window.open(url, '_blank');
                          } else {
                            window.open(doc, '_blank');
                          }
                        };
                        
                        return (
                          <button 
                            key={index} 
                            onClick={openDocument}
                            className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border w-full text-left hover:bg-slate-100 transition-colors"
                          >
                            <FileText className="h-4 w-4 text-blue-500" />
                            <span className="text-blue-600 hover:underline">
                              {isPdf ? `PDF Document ${index + 1}` : isImage ? `Image ${index + 1}` : `Document ${index + 1}`}
                              <span className="text-xs text-muted-foreground ml-2">(Click to view)</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Admin Cancel for completed requests (approved/rejected) */}
                {['approved', 'rejected'].includes(selectedLeaveRequest.status) && (
                  <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-sm text-red-700 mb-2 font-medium">Admin Cancel</p>
                    <p className="text-xs text-red-600 mb-3">
                      {selectedLeaveRequest.status === 'approved' 
                        ? "Cancelling this approved leave will credit the leave days back to the employee's balance."
                        : "Cancel this rejected request if needed."}
                    </p>
                    <Button 
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (confirm('Are you sure you want to cancel this leave request?' + 
                          (selectedLeaveRequest.status === 'approved' ? ' The leave days will be credited back to the employee.' : ''))) {
                          adminCancelMutation.mutate({ 
                            id: selectedLeaveRequest.id, 
                            reason: 'Cancelled by admin'
                          });
                        }
                      }}
                      disabled={adminCancelMutation.isPending}
                    >
                      {adminCancelMutation.isPending ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cancelling...</>
                      ) : (
                        <><X className="mr-2 h-4 w-4" /> Cancel Leave Request</>
                      )}
                    </Button>
                  </div>
                )}

                {(() => {
                  const actionInfo = canTakeAction(selectedLeaveRequest);
                  if (!actionInfo.canAct) return null;
                  
                  return (
                    <>
                      <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 mb-4">
                        <p className="text-sm text-blue-800">
                          <strong>Current Stage:</strong> {actionInfo.stage}
                        </p>
                      </div>
                      {actionInfo.role === 'hr' && selectedLeaveRequest.managerDecision === 'not_recommended' && (
                        <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-4">
                          <p className="text-sm font-semibold text-red-800">Manager did not recommend this leave</p>
                          {selectedLeaveRequest.managerNotes && (
                            <p className="text-sm text-red-700 mt-1">{selectedLeaveRequest.managerNotes}</p>
                          )}
                          <p className="text-xs text-red-600 mt-1">You may override this recommendation.</p>
                        </div>
                      )}
                      <div>
                        <Label htmlFor="adminNotes" className="text-sm">
                          Review Comments
                        </Label>
                        <p className="text-xs text-muted-foreground mb-1">
                          {actionInfo.role === 'manager'
                            ? 'Justification is required if you are not recommending this leave.'
                            : actionInfo.role === 'hr'
                            ? 'Review manager recommendation and add HR assessment for MD'
                            : 'Review all previous comments and provide final decision notes'}
                        </p>
                        <Textarea
                          id="adminNotes"
                          placeholder={actionInfo.role === 'manager'
                            ? "Optional for recommendation. Required if not recommending — describe reason clearly."
                            : actionInfo.role === 'hr'
                            ? "HR assessment: Leave balance verification, policy compliance, any concerns?"
                            : "Final review: Overall assessment considering all previous comments"}
                          className="mt-1 min-h-[80px]"
                          value={adminNotes}
                          onChange={(e) => setAdminNotes(e.target.value)}
                          data-testid="input-admin-notes"
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button
                          variant="outline"
                          onClick={() => {
                            if (actionInfo.role === 'manager') {
                              managerDecisionMutation.mutate({
                                id: selectedLeaveRequest.id,
                                decision: 'rejected',
                                notes: adminNotes
                              });
                            } else if (actionInfo.role === 'hr') {
                              hrDecisionMutation.mutate({
                                id: selectedLeaveRequest.id,
                                decision: 'rejected',
                                notes: adminNotes
                              });
                            } else if (actionInfo.role === 'hr') {
                              hrDecisionMutation.mutate({
                                id: selectedLeaveRequest.id,
                                decision: 'rejected',
                                notes: adminNotes
                              });
                            }
                          }}
                          className="text-red-600 border-red-200 hover:bg-red-50"
                        >
                          <X className="mr-2 h-4 w-4" /> {actionInfo.role === 'manager' ? 'Not Recommend' : 'Reject'}
                        </Button>
                        <Button
                          onClick={() => {
                            if (actionInfo.role === 'manager') {
                              managerDecisionMutation.mutate({
                                id: selectedLeaveRequest.id,
                                decision: 'approved',
                                notes: adminNotes
                              });
                            } else if (actionInfo.role === 'hr') {
                              hrDecisionMutation.mutate({
                                id: selectedLeaveRequest.id,
                                decision: 'approved',
                                notes: adminNotes
                              });
                            }
                          }}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Check className="mr-2 h-4 w-4" /> {actionInfo.role === 'manager' ? 'Recommend' : 'Approve'}
                        </Button>
                      </div>
                      
                      {selectedLeaveRequest.status !== 'cancelled' && selectedLeaveRequest.status !== 'rejected' && (
                        <div className="mt-4 pt-4 border-t border-red-200 bg-red-50 -m-4 p-4 rounded-b-lg">
                          <p className="text-sm text-red-700 mb-2 font-medium">Admin Cancel</p>
                          <p className="text-xs text-red-600 mb-3">
                            {selectedLeaveRequest.status === 'approved' 
                              ? "Cancelling this approved leave will credit the leave days back to the employee's balance."
                              : "Cancel this leave request completely."}
                          </p>
                          <Button 
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              if (confirm('Are you sure you want to cancel this leave request?' + 
                                (selectedLeaveRequest.status === 'approved' ? ' The leave days will be credited back to the employee.' : ''))) {
                                adminCancelMutation.mutate({ 
                                  id: selectedLeaveRequest.id, 
                                  reason: adminNotes || 'Cancelled by admin'
                                });
                              }
                            }}
                            disabled={adminCancelMutation.isPending}
                          >
                            {adminCancelMutation.isPending ? (
                              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cancelling...</>
                            ) : (
                              <><X className="mr-2 h-4 w-4" /> Cancel Leave Request</>
                            )}
                          </Button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Historic Leave Entry Dialog */}
      <Dialog open={isHistoricDialogOpen} onOpenChange={setIsHistoricDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-amber-600" />
              {editingHistoric ? 'Edit Historic Leave Entry' : 'Add Historic Leave Entry'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              This entry will be marked as pre-approved and the leave days will be immediately deducted from the employee's balance.
            </div>

            <div className="space-y-1">
              <Label htmlFor="h-employee">Employee <span className="text-red-500">*</span></Label>
              <SearchableSelect
                value={historicForm.userId}
                onValueChange={v => setHistoricForm(f => ({ ...f, userId: v }))}
                options={users
                  .filter((u: any) => !u.terminationDate && !u.excludeFromLeave)
                  .sort((a: any, b: any) => `${a.firstName} ${a.surname}`.localeCompare(`${b.firstName} ${b.surname}`))
                  .map((u: any) => ({ value: u.id, label: `${u.firstName} ${u.surname}` }))}
                placeholder="Select employee..."
                searchPlaceholder="Search employees..."
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="h-leavetype">Leave Type <span className="text-red-500">*</span></Label>
              <Select value={historicForm.leaveType} onValueChange={v => setHistoricForm(f => ({ ...f, leaveType: v }))}>
                <SelectTrigger id="h-leavetype" data-testid="select-historic-leavetype">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Annual Leave">Annual Leave</SelectItem>
                  <SelectItem value="Sick Leave">Sick Leave</SelectItem>
                  <SelectItem value="Family Responsibility">Family Responsibility</SelectItem>
                  <SelectItem value="Unpaid Leave">Unpaid Leave</SelectItem>
                  <SelectItem value="Study Leave">Study Leave</SelectItem>
                  <SelectItem value="Maternity Leave">Maternity Leave</SelectItem>
                  <SelectItem value="Paternity Leave">Paternity Leave</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start Date <span className="text-red-500">*</span></Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("w-full justify-start text-left font-normal", !historicForm.startDate && "text-muted-foreground")}
                      data-testid="input-historic-startdate"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {historicForm.startDate ? format(new Date(historicForm.startDate + 'T00:00:00'), 'dd MMM yyyy') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker
                      mode="single"
                      selected={historicForm.startDate ? new Date(historicForm.startDate + 'T00:00:00') : undefined}
                      onSelect={date => date && setHistoricForm(f => ({ ...f, startDate: format(date, 'yyyy-MM-dd') }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <Label>End Date <span className="text-red-500">*</span></Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("w-full justify-start text-left font-normal", !historicForm.endDate && "text-muted-foreground")}
                      data-testid="input-historic-enddate"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {historicForm.endDate ? format(new Date(historicForm.endDate + 'T00:00:00'), 'dd MMM yyyy') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker
                      mode="single"
                      selected={historicForm.endDate ? new Date(historicForm.endDate + 'T00:00:00') : undefined}
                      onSelect={date => date && setHistoricForm(f => ({ ...f, endDate: format(date, 'yyyy-MM-dd') }))}
                      disabled={date => historicForm.startDate ? date < new Date(historicForm.startDate + 'T00:00:00') : false}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {historicForm.startDate && historicForm.endDate && historicForm.startDate <= historicForm.endDate && (() => {
              const selEmp = (users as any[]).find(u => u.id === historicForm.userId);
              const empReligion = selEmp?.religion || null;
              const days = countWorkingDays(historicForm.startDate, historicForm.endDate, empReligion);
              return (
                <div className="text-sm text-muted-foreground bg-slate-50 px-3 py-2 rounded border">
                  Duration: <strong>{days} working day{days !== 1 ? 's' : ''}</strong>
                  <span className="ml-1 text-xs">(weekends &amp; public holidays excluded)</span>
                </div>
              );
            })()}

            <div className="space-y-1">
              <Label htmlFor="h-refnum">Reference Number</Label>
              <Input
                id="h-refnum"
                placeholder="e.g. LV-2023-045"
                value={historicForm.referenceNumber}
                onChange={e => setHistoricForm(f => ({ ...f, referenceNumber: e.target.value }))}
                data-testid="input-historic-refnum"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="h-authby">Authorized By</Label>
              <Input
                id="h-authby"
                placeholder="Name of approving manager"
                value={historicForm.authorizedBy}
                onChange={e => setHistoricForm(f => ({ ...f, authorizedBy: e.target.value }))}
                data-testid="input-historic-authorizedby"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="h-reason">Reason / Notes</Label>
              <Textarea
                id="h-reason"
                placeholder="Brief description or any notes from the leave book..."
                value={historicForm.reason}
                onChange={e => setHistoricForm(f => ({ ...f, reason: e.target.value }))}
                className="min-h-[60px]"
                data-testid="input-historic-reason"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsHistoricDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={submitHistoricForm}
              disabled={createHistoricMutation.isPending || updateHistoricMutation.isPending}
              data-testid="button-save-historic"
            >
              {(createHistoricMutation.isPending || updateHistoricMutation.isPending) ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
              ) : (
                editingHistoric ? 'Update Entry' : 'Add Entry'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
