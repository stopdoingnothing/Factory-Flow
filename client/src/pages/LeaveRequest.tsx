import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import { CalendarIcon, Upload, X, CheckCircle2, FileText, UserCheck, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/lib/auth-context';
import { leaveRequestApi, userApi, orgPositionApi, leaveBalanceApi } from '@/lib/api';
import { formatLeaveDays } from './admin/utils';
import type { OrgPosition, LeaveBalance } from '@shared/schema';

export function LeaveRequest() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [leaveType, setLeaveType] = useState('');
  const [reason, setReason] = useState('');
  const [comments, setComments] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileContents, setFileContents] = useState<{name: string; data: string}[]>([]);
  const [fieldErrors, setFieldErrors] = useState<{ leaveType?: boolean; date?: boolean; reason?: boolean }>({});
  
  // Fetch org positions and all users to resolve position-based reporting
  const { data: orgPositions = [] } = useQuery<OrgPosition[]>({
    queryKey: ['orgPositions'],
    queryFn: orgPositionApi.getAll,
    enabled: !!(user?.reportsToPositionId),
  });
  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: userApi.getAll,
    enabled: !!(user?.reportsToPositionId),
  });

  // Fetch the user's leave balances
  const { data: leaveBalances = [] } = useQuery<LeaveBalance[]>({
    queryKey: ['leave-balances', user?.id],
    queryFn: () => leaveBalanceApi.getByUserId(user!.id),
    enabled: !!user?.id,
  });

  const selectedBalance = leaveBalances.find(b => b.leaveType === leaveType);
  const availableDays = selectedBalance
    ? Math.max(0, selectedBalance.total - selectedBalance.taken - selectedBalance.pending)
    : null;

  // Fetch the user's manager details (legacy managerId path)
  const { data: legacyManager } = useQuery({
    queryKey: ['manager', user?.managerId],
    queryFn: () => user?.managerId ? userApi.getById(user.managerId) : null,
    enabled: !!user?.managerId && !user?.reportsToPositionId,
  });

  // Resolve reporting: position-based (preferred) or legacy direct manager
  const reportingPositionTitle = user?.reportsToPositionId
    ? orgPositions.find(p => p.id === user.reportsToPositionId)?.title
    : null;
  const manager = user?.reportsToPositionId
    ? allUsers.find(u => u.orgPositionId === user.reportsToPositionId)
    : legacyManager;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
      const invalidFiles = newFiles.filter(f => !validTypes.includes(f.type));
      
      if (invalidFiles.length > 0) {
        toast({
          variant: "destructive",
          title: "Invalid File Type",
          description: "Please upload only JPEG, PNG, or PDF files.",
        });
        return;
      }
      
      const filePromises = newFiles.map(file => {
        return new Promise<{name: string; data: string}>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              name: file.name,
              data: reader.result as string
            });
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });
      
      try {
        const newFileContents = await Promise.all(filePromises);
        setFiles([...files, ...newFiles]);
        setFileContents([...fileContents, ...newFileContents]);
      } catch (error) {
        toast({
          variant: "destructive",
          title: "File Read Error",
          description: "Could not read one or more files. Please try again.",
        });
      }
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
    setFileContents(fileContents.filter((_, i) => i !== index));
  };

  const createRequestMutation = useMutation({
    mutationFn: leaveRequestApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      toast({
        title: "Application Submitted",
        description: "Your leave request has been sent for approval.",
      });
      // Reset form
      setLeaveType('');
      setReason('');
      setComments('');
      setFiles([]);
      setFileContents([]);
      setDateRange({ from: undefined, to: undefined });
      setFieldErrors({});
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Submission Failed",
        description: error.message || "Could not submit leave request. Please try again.",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors = {
      leaveType: !leaveType,
      date: !dateRange.from,
      reason: !reason.trim(),
    };
    if (errors.leaveType || errors.date || errors.reason) {
      setFieldErrors(errors);
      const missing: string[] = [];
      if (errors.leaveType) missing.push('Leave Type');
      if (errors.date) missing.push('Duration');
      if (errors.reason) missing.push('Reason for Leave');
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: `Please complete the following required fields: ${missing.join(', ')}.`,
      });
      return;
    }
    setFieldErrors({});

    createRequestMutation.mutate({
      userId: user.id,
      leaveType,
      startDate: format(dateRange.from, 'yyyy-MM-dd'),
      endDate: dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : format(dateRange.from, 'yyyy-MM-dd'),
      reason,
      comments: comments || undefined,
      status: (user.reportsToPositionId || user.managerId) ? 'pending_manager' : 'pending_hr',
      documents: fileContents.map(f => f.data),
    });
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-heading font-bold">Request Leave</h1>
        <p className="text-muted-foreground">Submit a new application for time off.</p>
      </div>

        <div className="grid gap-8 md:grid-cols-[2fr_1fr]">
          <Card className="md:col-span-2 shadow-md border-t-4 border-t-primary">
            <CardHeader>
              <CardTitle>Application Form</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Manager/position notification */}
              {(user?.reportsToPositionId || user?.managerId) ? (
                <Alert className="mb-6 border-blue-200 bg-blue-50">
                  <UserCheck className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800">
                    {manager ? (
                      <>Your leave request will be reviewed by <strong>{manager.firstName} {manager.surname}</strong>. They will be notified when you submit this request.</>
                    ) : (
                      <>Your leave request will be sent to your manager for review.</>
                    )}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert className="mb-6 border-amber-200 bg-amber-50">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800">
                    No reporting position assigned. Your leave request will go directly to HR for review.
                  </AlertDescription>
                </Alert>
              )}
              
              <form onSubmit={handleSubmit} className="space-y-6">

                {/* Leave Type Card Selector */}
                {leaveBalances.length > 0 && (() => {
                  const primaryTypes = ['Annual Leave', 'Sick Leave'];
                  const primaryBalances = primaryTypes
                    .map(t => leaveBalances.find(b => b.leaveType === t))
                    .filter(Boolean) as typeof leaveBalances;
                  const otherBalances = leaveBalances.filter(b => !primaryTypes.includes(b.leaveType));

                  const LeaveCard = ({ balance }: { balance: typeof leaveBalances[0] }) => {
                    const available = Math.max(0, balance.total - balance.taken - balance.pending);
                    const isSelected = balance.leaveType === leaveType;
                    return (
                      <Card
                        key={balance.id}
                        className={cn(
                          "cursor-pointer transition-all select-none",
                          isSelected
                            ? "ring-2 ring-primary border-primary bg-primary/5"
                            : "hover:border-primary/40",
                          fieldErrors.leaveType && !isSelected && "border-destructive/40"
                        )}
                        onClick={() => { setLeaveType(balance.leaveType); setFieldErrors(e => ({ ...e, leaveType: false })); }}
                      >
                        <CardContent className="px-4 py-3">
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground leading-tight mb-1">
                            {balance.leaveType}
                          </p>
                          <div className="text-2xl font-bold font-heading">{formatLeaveDays(available)}</div>
                          <p className="text-xs text-muted-foreground">days available</p>
                        </CardContent>
                      </Card>
                    );
                  };

                  return (
                    <div className="space-y-2">
                      <Label>Leave Type <span className="text-destructive">*</span></Label>
                      <div className="grid grid-cols-2 gap-3">
                        {primaryBalances.map(b => <LeaveCard key={b.id} balance={b} />)}
                      </div>
                      {otherBalances.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                          {otherBalances.map(b => <LeaveCard key={b.id} balance={b} />)}
                        </div>
                      )}
                      {fieldErrors.leaveType && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Please select a leave type.
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Date Picker */}
                <div className="space-y-2">
                    <Label>Duration <span className="text-destructive">*</span></Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          id="date"
                          variant={"outline"}
                          className={cn(
                            "w-full justify-start text-left font-normal h-12",
                            !dateRange.from && "text-muted-foreground",
                            fieldErrors.date && "border-destructive ring-1 ring-destructive"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateRange.from ? (
                            dateRange.to ? (
                              <>
                                {format(dateRange.from, "dd LLL y")} -{" "}
                                {format(dateRange.to, "dd LLL y")}
                              </>
                            ) : (
                              format(dateRange.from, "dd LLL y")
                            )
                          ) : (
                            <span>Pick dates</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          initialFocus
                          mode="range"
                          defaultMonth={dateRange.from}
                          selected={dateRange}
                          onSelect={(range: any) => { setDateRange(range); if (range?.from) setFieldErrors(e => ({ ...e, date: false })); }}
                          numberOfMonths={2}
                        />
                      </PopoverContent>
                    </Popover>
                    {fieldErrors.date && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Please select a date range.
                      </p>
                    )}
                </div>

                {/* Reason */}
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason for Leave <span className="text-destructive">*</span></Label>
                  <Textarea
                    id="reason"
                    placeholder="Please provide details..."
                    className={cn("min-h-[100px]", fieldErrors.reason && "border-destructive ring-1 ring-destructive")}
                    value={reason}
                    onChange={(e) => { setReason(e.target.value); if (e.target.value.trim()) setFieldErrors(err => ({ ...err, reason: false })); }}
                    data-testid="input-reason"
                  />
                  {fieldErrors.reason && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Please provide a reason for your leave.
                    </p>
                  )}
                </div>

                {/* Additional Comments */}
                <div className="space-y-2">
                  <Label htmlFor="comments">Additional Comments (Optional)</Label>
                  <Textarea 
                    id="comments" 
                    placeholder="Any additional information or special circumstances..." 
                    className="min-h-[80px]"
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    data-testid="input-comments"
                  />
                </div>

                {/* File Upload */}
                <div className="space-y-2">
                  <Label>Supporting Documentation</Label>
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:bg-muted/50 transition-colors">
                    <input 
                      type="file" 
                      id="file-upload" 
                      className="hidden" 
                      multiple 
                      onChange={handleFileChange}
                    />
                    <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-2">
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm font-medium text-primary">Click to upload files</span>
                      <span className="text-xs text-muted-foreground">Medical certificates, letters, etc. (PDF, JPG)</span>
                    </label>
                  </div>
                  
                  {/* File List */}
                  {files.length > 0 && (
                    <div className="space-y-2 mt-4">
                      <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{files.length} document{files.length > 1 ? 's' : ''} uploaded</span>
                      </div>
                      {files.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg text-sm" data-testid={`uploaded-file-${index}`}>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-green-600" />
                            <span className="truncate max-w-[250px] font-medium">{file.name}</span>
                          </div>
                          <Button 
                            type="button"
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => removeFile(index)}
                            data-testid={`button-remove-file-${index}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-4">
                  <Button type="submit" className="w-full h-12 btn-industrial text-lg">
                    Submit Application
                  </Button>
                </div>

              </form>
            </CardContent>
          </Card>
      </div>

    </div>
  );
}

// Standalone page (used at /leave-request route)
export default function LeaveRequestPage() {
  return (
    <Layout>
      <LeaveRequest />
    </Layout>
  );
}
