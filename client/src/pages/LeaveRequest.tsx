import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format, differenceInCalendarDays } from "date-fns";
import { CalendarIcon, Upload, X, CheckCircle2, FileText, UserCheck, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/lib/auth-context';
import { leaveRequestApi, userApi, leaveBalanceApi, publicHolidayApi } from '@/lib/api';
import { formatLeaveDays } from './admin/utils';
import type { LeaveBalance, PublicHoliday } from '@shared/schema';

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
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [calendarKey, setCalendarKey] = useState(0);


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

  // Fetch public holidays for working-day calculation
  const { data: publicHolidays = [] } = useQuery<PublicHoliday[]>({
    queryKey: ['public-holidays'],
    queryFn: publicHolidayApi.getAll,
  });

  // Mirror the server-side countWorkingDays: Mon–Fri only, excluding religion-matched public holidays
  const countWorkingDays = (start: Date, end: Date): number => {
    const userReligion = (user as any)?.religion ?? null;
    const recurringMmDd = new Set<string>();
    const specificYmd = new Set<string>();
    for (const h of publicHolidays as PublicHoliday[]) {
      if (h.religionGroup && h.religionGroup !== userReligion) continue;
      const d = new Date(h.date + 'T00:00:00');
      const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (h.isRecurring) { recurringMmDd.add(mmdd); } else { specificYmd.add(h.date); }
    }
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
  };

  // Build a Set of public holiday date strings (for calendar markers)
  const isPublicHoliday = (date: Date): boolean => {
    const userReligion = (user as any)?.religion ?? null;
    const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const mmdd = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return (publicHolidays as PublicHoliday[]).some(h => {
      if (h.religionGroup && h.religionGroup !== userReligion) return false;
      if (h.isRecurring) {
        const d = new Date(h.date + 'T00:00:00');
        return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === mmdd;
      }
      return h.date === ymd;
    });
  };

  // Fetch the user's manager details
  const { data: manager } = useQuery({
    queryKey: ['manager', user?.managerId],
    queryFn: () => user?.managerId ? userApi.getById(user.managerId) : null,
    enabled: !!user?.managerId,
  });

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
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
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
      setCalendarMonth(new Date());
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
                  const uniqueBalances = leaveBalances.filter(
                    (b, i, arr) => arr.findIndex(x => x.leaveType === b.leaveType) === i
                  );
                  const standardTypes = ['Annual Leave', 'Sick Leave', 'Family Responsibility'];
                  const standardBalances = standardTypes
                    .map(t => uniqueBalances.find(b => b.leaveType === t))
                    .filter(Boolean) as typeof leaveBalances;
                  const otherBalances = uniqueBalances.filter(b => !standardTypes.includes(b.leaveType));

                  const LeaveCard = ({ balance }: { balance: typeof leaveBalances[0] }) => {
                    const available = Math.max(0, balance.total - balance.taken - balance.pending);
                    const isSelected = balance.leaveType === leaveType;
                    return (
                      <Card
                        key={balance.id}
                        className={cn(
                          "cursor-pointer transition-all select-none h-[88px]",
                          isSelected
                            ? "ring-2 ring-primary border-primary bg-primary/5"
                            : "hover:border-primary/40",
                          fieldErrors.leaveType && !isSelected && "border-destructive/40"
                        )}
                        onClick={() => { setLeaveType(balance.leaveType); setFieldErrors(e => ({ ...e, leaveType: false })); }}
                      >
                        <CardContent className="px-4 py-3 h-full flex flex-col justify-between">
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground leading-tight line-clamp-1" title={balance.leaveType}>
                            {balance.leaveType}
                          </p>
                          <div>
                            <div className="text-2xl font-bold font-heading leading-none">{formatLeaveDays(available)}</div>
                            <p className="text-xs text-muted-foreground mt-0.5">days available</p>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  };

                  const unpaidIsSelected = leaveType === 'Unpaid Leave';
                  const UnpaidLeaveCard = () => (
                    <Card
                      className={cn(
                        "cursor-pointer transition-all select-none h-[88px]",
                        unpaidIsSelected
                          ? "ring-2 ring-primary border-primary bg-primary/5"
                          : "hover:border-primary/40",
                        fieldErrors.leaveType && !unpaidIsSelected && "border-destructive/40"
                      )}
                      onClick={() => { setLeaveType('Unpaid Leave'); setFieldErrors(e => ({ ...e, leaveType: false })); }}
                    >
                      <CardContent className="px-4 py-3 h-full flex flex-col justify-between">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground leading-tight line-clamp-1">
                          Unpaid Leave
                        </p>
                        <div>
                          <div className="text-2xl font-bold font-heading leading-none text-slate-400">∞</div>
                          <p className="text-xs text-muted-foreground mt-0.5">no limit · HR approval</p>
                        </div>
                      </CardContent>
                    </Card>
                  );

                  // Only show the synthetic Unpaid Leave card if it isn't already in their balances
                  const hasUnpaidBalance = uniqueBalances.some(b => b.leaveType === 'Unpaid Leave');

                  return (
                    <div className="space-y-3">
                      <Label>Leave Type <span className="text-destructive">*</span></Label>
                      {/* Standard leave types */}
                      {standardBalances.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Standard</p>
                          <div className="grid grid-cols-3 gap-3">
                            {standardBalances.map(b => <LeaveCard key={b.id} balance={b} />)}
                          </div>
                        </div>
                      )}
                      {/* Statutory / other leave types */}
                      {(otherBalances.length > 0 || !hasUnpaidBalance) && (
                        <div className="space-y-1.5">
                          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Other</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            {otherBalances.map(b => <LeaveCard key={b.id} balance={b} />)}
                            {!hasUnpaidBalance && <UnpaidLeaveCard />}
                          </div>
                        </div>
                      )}
                      {/* Unpaid Leave notice */}
                      {unpaidIsSelected && (
                        <Alert className="border-amber-200 bg-amber-50">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          <AlertDescription className="text-amber-800">
                            Unpaid leave requires <strong>HR approval</strong>. Your manager will first be asked to recommend or decline, then HR makes the final decision. Please provide <strong>7 days' notice</strong> where possible.
                          </AlertDescription>
                        </Alert>
                      )}
                      {fieldErrors.leaveType && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Please select a leave type.
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Date Picker — Inline */}
                <div className="space-y-2">
                  <Label>Duration <span className="text-destructive">*</span></Label>

                  {/* FROM / TO summary row */}
                  <div className={cn(
                    "grid grid-cols-2 divide-x rounded-md border bg-background text-sm",
                    fieldErrors.date && "border-destructive ring-1 ring-destructive"
                  )}>
                    <div className="flex flex-col items-start px-4 py-2.5">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">From</span>
                      <span className={cn("font-medium", !dateRange.from && "text-muted-foreground font-normal")}>
                        {dateRange.from ? format(dateRange.from, "EEE, dd MMM yyyy") : "Select start date"}
                      </span>
                    </div>
                    <div className="flex flex-col items-start px-4 py-2.5">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">To</span>
                      <span className={cn("font-medium", !dateRange.to && "text-muted-foreground font-normal")}>
                        {dateRange.to ? format(dateRange.to, "EEE, dd MMM yyyy") : "Select end date"}
                      </span>
                    </div>
                  </div>

                  {/* Inline calendar */}
                  <div className={cn("rounded-md border", fieldErrors.date && "border-destructive/50")}>
                    <div className="flex items-center justify-between px-3 pt-2">
                      <span className="text-xs text-muted-foreground">
                        {!dateRange.from && "Click to set start date"}
                        {dateRange.from && !dateRange.to && "Now click to set end date"}
                        {dateRange.from && dateRange.to && "Click any date to pick new dates"}
                      </span>
                      {(dateRange.from || dateRange.to) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs text-muted-foreground hover:text-destructive px-2"
                          onClick={() => { setDateRange({ from: undefined, to: undefined }); setCalendarKey(k => k + 1); setFieldErrors(err => ({ ...err, date: false })); }}
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                    <Calendar
                      key={calendarKey}
                      mode="range"
                      month={calendarMonth}
                      onMonthChange={setCalendarMonth}
                      selected={
                        dateRange.from && dateRange.to
                          ? dateRange
                          : dateRange.from
                            ? { from: dateRange.from, to: dateRange.from }
                            : undefined
                      }
                      onDayClick={(day: Date, modifiers: any) => {
                        if (modifiers.disabled) return;
                        if (!dateRange.from || (dateRange.from && dateRange.to)) {
                          // Start a fresh selection
                          setDateRange({ from: day, to: undefined });
                        } else {
                          // from is set, to is not — set end date
                          if (day < dateRange.from) {
                            // Clicked before start — restart with this date
                            setDateRange({ from: day, to: undefined });
                          } else {
                            setDateRange({ from: dateRange.from, to: day });
                          }
                        }
                        setFieldErrors((e: any) => ({ ...e, date: false }));
                      }}
                      numberOfMonths={2}
                      buttonVariant="outline"
                      className="w-full p-3 [--cell-size:2.25rem]"
                      classNames={{
                        months: "relative flex flex-col sm:flex-row gap-4",
                        month_caption: "flex h-[--cell-size] w-full items-center justify-center px-[--cell-size] font-heading tracking-wide uppercase text-sm",
                      }}
                      modifiers={{
                        publicHoliday: isPublicHoliday,
                        weekend: (date: Date) => date.getDay() === 0 || date.getDay() === 6,
                      }}
                      modifiersClassNames={{
                        publicHoliday: 'bg-orange-100 text-orange-700 font-medium',
                        weekend: 'bg-slate-100 text-slate-500',
                      }}
                    />
                  </div>

                  {/* Leave days summary — shown once both dates are selected, below the calendar */}
                  {dateRange.from && dateRange.to && (() => {
                    const workDays = countWorkingDays(dateRange.from, dateRange.to);
                    const calDays = differenceInCalendarDays(dateRange.to, dateRange.from) + 1;
                    const excluded = calDays - workDays;
                    const remaining = availableDays !== null ? availableDays - workDays : null;
                    const overLimit = remaining !== null && remaining < 0;
                    return (
                      <div className={cn(
                        "rounded-md border text-sm overflow-hidden",
                        overLimit ? "border-destructive/30" : "border-primary/20"
                      )}>
                        <div className={cn(
                          "flex items-center justify-between px-4 py-2.5",
                          overLimit ? "bg-destructive/5" : "bg-primary/5"
                        )}>
                          <div className="flex items-center gap-2">
                            <CalendarIcon className={cn("h-4 w-4", overLimit ? "text-destructive" : "text-primary")} />
                            <span className={cn("font-medium", overLimit ? "text-destructive" : "text-primary")}>
                              {workDays} leave day{workDays !== 1 ? 's' : ''} will be deducted
                            </span>
                          </div>
                          {availableDays !== null && (
                            <span className={cn("text-xs font-medium", overLimit ? "text-destructive" : "text-muted-foreground")}>
                              {overLimit
                                ? `${Math.abs(remaining!)} day${Math.abs(remaining!) !== 1 ? 's' : ''} over limit`
                                : `${remaining} day${remaining !== 1 ? 's' : ''} remaining`}
                            </span>
                          )}
                        </div>
                        {excluded > 0 && (
                          <div className="px-4 py-1.5 bg-muted/40 border-t text-xs text-muted-foreground">
                            {calDays} calendar days · {excluded} excluded (weekends{
                              (() => {
                                let holidayCount = 0;
                                const cur = new Date(dateRange.from);
                                while (cur <= dateRange.to) {
                                  if (cur.getDay() !== 0 && cur.getDay() !== 6 && isPublicHoliday(cur)) holidayCount++;
                                  cur.setDate(cur.getDate() + 1);
                                }
                                return holidayCount > 0 ? ` + ${holidayCount} public holiday${holidayCount !== 1 ? 's' : ''}` : '';
                              })()
                            })
                          </div>
                        )}
                      </div>
                    );
                  })()}

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
