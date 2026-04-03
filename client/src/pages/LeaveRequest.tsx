import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import { CalendarIcon, Upload, X, CheckCircle2, FileText, UserCheck, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/lib/auth-context';
import { leaveRequestApi, userApi, orgPositionApi } from '@/lib/api';
import type { OrgPosition } from '@shared/schema';

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
    if (!dateRange.from || !leaveType || !reason || !user) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Please fill in all required fields.",
      });
      return;
    }

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
                
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Leave Type */}
                  <div className="space-y-2">
                    <Label htmlFor="type">Leave Type</Label>
                    <Select value={leaveType} onValueChange={setLeaveType}>
                      <SelectTrigger id="type" className="h-12">
                        <SelectValue placeholder="Select type..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Annual Leave">Annual Leave</SelectItem>
                        <SelectItem value="Sick Leave">Sick Leave</SelectItem>
                        <SelectItem value="Family Responsibility">Family Responsibility</SelectItem>
                        <SelectItem value="Maternity Leave">Maternity Leave</SelectItem>
                        <SelectItem value="Parental Leave">Parental Leave</SelectItem>
                        <SelectItem value="Adoption Leave">Adoption Leave</SelectItem>
                        <SelectItem value="Commissioning Leave">Commissioning Leave</SelectItem>
                        <SelectItem value="Unpaid Leave">Unpaid Leave</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Date Picker */}
                  <div className="space-y-2">
                    <Label>Duration</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          id="date"
                          variant={"outline"}
                          className={cn(
                            "w-full justify-start text-left font-normal h-12",
                            !dateRange.from && "text-muted-foreground"
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
                          onSelect={(range: any) => setDateRange(range)}
                          numberOfMonths={2}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Reason */}
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason for Leave</Label>
                  <Textarea 
                    id="reason" 
                    placeholder="Please provide details..." 
                    className="min-h-[100px]"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    data-testid="input-reason"
                  />
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
