import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from '@/lib/auth-context';
import { leaveBalanceApi, leaveRequestApi, userApi, attendanceApi } from '@/lib/api';
import type { LeaveBalance, LeaveRequest } from '@shared/schema';
import { useToast } from "@/hooks/use-toast";
import { Calendar, AlertCircle, FileText, Eye, X, XCircle, LogIn, LogOut, Info } from 'lucide-react';
import { format } from 'date-fns';
import { groupLeaveBalances, formatLeaveDays } from './admin/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  
  const { data: balances = [] } = useQuery<LeaveBalance[]>({
    queryKey: ['leave-balances', user?.id],
    queryFn: () => leaveBalanceApi.getByUserId(user!.id),
    enabled: !!user,
  });

  const { data: requests = [] } = useQuery({
    queryKey: ['leave-requests', user?.id],
    queryFn: () => leaveRequestApi.getAll(user!.id),
    enabled: !!user,
  });
  
  // Fetch the user's manager details
  const { data: resolvedManager } = useQuery({
    queryKey: ['manager', user?.managerId],
    queryFn: () => user?.managerId ? userApi.getById(user.managerId) : null,
    enabled: !!user?.managerId,
  });

  // Fetch clock-in status
  const { data: clockStatus } = useQuery({
    queryKey: ['clock-status', user?.id],
    queryFn: () => attendanceApi.getStatus(user!.id),
    enabled: !!user,
    refetchInterval: 60000, // Refresh every minute
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

  const isPending = (status: string) => {
    return ['pending', 'pending_manager', 'pending_hr'].includes(status);
  };

  const { standard: standardBalances, other: otherBalances } = groupLeaveBalances(balances as LeaveBalance[]);

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground">Welcome back, {user?.nickname || user?.firstName}</h1>
          <p className="text-muted-foreground mt-1">Here's an overview of your leave and attendance.</p>
        </div>

        {/* Clock-in Status Banner */}
        {clockStatus && (
          <Card className={`border-2 ${clockStatus.isClockedIn ? 'border-green-500 bg-green-50' : 'border-slate-300 bg-slate-50'}`} data-testid="card-clock-status">
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
                    <p className={`text-lg font-semibold ${clockStatus.isClockedIn ? 'text-green-700' : 'text-slate-700'}`} data-testid="text-clock-status">
                      {clockStatus.isClockedIn ? 'Currently Clocked In' : 'Not Clocked In'}
                    </p>
                    {clockStatus.lastRecord && (
                      <p className="text-sm text-muted-foreground" data-testid="text-last-clock">
                        Last {clockStatus.lastRecord.type === 'in' ? 'clock-in' : 'clock-out'}: {format(new Date(clockStatus.lastRecord.timestamp), "dd/MM/yyyy 'at' HH:mm")}
                      </p>
                    )}
                  </div>
                </div>
                <a 
                  href="/attendance" 
                  className="text-sm text-primary hover:underline"
                  data-testid="link-go-to-attendance"
                >
                  Go to Attendance
                </a>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Balance Cards */}
        <div className="space-y-4">
          {[
            { label: 'Standard', grid: 'grid gap-6 md:grid-cols-2 lg:grid-cols-3', items: standardBalances },
            { label: 'Other',    grid: 'grid gap-6 md:grid-cols-2 lg:grid-cols-4', items: otherBalances },
          ].filter(g => g.items.length > 0).map(({ label, grid, items }) => (
            <div key={label} className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
              <div className={grid}>
                {items.map((balance) => {
                  const currentBalance = (balance.total ?? 0) - (balance.taken ?? 0);
                  const pending = balance.pending ?? 0;
                  const available = currentBalance - pending;
                  const carryOver = (balance as any).carryOverDays as number | undefined;
                  const carryOverExpiry = (balance as any).carryOverExpiry as string | null | undefined;
                  const today = new Date().toISOString().split('T')[0];
                  const expiringSoon = !!carryOver && carryOver > 0 && carryOverExpiry && carryOverExpiry > today && new Date(carryOverExpiry).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000;

                  // Split from server-computed fields: pendingApprovedDays (approved but future) vs pendingAwaitingDays (awaiting approval)
                  const approvedDaysReserved = (balance as any).pendingApprovedDays ?? 0;
                  const awaitingApproval = (balance as any).pendingAwaitingDays ?? 0;

                  return (
                    <Card key={balance.id} className="industrial-card relative overflow-hidden group">
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
                        <p className="text-xs text-muted-foreground mb-1">days available</p>
                        {pending > 0 && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p className="text-xs text-amber-600 mb-3 inline-flex items-center gap-1 cursor-default">
                                  {formatLeaveDays(currentBalance)} balance − {formatLeaveDays(pending)} reserved
                                  {approvedDaysReserved > 0 && awaitingApproval > 0 && (
                                    <span className="text-muted-foreground font-normal">
                                      {' '}({formatLeaveDays(approvedDaysReserved)} approved · {formatLeaveDays(awaitingApproval)} awaiting approval)
                                    </span>
                                  )}
                                  <Info className="h-3 w-3 opacity-60" />
                                </p>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[220px] leading-snug">
                                <p><strong>Approved:</strong> leave confirmed but dates haven't arrived yet.</p>
                                <p className="mt-1"><strong>Awaiting approval:</strong> still with manager or HR.</p>
                                <p className="mt-1">Both reduce your available balance.</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {pending === 0 && <div className="mb-3" />}
                        <Progress value={(available / (balance.total ?? 1)) * 100} className="h-2" />
                        {!!carryOver && carryOver > 0 && (
                          <div className="mt-2 text-xs text-blue-600">
                            +{carryOver} carried over
                            {carryOverExpiry && (
                              <span className={expiringSoon ? 'text-orange-600 font-medium' : 'text-muted-foreground'}>
                                {' '}· {expiringSoon ? '⚠ expires ' : 'use by '}
                                {new Date(carryOverExpiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Recent Requests */}
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
                    No leave requests yet. Click "Request Leave" to submit your first application.
                  </div>
                ) : (
                  requests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border"
                      data-testid={`leave-request-${req.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full overflow-hidden bg-slate-200 flex-shrink-0">
                          <img src={user?.photoUrl || 'https://github.com/shadcn.png'} alt="" className="h-full w-full object-cover" />
                        </div>
                        <div>
                          <p className="font-medium">{user?.firstName} {user?.surname}</p>
                          <p className="text-xs text-muted-foreground">
                            {req.leaveType.replace('_', ' ')} • {format(new Date(req.startDate), 'd MMM')} - {format(new Date(req.endDate), 'd MMM')}
                          </p>
                          <Badge className={`text-xs mt-1 ${getStatusColor(req.status)}`}>
                            {formatStatusLabel(req.status)}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedRequest(req);
                            setIsViewDialogOpen(true);
                          }}
                          title="View Details"
                          data-testid={`button-view-${req.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {isPending(req.status) && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setSelectedRequest(req);
                              setIsCancelDialogOpen(true);
                            }}
                            title="Cancel Request"
                            data-testid={`button-cancel-${req.id}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions / Notices */}
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
      </div>

      {/* View Request Dialog */}
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
                        <span className="text-[10px] opacity-80">{resolvedManager.firstName} {resolvedManager.surname}</span>
                      )}
                    </div>
                    <span className="text-muted-foreground">→</span>
                    <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
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

              {selectedRequest.documents && selectedRequest.documents.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground">Attached Documents</p>
                  <div className="mt-1 space-y-1">
                    {selectedRequest.documents.map((doc, index) => {
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
                          className="flex items-center gap-2 p-2 bg-slate-50 rounded border w-full text-left hover:bg-slate-100 transition-colors"
                        >
                          <FileText className="h-4 w-4 text-blue-500" />
                          <span className="text-sm text-blue-600 hover:underline">
                            {isPdf ? `PDF Document ${index + 1}` : isImage ? `Image ${index + 1}` : `Document ${index + 1}`}
                            <span className="text-xs text-muted-foreground ml-2">(Click to view)</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {isPending(selectedRequest.status) && (
                <div className="pt-4 border-t">
                  <Button 
                    variant="destructive"
                    onClick={() => {
                      setIsViewDialogOpen(false);
                      setIsCancelDialogOpen(true);
                    }}
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

      {/* Cancel Confirmation Dialog */}
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
            <Button variant="outline" onClick={() => setIsCancelDialogOpen(false)}>
              Keep Request
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => selectedRequest && cancelMutation.mutate(selectedRequest.id)}
              disabled={cancelMutation.isPending}
              data-testid="button-confirm-cancel"
            >
              {cancelMutation.isPending ? 'Cancelling...' : 'Yes, Cancel Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
