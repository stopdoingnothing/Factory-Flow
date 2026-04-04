import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from '@/lib/auth-context';
import { leaveBalanceApi, leaveRequestApi, userApi, attendanceApi } from '@/lib/api';
import { useToast } from "@/hooks/use-toast";
import { Clock, Calendar, AlertCircle, CheckCircle2, FileText, Eye, X, XCircle, LogIn, LogOut } from 'lucide-react';
import { formatLeaveDays, groupLeaveBalances } from './utils';
import { format } from 'date-fns';
import type { LeaveRequest } from '@shared/schema';

interface Props {
  setActiveSection: (section: any) => void;
}

export default function EmployeeDashboardSection({ setActiveSection }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);

  const { data: balances = [] } = useQuery({
    queryKey: ['leave-balances', user?.id],
    queryFn: () => leaveBalanceApi.getByUserId(user!.id),
    enabled: !!user,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: requests = [] } = useQuery({
    queryKey: ['leave-requests', user?.id],
    queryFn: () => leaveRequestApi.getAll(user!.id),
    enabled: !!user,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: resolvedManager } = useQuery({
    queryKey: ['manager', user?.managerId],
    queryFn: () => user?.managerId ? userApi.getById(user.managerId) : null,
    enabled: !!user?.managerId,
  });

  const { data: clockStatus } = useQuery({
    queryKey: ['clock-status', user?.id],
    queryFn: () => attendanceApi.getStatus(user!.id),
    enabled: !!user,
    refetchInterval: 60000,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => leaveRequestApi.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
      toast({ title: "Request Cancelled", description: "Your leave request has been cancelled." });
      setIsCancelDialogOpen(false);
      setSelectedRequest(null);
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-700';
      case 'rejected': return 'bg-red-100 text-red-700';
      case 'cancelled': return 'bg-gray-100 text-gray-700';
      case 'pending_manager': return 'bg-orange-100 text-orange-700';
      case 'pending_hr': return 'bg-blue-100 text-blue-700';
      default: return 'bg-yellow-100 text-yellow-700';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <CheckCircle2 className="h-5 w-5" />;
      case 'rejected': return <AlertCircle className="h-5 w-5" />;
      case 'cancelled': return <XCircle className="h-5 w-5" />;
      default: return <Clock className="h-5 w-5" />;
    }
  };

  const formatStatusLabel = (status: string) => {
    switch (status) {
      case 'pending_manager': return 'Awaiting Manager';
      case 'pending_hr': return 'Awaiting HR';
      case 'approved': return 'Approved';
      case 'rejected': return 'Rejected';
      case 'cancelled': return 'Cancelled';
      case 'pending': return 'Pending';
      default: return status;
    }
  };

  const isPending = (status: string) =>
    ['pending', 'pending_manager', 'pending_hr'].includes(status);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-heading font-bold text-foreground">Welcome back, {user?.nickname || user?.firstName}</h1>
        <p className="text-muted-foreground mt-1">Here's an overview of your leave and attendance.</p>
      </div>

      {clockStatus && (
        <Card className={`border-2 ${clockStatus.isClockedIn ? 'border-green-500 bg-green-50' : 'border-slate-300 bg-slate-50'}`}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-full ${clockStatus.isClockedIn ? 'bg-green-500' : 'bg-slate-400'}`}>
                  {clockStatus.isClockedIn ? (
                    <LogIn className="h-6 w-6 text-white" />
                  ) : (
                    <LogOut className="h-6 w-6 text-white" />
                  )}
                </div>
                <div>
                  <p className={`text-lg font-semibold ${clockStatus.isClockedIn ? 'text-green-700' : 'text-slate-700'}`}>
                    {clockStatus.isClockedIn ? 'Currently Clocked In' : 'Not Clocked In'}
                  </p>
                  {clockStatus.lastRecord && (
                    <p className="text-sm text-muted-foreground">
                      Last {clockStatus.lastRecord.type === 'in' ? 'clock-in' : 'clock-out'}: {format(new Date(clockStatus.lastRecord.timestamp), "dd/MM/yyyy 'at' HH:mm")}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setActiveSection('my-attendance')}
                className="text-sm text-primary hover:underline"
              >
                Go to Attendance
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {(() => {
        const { standard, other } = groupLeaveBalances(balances);
        const renderCard = (balance: any) => {
          const carryOver = balance.carryOverDays as number | undefined;
          const available = Math.round(((balance.total ?? 0) - (balance.taken ?? 0) - (balance.pending ?? 0)) * 10) / 10;
          const carryOverExpiry = balance.carryOverExpiry as string | null | undefined;
          const today = new Date().toISOString().split('T')[0];
          const expiringSoon = !!carryOver && carryOver > 0 && carryOverExpiry && carryOverExpiry > today && new Date(carryOverExpiry).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000;
          return (
            <Card key={balance.id} className="relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Calendar className="h-16 w-16" />
              </div>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  {balance.leaveType}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold font-heading text-foreground">{formatLeaveDays(available)}</div>
                <p className="text-xs text-muted-foreground mb-4">days available</p>
                <Progress value={Math.min(100, (available / (balance.total ?? 1)) * 100)} className="h-2" />
                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                  <span>{formatLeaveDays(Math.round(((balance.total ?? 0) - (carryOver ?? 0)) * 10) / 10)} entitlement{!!carryOver && carryOver > 0 ? ` + ${formatLeaveDays(carryOver)} carry-over` : ''}</span>
                  <span>{formatLeaveDays(balance.taken ?? 0)} taken{(balance.pending ?? 0) > 0 ? `, ${formatLeaveDays(balance.pending)} pending` : ''}</span>
                </div>
                {!!carryOver && carryOver > 0 && carryOverExpiry && (
                  <div className={`mt-1 text-xs ${expiringSoon ? 'text-orange-600 font-medium' : 'text-blue-600'}`}>
                    {expiringSoon ? '⚠ Carry-over expires ' : 'Carry-over use by '}
                    {new Date(carryOverExpiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        };
        return (
          <div className="space-y-4">
            {standard.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Standard</p>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {standard.map(renderCard)}
                </div>
              </div>
            )}
            {other.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Other</p>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                  {other.map(renderCard)}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2 shadow-sm border-t-4 border-t-secondary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Recent Leave Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {requests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No leave requests yet. Click "Apply for Leave" to submit your first application.
                </div>
              ) : (
                requests.map((req: LeaveRequest) => (
                  <div key={req.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                        req.status === 'approved' ? 'bg-green-100 text-green-600' :
                        req.status === 'rejected' ? 'bg-red-100 text-red-600' :
                        req.status === 'cancelled' ? 'bg-gray-100 text-gray-600' :
                        'bg-yellow-100 text-yellow-600'
                      }`}>
                        {getStatusIcon(req.status)}
                      </div>
                      <div>
                        <div className="font-medium capitalize">{req.leaveType.replace('_', ' ')}</div>
                        <div className="text-sm text-muted-foreground">
                          {format(new Date(req.startDate), 'd MMM')} - {format(new Date(req.endDate), 'd MMM yyyy')}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={getStatusColor(req.status)}>
                        {formatStatusLabel(req.status)}
                      </Badge>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { setSelectedRequest(req); setIsViewDialogOpen(true); }}
                          title="View Details"
                        >
                          <Eye className="h-4 w-4 text-blue-500" />
                        </Button>
                        {isPending(req.status) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { setSelectedRequest(req); setIsCancelDialogOpen(true); }}
                            title="Cancel Request"
                          >
                            <X className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-primary text-primary-foreground shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              System Notices
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-white/10 rounded border border-white/20">
              <h4 className="font-bold text-sm mb-1">Year End Shutdown</h4>
              <p className="text-xs opacity-90">Factory will be closed from Dec 24th to Jan 2nd. Please submit leave requests early.</p>
            </div>
            <div className="p-3 bg-white/10 rounded border border-white/20">
              <h4 className="font-bold text-sm mb-1">New Policy</h4>
              <p className="text-xs opacity-90">Sick leave longer than 2 days requires a medical certificate upload.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Leave Request Details</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Leave Type</p>
                  <p className="font-medium capitalize">{selectedRequest.leaveType.replace('_', ' ')}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-muted-foreground mb-2">Approval Progress</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className={`flex flex-col px-2 py-1 rounded text-xs ${
                      selectedRequest.status === 'pending_manager'
                        ? 'bg-orange-100 text-orange-700 font-medium'
                        : ['pending_hr', 'approved'].includes(selectedRequest.status)
                          ? 'bg-green-100 text-green-700'
                          : selectedRequest.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      <span>1. Manager</span>
                      {resolvedManager && (
                        <span className="text-[10px] opacity-80">{(resolvedManager as any).firstName} {(resolvedManager as any).surname}</span>
                      )}
                    </div>
                    <span className="text-muted-foreground">→</span>
                    <div className={`px-2 py-1 rounded text-xs ${
                      selectedRequest.status === 'pending_hr'
                        ? 'bg-blue-100 text-blue-700 font-medium'
                        : selectedRequest.status === 'approved'
                          ? 'bg-green-100 text-green-700'
                          : selectedRequest.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      2. HR
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Start Date</p>
                  <p className="font-medium">{format(new Date(selectedRequest.startDate), 'd MMMM yyyy')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">End Date</p>
                  <p className="font-medium">{format(new Date(selectedRequest.endDate), 'd MMMM yyyy')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Submitted</p>
                  <p className="font-medium">{format(new Date(selectedRequest.createdAt), 'd MMM yyyy h:mm a')}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Reason</p>
                <div className="mt-1 p-3 bg-slate-50 rounded-lg border">
                  <p>{selectedRequest.reason || 'No reason provided'}</p>
                </div>
              </div>
              {selectedRequest.comments && (
                <div>
                  <p className="text-sm text-muted-foreground">Your Additional Comments</p>
                  <div className="mt-1 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-blue-800">{selectedRequest.comments}</p>
                  </div>
                </div>
              )}
              {selectedRequest.adminNotes && (
                <div>
                  <p className="text-sm text-muted-foreground">Admin Notes</p>
                  <div className="mt-1 p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-amber-800">{selectedRequest.adminNotes}</p>
                  </div>
                </div>
              )}
              {isPending(selectedRequest.status) && (
                <div className="pt-4 border-t">
                  <Button
                    variant="destructive"
                    onClick={() => { setIsViewDialogOpen(false); setIsCancelDialogOpen(true); }}
                    className="w-full"
                  >
                    <X className="mr-2 h-4 w-4" /> Cancel This Request
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              Cancel Leave Request
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this leave request? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="py-4">
              <div className="p-4 bg-slate-50 rounded-lg border">
                <p className="font-medium capitalize">{selectedRequest.leaveType.replace('_', ' ')}</p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(selectedRequest.startDate), 'd MMM')} - {format(new Date(selectedRequest.endDate), 'd MMM yyyy')}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCancelDialogOpen(false)}>Keep Request</Button>
            <Button
              variant="destructive"
              onClick={() => selectedRequest && cancelMutation.mutate(selectedRequest.id)}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? 'Cancelling...' : 'Yes, Cancel Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
