import React, { useState } from 'react';
import { formatDateForDisplay, parseDateFromDisplay, isValidDateFormat } from './utils';
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
  import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Label } from "@/components/ui/label";
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
  import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
  import { Badge } from "@/components/ui/badge";
  import { Switch } from "@/components/ui/switch";
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
  import { attendanceApi, userApi, publicHolidayApi, leaveRequestApi } from '@/lib/api';
  import type { AttendanceRecord, User, PublicHoliday, LeaveRequest } from '@shared/schema';
  import { Plus, Pencil, Trash2, FileText, Clock, AlertTriangle, TrendingUp, Search, X, UserX } from 'lucide-react';
  import { format } from 'date-fns';
  import { useToast } from "@/hooks/use-toast";
  import jsPDF from 'jspdf';

  export function AttendanceSection() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    
    const today = format(new Date(), 'yyyy-MM-dd');
    const [attendanceStartDate, setAttendanceStartDate] = useState(today);
    const [attendanceEndDate, setAttendanceEndDate] = useState(today);
    // Separate display states so partial typing doesn't crash the query/rendering
    const [attendanceStartInput, setAttendanceStartInput] = useState(formatDateForDisplay(today));
    const [attendanceEndInput, setAttendanceEndInput] = useState(formatDateForDisplay(today));
    const [attendanceUserFilter, setAttendanceUserFilter] = useState('');
    const [attendanceInfringementFilter, setAttendanceInfringementFilter] = useState(false);
    const [attendanceTab, setAttendanceTab] = useState<'records' | 'manual-entry' | 'trends' | 'awol'>('records');
    const [awolStartDate, setAwolStartDate] = useState(() => {
      const d = new Date();
      d.setDate(1);
      return format(d, 'yyyy-MM-dd');
    });
    const [awolEndDate, setAwolEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
    const [awolDeptFilter, setAwolDeptFilter] = useState('');
    const [pdfDeptFilter, setPdfDeptFilter] = useState('all');

    const [manualAttendanceDate, setManualAttendanceDate] = useState<string>(() => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    });
    const [manualAttendanceEntries, setManualAttendanceEntries] = useState<Record<string, { clockIn: string; clockOut: string }>>({});

    // Attendance Edit State
    const [editingAttendance, setEditingAttendance] = useState<AttendanceRecord | null>(null);
    const [editAttendanceTime, setEditAttendanceTime] = useState('');
    const [editAttendanceDate, setEditAttendanceDate] = useState('');
    const [editAttendanceType, setEditAttendanceType] = useState<'in' | 'out'>('in');
    const [editInfringementType, setEditInfringementType] = useState<string>('none');
    const [editInfringementReason, setEditInfringementReason] = useState('');

    const { data: users = [] } = useQuery({
      queryKey: ['users'],
      queryFn: userApi.getAll,
    });

    const { data: attendanceRecords = [] } = useQuery({
      queryKey: ['attendance', attendanceStartDate, attendanceEndDate],
      queryFn: () => attendanceApi.getAll(attendanceStartDate || undefined, attendanceEndDate || undefined),
    });

    const { data: clockInCutoffSetting } = useQuery({
      queryKey: ['settings', 'clock_in_cutoff'],
      queryFn: () => (async () => {
        // In a real app we'd fetch from API, but for now we'll assume it's available in the query cache or fetch it
        // Actually we should use the same pattern as AdminDashboard
        const res = await fetch('/api/settings/clock_in_cutoff');
        if (res.status === 404) return null;
        return res.json();
      })(),
    });

    const { data: clockOutCutoffSetting } = useQuery({
      queryKey: ['settings', 'clock_out_cutoff'],
      queryFn: () => (async () => {
        const res = await fetch('/api/settings/clock_out_cutoff');
        if (res.status === 404) return null;
        return res.json();
      })(),
    });

    const clockInCutoff = clockInCutoffSetting?.value || '08:00';
    const clockOutCutoff = clockOutCutoffSetting?.value || '17:00';

    const { data: publicHolidays = [] } = useQuery({
      queryKey: ['publicHolidays'],
      queryFn: publicHolidayApi.getAll,
    });

    const { data: leaveRequests = [] } = useQuery({
      queryKey: ['leaveRequests'],
      queryFn: () => leaveRequestApi.getAll(),
    });

    const { data: awolAttendanceRecords = [] } = useQuery({
      queryKey: ['attendance', awolStartDate, awolEndDate],
      queryFn: () => attendanceApi.getAll(awolStartDate || undefined, awolEndDate || undefined),
      enabled: attendanceTab === 'awol',
    });

    const bulkAttendanceMutation = useMutation({
      mutationFn: (records: { userId: string; type: string; timestamp: string }[]) => attendanceApi.createBulk(records),
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ['attendance'] });
        setManualAttendanceEntries({});
        toast({ title: "Attendance Saved", description: `${data.length} attendance records have been saved.` });
      },
      onError: (error: any) => {
        toast({ variant: "destructive", title: "Error", description: error.message || "Failed to save attendance records" });
      },
    });

    const updateAttendanceMutation = useMutation({
      mutationFn: ({ id, data }: { id: number; data: { timestamp?: string; type?: string; isInfringement?: string | null; infringementReason?: string | null } }) => attendanceApi.update(id, data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['attendance'] });
        setEditingAttendance(null);
        toast({ title: "Attendance Updated", description: "Attendance record has been corrected." });
      },
      onError: (error: any) => {
        toast({ variant: "destructive", title: "Error", description: error.message || "Failed to update attendance record" });
      },
    });

    const deleteAttendanceMutation = useMutation({
      mutationFn: (id: number) => attendanceApi.delete(id),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['attendance'] });
        toast({ title: "Attendance Deleted", description: "Attendance record has been removed." });
      },
      onError: (error: any) => {
        toast({ variant: "destructive", title: "Error", description: error.message || "Failed to delete attendance record" });
      },
    });

    const openEditAttendance = (record: AttendanceRecord) => {
      const timestamp = new Date(record.timestamp);
      setEditingAttendance(record);
      setEditAttendanceDate(format(timestamp, 'yyyy-MM-dd'));
      setEditAttendanceTime(format(timestamp, 'HH:mm'));
      setEditAttendanceType(record.type as 'in' | 'out');
      setEditInfringementType(record.isInfringement || 'none');
      setEditInfringementReason(record.infringementReason || '');
    };

    const handleSaveAttendanceEdit = () => {
      if (!editingAttendance) return;
      const [year, month, day] = editAttendanceDate.split('-').map(Number);
      const [hours, minutes] = editAttendanceTime.split(':').map(Number);
      const newTimestamp = new Date(year, month - 1, day, hours, minutes, 0);
      updateAttendanceMutation.mutate({
        id: editingAttendance.id,
        data: {
          timestamp: newTimestamp.toISOString(),
          type: editAttendanceType,
          isInfringement: editInfringementType === 'none' ? null : editInfringementType,
          infringementReason: editInfringementType === 'none' ? null : editInfringementReason,
        },
      });
    };

    const handleSaveManualAttendance = () => {
      const records: { userId: string; type: string; timestamp: string }[] = [];
      
      Object.entries(manualAttendanceEntries).forEach(([userId, entry]) => {
        if (entry.clockIn) {
          const [hours, minutes] = entry.clockIn.split(':').map(Number);
          const [year, month, day] = manualAttendanceDate.split('-').map(Number);
          const clockInDate = new Date(year, month - 1, day, hours, minutes, 0);
          records.push({ userId, type: 'in', timestamp: clockInDate.toISOString() });
        }
        if (entry.clockOut) {
          const [hours, minutes] = entry.clockOut.split(':').map(Number);
          const [year, month, day] = manualAttendanceDate.split('-').map(Number);
          const clockOutDate = new Date(year, month - 1, day, hours, minutes, 0);
          records.push({ userId, type: 'out', timestamp: clockOutDate.toISOString() });
        }
      });

      if (records.length === 0) {
        toast({ variant: "destructive", title: "No Data", description: "Please enter at least one clock-in or clock-out time." });
        return;
      }

      bulkAttendanceMutation.mutate(records);
    };

    const updateManualEntry = (userId: string, field: 'clockIn' | 'clockOut', value: string) => {
      setManualAttendanceEntries(prev => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          [field]: value,
        },
      }));
    };

    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground">Attendance</h1>
          <p className="text-muted-foreground">View and manage employee attendance records</p>
        </div>
        
        {/* Clocked In Summary */}
        {(() => {
          const todayStr = format(new Date(), 'yyyy-MM-dd');
          const eligibleEmployees = users.filter(u => !u.exclude && !u.terminationDate && u.attendanceRequired !== false && (!(u as any).startDate || (u as any).startDate <= todayStr));
          const todayRecords = attendanceRecords.filter((r: AttendanceRecord) => 
            format(new Date(r.timestamp), 'yyyy-MM-dd') === todayStr
          );
          
          const clockedInUsers = new Set<string>();
          const clockedOutUsers = new Set<string>();
          
          todayRecords.forEach((record: AttendanceRecord) => {
            if (record.type === 'in') {
              clockedInUsers.add(record.userId);
            } else if (record.type === 'out') {
              clockedOutUsers.add(record.userId);
            }
          });
          
          const currentlyClockedIn = Array.from(clockedInUsers).filter(
            userId => !clockedOutUsers.has(userId)
          ).length;
          
          return (
            <div className="bg-status-success-muted border border-status-success/30 rounded-lg p-4 flex items-center gap-3">
              <div className="bg-status-success text-white rounded-full p-2">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg font-semibold text-status-success">
                  {currentlyClockedIn} of {eligibleEmployees.length} employees clocked in
                </p>
                <p className="text-sm text-status-success">Currently on site today</p>
              </div>
            </div>
          );
        })()}
        
        {/* Attendance Sub-tabs */}
        <div className="flex gap-2 border-b pb-2">
          <button
            onClick={() => setAttendanceTab('records')}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              attendanceTab === 'records' 
                ? 'bg-primary text-white' 
                : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
            data-testid="attendance-tab-records"
          >
            <FileText className="inline h-4 w-4 mr-2" />
            Records
          </button>
          <button
            onClick={() => setAttendanceTab('manual-entry')}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              attendanceTab === 'manual-entry' 
                ? 'bg-primary text-white' 
                : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
            data-testid="attendance-tab-manual"
          >
            <Plus className="inline h-4 w-4 mr-2" />
            Manual Entry
          </button>
          <button
            onClick={() => setAttendanceTab('trends')}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              attendanceTab === 'trends' 
                ? 'bg-primary text-white' 
                : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
            data-testid="attendance-tab-trends"
          >
            <AlertTriangle className="inline h-4 w-4 mr-2" />
            Trends
          </button>
          <button
            onClick={() => setAttendanceTab('awol')}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              attendanceTab === 'awol' 
                ? 'bg-primary text-white' 
                : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
            data-testid="attendance-tab-awol"
          >
            <UserX className="inline h-4 w-4 mr-2" />
            Absent Without Leave
          </button>
        </div>
        
        {/* Records Tab */}
        {attendanceTab === 'records' && (
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4">
                <div className="flex flex-row items-center justify-between w-full">
                  <div>
                    <CardTitle>Attendance Records</CardTitle>
                    <CardDescription>View employee clock-in/clock-out history</CardDescription>
                  </div>
                  <div className="flex gap-2 items-center flex-wrap">
                    <Input
                      type="text"
                      placeholder="dd/mm/yyyy"
                      value={attendanceStartInput}
                      onChange={(e) => {
                        setAttendanceStartInput(e.target.value);
                        if (isValidDateFormat(e.target.value)) {
                          setAttendanceStartDate(parseDateFromDisplay(e.target.value));
                        } else if (!e.target.value) {
                          setAttendanceStartDate('');
                        }
                      }}
                      onBlur={(e) => {
                        if (!isValidDateFormat(e.target.value)) {
                          setAttendanceStartInput(formatDateForDisplay(attendanceStartDate));
                        }
                      }}
                      className="w-40"
                      data-testid="input-start-date"
                    />
                    <span className="text-muted-foreground">to</span>
                    <Input
                      type="text"
                      placeholder="dd/mm/yyyy"
                      value={attendanceEndInput}
                      onChange={(e) => {
                        setAttendanceEndInput(e.target.value);
                        if (isValidDateFormat(e.target.value)) {
                          setAttendanceEndDate(parseDateFromDisplay(e.target.value));
                        } else if (!e.target.value) {
                          setAttendanceEndDate('');
                        }
                      }}
                      onBlur={(e) => {
                        if (!isValidDateFormat(e.target.value)) {
                          setAttendanceEndInput(formatDateForDisplay(attendanceEndDate));
                        }
                      }}
                      className="w-40"
                      data-testid="input-end-date"
                    />
                    <Select value={pdfDeptFilter} onValueChange={setPdfDeptFilter}>
                      <SelectTrigger className="w-44" data-testid="select-pdf-dept-filter">
                        <SelectValue placeholder="All Departments" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Departments</SelectItem>
                        {Array.from(new Set(users.filter((u: any) => u.department).map((u: any) => u.department!))).sort().map(dept => (
                          <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const clockInCutoffTime = clockInCutoff;
                        const clockOutCutoffTime = clockOutCutoff;
                        
                        const filteredRecords = attendanceRecords.filter((record: AttendanceRecord) => {
                          if (attendanceUserFilter && attendanceUserFilter !== 'all' && record.userId !== attendanceUserFilter) {
                            return false;
                          }
                          if (pdfDeptFilter && pdfDeptFilter !== 'all') {
                            const emp = users.find((u: any) => u.id === record.userId);
                            if (!emp || emp.department !== pdfDeptFilter) return false;
                          }
                          if (attendanceInfringementFilter) {
                            const recordTime = new Date(record.timestamp);
                            const timeStr = format(recordTime, 'HH:mm');
                            if (record.type === 'in') {
                              if (timeStr <= clockInCutoffTime) return false;
                            } else if (record.type === 'out') {
                              if (timeStr >= clockOutCutoffTime) return false;
                            }
                          }
                          return true;
                        });
                        
                        const eligibleEmployees = users.filter((u: any) => !u.exclude && !u.terminationDate && u.attendanceRequired !== false && (!u.startDate || u.startDate <= today) && (pdfDeptFilter === 'all' || !pdfDeptFilter || u.department === pdfDeptFilter));
                        const usersWithAttendance = new Set(filteredRecords.map((r: AttendanceRecord) => r.userId));
                        
                        type PdfConsolidated = {
                          employee: typeof users[0];
                          date: string;
                          clockInTime: string | null;
                          clockOutTime: string | null;
                          isNonAttendance: boolean;
                        };
                        
                        const pdfRecordsByUserAndDate = new Map<string, PdfConsolidated>();
                        
                        filteredRecords.forEach((record: AttendanceRecord) => {
                          const employee = users.find(u => u.id === record.userId);
                          if (!employee) return;
                          const dateStr = format(new Date(record.timestamp), 'yyyy-MM-dd');
                          const key = `${record.userId}-${dateStr}`;
                          
                          if (!pdfRecordsByUserAndDate.has(key)) {
                            pdfRecordsByUserAndDate.set(key, {
                              employee,
                              date: dateStr,
                              clockInTime: null,
                              clockOutTime: null,
                              isNonAttendance: false,
                            });
                          }
                          
                          const consolidated = pdfRecordsByUserAndDate.get(key)!;
                          const timeStr = format(new Date(record.timestamp), 'HH:mm');
                          if (record.type === 'in') {
                            if (!consolidated.clockInTime || timeStr < consolidated.clockInTime) {
                              consolidated.clockInTime = timeStr;
                            }
                          } else if (record.type === 'out') {
                            if (!consolidated.clockOutTime || timeStr > consolidated.clockOutTime) {
                              consolidated.clockOutTime = timeStr;
                            }
                          }
                        });
                        
                        const pdfTodayStr = format(new Date(), 'yyyy-MM-dd');
                        const pdfNowTime = format(new Date(), 'HH:mm');
                        const isPdfWorkDayOngoing = (dateStr: string) =>
                          dateStr === pdfTodayStr && pdfNowTime < clockOutCutoffTime;

                        eligibleEmployees.forEach(emp => {
                          if (attendanceUserFilter && attendanceUserFilter !== 'all' && emp.id !== attendanceUserFilter) {
                            return;
                          }
                          if (!usersWithAttendance.has(emp.id)) {
                            const dateStr = attendanceStartDate || pdfTodayStr;
                            const key = `${emp.id}-${dateStr}`;
                            pdfRecordsByUserAndDate.set(key, {
                              employee: emp,
                              date: dateStr,
                              clockInTime: null,
                              clockOutTime: null,
                              isNonAttendance: !isPdfWorkDayOngoing(dateStr),
                            });
                          }
                        });
                        
                        const pdfConsolidated = Array.from(pdfRecordsByUserAndDate.values()).sort((a, b) => {
                          const dateCompare = b.date.localeCompare(a.date);
                          if (dateCompare !== 0) return dateCompare;
                          return a.employee.firstName.localeCompare(b.employee.firstName);
                        });
                        
                        const pdf = new jsPDF();
                        let dateRange = 'All Records';
                        if (attendanceStartDate && attendanceEndDate) {
                          dateRange = attendanceStartDate === attendanceEndDate 
                            ? format(new Date(attendanceStartDate), 'dd/MM/yyyy')
                            : `${format(new Date(attendanceStartDate), 'dd/MM/yyyy')} - ${format(new Date(attendanceEndDate), 'dd/MM/yyyy')}`;
                        } else if (attendanceStartDate) {
                          dateRange = `From ${format(new Date(attendanceStartDate), 'dd/MM/yyyy')}`;
                        } else if (attendanceEndDate) {
                          dateRange = `Until ${format(new Date(attendanceEndDate), 'dd/MM/yyyy')}`;
                        }
                        
                        pdf.setFontSize(18);
                        pdf.text('Attendance Report', 20, 20);
                        pdf.setFontSize(12);
                        pdf.text(`Date: ${dateRange}`, 20, 30);
                        pdf.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 20, 38);
                        
                        let y = 50;
                        pdf.setFontSize(10);
                        pdf.setFont('helvetica', 'bold');
                        pdf.text('Employee', 20, y);
                        pdf.text('Date', 70, y);
                        pdf.text('Clock In', 105, y);
                        pdf.text('Clock Out', 130, y);
                        pdf.text('Status', 160, y);
                        y += 8;
                        pdf.setFont('helvetica', 'normal');
                        
                        const todayStr = format(new Date(), 'yyyy-MM-dd');
                        
                        pdfConsolidated.forEach((record) => {
                          const statuses: string[] = [];
                          const isToday = record.date === todayStr;
                          const isClockedIn = isToday && record.clockInTime && !record.clockOutTime && !record.isNonAttendance;
                          
                          if (isClockedIn) {
                            statuses.push('Clocked In');
                          }
                          
                          if (record.isNonAttendance) {
                            statuses.push('No Attendance');
                          } else {
                            if (record.clockInTime && record.clockInTime > clockInCutoffTime) {
                              statuses.push('Late Arrival');
                            }
                            if (record.clockOutTime && record.clockOutTime < clockOutCutoffTime) {
                              statuses.push('Early Departure');
                            }
                            if (!record.clockOutTime && record.clockInTime) {
                              statuses.push('No Clock Out');
                            }
                          }
                          
                          const hasIssue = statuses.filter(s => s !== 'Clocked In').length > 0;
                          if (attendanceInfringementFilter && !hasIssue) {
                            return;
                          }
                          
                          if (y > 270) {
                            pdf.addPage();
                            y = 20;
                          }
                          
                          const statusText = statuses.length > 0 ? statuses.join(', ') : 'On Time';
                          
                          pdf.text(`${record.employee.firstName} ${record.employee.surname}`, 20, y);
                          pdf.text(format(new Date(record.date), 'dd/MM/yyyy'), 70, y);
                          pdf.text(record.clockInTime || '-', 105, y);
                          pdf.text(record.clockOutTime || '-', 130, y);
                          pdf.text(statusText, 160, y);
                          y += 6;
                        });
                        
                        pdf.save(`attendance-${attendanceStartDate || format(new Date(), 'yyyy-MM-dd')}.pdf`);
                        toast({ title: "PDF Exported", description: "Attendance report has been downloaded." });
                      }}
                      data-testid="button-export-pdf"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Export PDF
                    </Button>
                    <Button
                      variant="default"
                      className="bg-status-warning hover:bg-status-warning/80 text-white"
                      onClick={() => setAttendanceTab('manual-entry')}
                      data-testid="button-add-missed-entry"
                    >
                      <Clock className="h-4 w-4 mr-2" />
                      Add Missed Entry
                    </Button>
                  </div>
                </div>
                <div className="flex gap-4 items-center flex-wrap">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm whitespace-nowrap">Filter by Employee:</Label>
                    <Select value={attendanceUserFilter} onValueChange={setAttendanceUserFilter}>
                      <SelectTrigger className="w-[200px]" data-testid="select-user-filter">
                        <SelectValue placeholder="All employees" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All employees</SelectItem>
                        {users.map(u => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.firstName} {u.surname} ({u.id})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch 
                      id="infringement-filter" 
                      checked={attendanceInfringementFilter}
                      onCheckedChange={setAttendanceInfringementFilter}
                      data-testid="switch-infringement-filter"
                    />
                    <Label htmlFor="infringement-filter" className="text-sm cursor-pointer">
                      Show infringements only
                    </Label>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setAttendanceStartDate('');
                      setAttendanceEndDate('');
                      setAttendanceStartInput('');
                      setAttendanceEndInput('');
                      setAttendanceUserFilter('');
                      setAttendanceInfringementFilter(false);
                    }}
                    data-testid="button-clear-filters"
                  >
                    Clear All Filters
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const clockInCutoffTime = clockInCutoff;
                const clockOutCutoffTime = clockOutCutoff;
                
                const filteredRecords = attendanceRecords.filter((record: AttendanceRecord) => {
                  if (attendanceUserFilter && attendanceUserFilter !== 'all' && record.userId !== attendanceUserFilter) {
                    return false;
                  }
                  
                  if (attendanceInfringementFilter) {
                    const recordTime = new Date(record.timestamp);
                    const timeStr = format(recordTime, 'HH:mm');
                    
                    if (record.type === 'in') {
                      if (timeStr <= clockInCutoffTime) return false;
                    } else if (record.type === 'out') {
                      if (timeStr >= clockOutCutoffTime) return false;
                    }
                  }
                  
                  return true;
                });
                
                const eligibleEmployees = users.filter(u => !u.exclude && !u.terminationDate && u.attendanceRequired !== false && (!(u as any).startDate || (u as any).startDate <= today));
                const usersWithAttendance = new Set(filteredRecords.map((r: AttendanceRecord) => r.userId));
                
                type ConsolidatedRecord = {
                  odId: string;
                  odIemployee: typeof users[0];
                  date: string;
                  clockInRecord: AttendanceRecord | null;
                  clockOutRecord: AttendanceRecord | null;
                  isNonAttendance: boolean;
                };
                
                const recordsByUserAndDate = new Map<string, ConsolidatedRecord>();
                
                filteredRecords.forEach((record: AttendanceRecord) => {
                  const employee = users.find(u => u.id === record.userId);
                  if (!employee) return;
                  const dateStr = format(new Date(record.timestamp), 'yyyy-MM-dd');
                  const key = `${record.userId}-${dateStr}`;
                  
                  if (!recordsByUserAndDate.has(key)) {
                    recordsByUserAndDate.set(key, {
                      odId: key,
                      odIemployee: employee,
                      date: dateStr,
                      clockInRecord: null,
                      clockOutRecord: null,
                      isNonAttendance: false,
                    });
                  }
                  
                  const consolidated = recordsByUserAndDate.get(key)!;
                  if (record.type === 'in') {
                    if (!consolidated.clockInRecord || new Date(record.timestamp) < new Date(consolidated.clockInRecord.timestamp)) {
                      consolidated.clockInRecord = record;
                    }
                  } else if (record.type === 'out') {
                    if (!consolidated.clockOutRecord || new Date(record.timestamp) > new Date(consolidated.clockOutRecord.timestamp)) {
                      consolidated.clockOutRecord = record;
                    }
                  }
                });
                
                const todayStr = format(new Date(), 'yyyy-MM-dd');
                const nowTimeStr = format(new Date(), 'HH:mm');
                // "No Attendance" is only a confirmed infringement if:
                //  - the date is in the past, OR
                //  - the date is today but working hours are over (current time >= clock-out cutoff)
                const isWorkDayStillOngoing = (dateStr: string) =>
                  dateStr === todayStr && nowTimeStr < clockOutCutoffTime;

                eligibleEmployees.forEach(emp => {
                  if (attendanceUserFilter && attendanceUserFilter !== 'all' && emp.id !== attendanceUserFilter) {
                    return;
                  }
                  if (!usersWithAttendance.has(emp.id)) {
                    const dateStr = attendanceStartDate || todayStr;
                    const key = `${emp.id}-${dateStr}`;
                    recordsByUserAndDate.set(key, {
                      odId: key,
                      odIemployee: emp,
                      date: dateStr,
                      clockInRecord: null,
                      clockOutRecord: null,
                      // Only flag as non-attendance if the work day is over
                      isNonAttendance: !isWorkDayStillOngoing(dateStr),
                    });
                  }
                });
                
                const consolidatedRecords = Array.from(recordsByUserAndDate.values()).sort((a, b) => {
                  const dateCompare = b.date.localeCompare(a.date);
                  if (dateCompare !== 0) return dateCompare;
                  return a.odIemployee.firstName.localeCompare(b.odIemployee.firstName);
                });
                
                if (consolidatedRecords.length === 0) {
                  return (
                    <div className="text-center py-8 text-muted-foreground">
                      {attendanceInfringementFilter 
                        ? "No attendance infringements found for the selected filters."
                        : "No attendance records found for the selected filters."}
                    </div>
                  );
                }
                
                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Clock In</TableHead>
                        <TableHead>Clock Out</TableHead>
                        <TableHead>Photos</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {consolidatedRecords.map((record) => {
                        const clockInTime = record.clockInRecord ? format(new Date(record.clockInRecord.timestamp), 'HH:mm') : null;
                        const clockOutTime = record.clockOutRecord ? format(new Date(record.clockOutRecord.timestamp), 'HH:mm') : null;
                        
                        const issues: string[] = [];
                        const notYetClockedIn = !record.clockInRecord && !record.isNonAttendance;
                        if (record.isNonAttendance) {
                          issues.push('No Attendance');
                        } else if (!record.clockInRecord) {
                          // Work day still ongoing — not an infringement yet, handled separately
                        } else {
                          if (clockInTime && clockInTime > clockInCutoffTime) {
                            issues.push('Late Arrival');
                          }
                          if (clockOutTime && clockOutTime < clockOutCutoffTime) {
                            issues.push('Early Departure');
                          }
                          if (!clockOutTime && record.clockInRecord) {
                            // Only flag "No Clock Out" once the work day is over
                            if (!isWorkDayStillOngoing(record.date)) {
                              issues.push('No Clock Out');
                            }
                          }
                        }
                        
                        const hasIssue = issues.length > 0;
                        
                        if (attendanceInfringementFilter && !hasIssue && !notYetClockedIn) {
                          return null;
                        }
                        if (attendanceInfringementFilter && notYetClockedIn) {
                          return null;
                        }
                        
                        return (
                          <TableRow key={record.odId}>
                            <TableCell className="font-medium">
                              {record.odIemployee.firstName} {record.odIemployee.surname}
                              <div className="text-xs text-muted-foreground">{record.odIemployee.id}</div>
                            </TableCell>
                            <TableCell>{format(new Date(record.date), 'dd MMM yyyy')}</TableCell>
                            <TableCell>
                              {clockInTime || '-'}
                              {record.clockInRecord?.isInfringement && (
                                <Badge variant="destructive" className="ml-2 text-[10px] h-4">
                                  {record.clockInRecord.isInfringement}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {clockOutTime || '-'}
                              {record.clockOutRecord?.isInfringement && (
                                <Badge variant="destructive" className="ml-2 text-[10px] h-4">
                                  {record.clockOutRecord.isInfringement}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex -space-x-2">
                                {record.clockInRecord?.photoUrl && (
                                  <img 
                                    src={record.clockInRecord.photoUrl} 
                                    alt="Clock In" 
                                    className="w-8 h-8 rounded-full border-2 border-background object-cover cursor-pointer hover:z-10 transition-all"
                                    onClick={() => window.open(record.clockInRecord!.photoUrl!, '_blank')}
                                  />
                                )}
                                {record.clockOutRecord?.photoUrl && (
                                  <img 
                                    src={record.clockOutRecord.photoUrl} 
                                    alt="Clock Out" 
                                    className="w-8 h-8 rounded-full border-2 border-background object-cover cursor-pointer hover:z-10 transition-all"
                                    onClick={() => window.open(record.clockOutRecord!.photoUrl!, '_blank')}
                                  />
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {issues.length > 0 ? (
                                  issues.map(issue => (
                                    <Badge key={issue} variant="destructive">
                                      {issue}
                                    </Badge>
                                  ))
                                ) : notYetClockedIn ? (
                                  <Badge variant="outline" className="border-status-warning text-status-warning">
                                    Not Clocked In
                                  </Badge>
                                ) : (
                                  <Badge variant="default" className="bg-status-success hover:bg-status-success/80 text-white">
                                    On Time
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                {record.clockInRecord && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => openEditAttendance(record.clockInRecord!)}
                                    data-testid={`button-edit-in-${record.odId}`}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                )}
                                {record.clockOutRecord && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => openEditAttendance(record.clockOutRecord!)}
                                    data-testid={`button-edit-out-${record.odId}`}
                                  >
                                    <Pencil className="h-4 w-4 text-status-info" />
                                  </Button>
                                )}
                                {(record.clockInRecord || record.clockOutRecord) && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => {
                                      if (confirm('Are you sure you want to delete this attendance record?')) {
                                        if (record.clockInRecord) deleteAttendanceMutation.mutate(record.clockInRecord.id);
                                        if (record.clockOutRecord) deleteAttendanceMutation.mutate(record.clockOutRecord.id);
                                      }
                                    }}
                                    data-testid={`button-delete-${record.odId}`}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                );
              })()}
            </CardContent>
          </Card>
        )}
        
        {/* Manual Entry Tab */}
        {attendanceTab === 'manual-entry' && (
          <Card>
            <CardHeader>
              <div className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Manual Attendance Entry</CardTitle>
                  <CardDescription>Batch enter clock-in and clock-out times for employees</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Label>Date:</Label>
                  <Input
                    type="text"
                    placeholder="dd/mm/yyyy"
                    value={formatDateForDisplay(manualAttendanceDate)}
                    onChange={(e) => setManualAttendanceDate(parseDateFromDisplay(e.target.value))}
                    className="w-40"
                    data-testid="input-manual-date"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Clock In (HH:mm)</TableHead>
                    <TableHead>Clock Out (HH:mm)</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.filter(u => !u.exclude && !u.terminationDate && (!(u as any).startDate || (u as any).startDate <= today)).map(u => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="font-medium">{u.firstName} {u.surname}</div>
                        <div className="text-xs text-muted-foreground">{u.id}</div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="time"
                          value={manualAttendanceEntries[u.id]?.clockIn || ''}
                          onChange={(e) => updateManualEntry(u.id, 'clockIn', e.target.value)}
                          className="w-32"
                          data-testid={`input-manual-in-${u.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="time"
                          value={manualAttendanceEntries[u.id]?.clockOut || ''}
                          onChange={(e) => updateManualEntry(u.id, 'clockOut', e.target.value)}
                          className="w-32"
                          data-testid={`input-manual-out-${u.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setManualAttendanceEntries(prev => {
                              const next = { ...prev };
                              delete next[u.id];
                              return next;
                            });
                          }}
                          data-testid={`button-clear-manual-${u.id}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-6 flex justify-end">
                <Button 
                  onClick={handleSaveManualAttendance} 
                  disabled={bulkAttendanceMutation.isPending}
                  data-testid="button-save-manual"
                >
                  {bulkAttendanceMutation.isPending && <Clock className="mr-2 h-4 w-4 animate-spin" />}
                  Save All Records
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Trends Tab */}
        {attendanceTab === 'trends' && (
          <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Infringement Overview</CardTitle>
                <CardDescription>Top types of attendance issues</CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  const clockInCutoffTime = clockInCutoff;
                  const clockOutCutoffTime = clockOutCutoff;
                  
                  const stats = {
                    late: 0,
                    early: 0,
                    noClockOut: 0,
                    noAttendance: 0,
                  };
                  
                  // Group records by user and date to find no-clock-outs and no-attendance
                  const userDates = new Map<string, { in: boolean; out: boolean }>();
                  
                  attendanceRecords.forEach(r => {
                    const dateStr = format(new Date(r.timestamp), 'yyyy-MM-dd');
                    const key = `${r.userId}-${dateStr}`;
                    if (!userDates.has(key)) userDates.set(key, { in: false, out: false });
                    const entry = userDates.get(key)!;
                    if (r.type === 'in') {
                      entry.in = true;
                      const time = format(new Date(r.timestamp), 'HH:mm');
                      if (time > clockInCutoffTime) stats.late++;
                    } else {
                      entry.out = true;
                      const time = format(new Date(r.timestamp), 'HH:mm');
                      if (time < clockOutCutoffTime) stats.early++;
                    }
                  });
                  
                  userDates.forEach(val => {
                    if (val.in && !val.out) stats.noClockOut++;
                  });
                  
                  // No attendance requires checking all eligible employees against all dates in range
                  // For simplicity, we'll just show the other counts
                  
                  const data = [
                    { label: 'Late Arrivals', value: stats.late, color: 'bg-status-warning' },
                    { label: 'Early Departures', value: stats.early, color: 'bg-status-warning/70' },
                    { label: 'Missing Clock Outs', value: stats.noClockOut, color: 'bg-destructive' },
                  ];
                  
                  return (
                    <div className="space-y-4">
                      {data.map(item => (
                        <div key={item.label} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span>{item.label}</span>
                            <span className="font-semibold">{item.value}</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div 
                              className={`${item.color} h-2 rounded-full`} 
                              style={{ width: `${Math.min(100, (item.value / Math.max(1, attendanceRecords.length)) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Attendance Rate</CardTitle>
                <CardDescription>% of expected clock-ins recorded per day (date range above)</CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  const activeReqUsers = users.filter((u: User) =>
                    !u.terminationDate && (u as any).attendanceRequired !== false &&
                    (!( u as any).startDate || (u as any).startDate <= attendanceEndDate)
                  );
                  // Build daily rate for each day in the range
                  const days: string[] = [];
                  const d = new Date(attendanceStartDate + 'T00:00:00');
                  const end = new Date(attendanceEndDate + 'T00:00:00');
                  while (d <= end && days.length < 31) {
                    const ds = format(d, 'yyyy-MM-dd');
                    if (d.getDay() !== 0 && d.getDay() !== 6) days.push(ds);
                    d.setDate(d.getDate() + 1);
                  }
                  if (days.length === 0) {
                    return <p className="text-sm text-muted-foreground">Select a date range with working days.</p>;
                  }
                  const clockedInByDay = new Map<string, Set<string>>();
                  attendanceRecords.forEach((r: AttendanceRecord) => {
                    if (r.type !== 'in') return;
                    const ds = format(new Date(r.timestamp), 'yyyy-MM-dd');
                    if (!clockedInByDay.has(ds)) clockedInByDay.set(ds, new Set());
                    clockedInByDay.get(ds)!.add(r.userId);
                  });
                  const rows = days.map(ds => {
                    const eligible = activeReqUsers.filter((u: User) => !( u as any).startDate || (u as any).startDate <= ds);
                    const actual = clockedInByDay.get(ds)?.size || 0;
                    const pct = eligible.length > 0 ? Math.round((actual / eligible.length) * 100) : 0;
                    return { ds, actual, total: eligible.length, pct };
                  });
                  return (
                    <div className="space-y-2">
                      {rows.map(({ ds, actual, total, pct }) => (
                        <div key={ds} className="flex items-center gap-2">
                          <span className="text-xs w-16 text-muted-foreground">{format(new Date(ds + 'T00:00:00'), 'dd MMM')}</span>
                          <div className="flex-1 bg-muted rounded-full h-2">
                            <div className={`h-2 rounded-full ${pct >= 90 ? 'bg-status-success' : pct >= 70 ? 'bg-status-warning' : 'bg-destructive'}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs w-20 text-right text-muted-foreground">{actual}/{total} · {pct}%</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>

          {/* Department Attendance Summary (#23) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-status-info" />
                Department Attendance Summary
              </CardTitle>
              <CardDescription>Attendance rate by department for the selected period</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const activeReqUsers = users.filter((u: User) =>
                  !u.terminationDate && (u as any).attendanceRequired !== false &&
                  (!(u as any).startDate || (u as any).startDate <= attendanceEndDate)
                );
                const depts = Array.from(new Set(activeReqUsers.map((u: User) => (u as any).department || 'No Department'))).sort() as string[];
                const days: string[] = [];
                const d = new Date(attendanceStartDate + 'T00:00:00');
                const end = new Date(attendanceEndDate + 'T00:00:00');
                while (d <= end && days.length < 100) {
                  if (d.getDay() !== 0 && d.getDay() !== 6) days.push(format(d, 'yyyy-MM-dd'));
                  d.setDate(d.getDate() + 1);
                }
                const clockedInByDayUser = new Set<string>();
                attendanceRecords.forEach((r: AttendanceRecord) => {
                  if (r.type !== 'in') return;
                  const ds = format(new Date(r.timestamp), 'yyyy-MM-dd');
                  clockedInByDayUser.add(`${r.userId}|${ds}`);
                });
                const rows = depts.map(dept => {
                  const deptUsers = activeReqUsers.filter((u: User) => ((u as any).department || 'No Department') === dept);
                  let expected = 0;
                  let actual = 0;
                  days.forEach(ds => {
                    const eligible = deptUsers.filter((u: User) => !(u as any).startDate || (u as any).startDate <= ds);
                    expected += eligible.length;
                    actual += eligible.filter((u: User) => clockedInByDayUser.has(`${u.id}|${ds}`)).length;
                  });
                  const pct = expected > 0 ? Math.round((actual / expected) * 100) : null;
                  return { dept, headcount: deptUsers.length, expected, actual, pct };
                }).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
                if (rows.length === 0) {
                  return <p className="text-sm text-muted-foreground">No data for selected period.</p>;
                }
                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Department</TableHead>
                        <TableHead className="text-right">Headcount</TableHead>
                        <TableHead className="text-right">Expected Day-Attendances</TableHead>
                        <TableHead className="text-right">Actual Clock-Ins</TableHead>
                        <TableHead className="text-right">Attendance Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map(({ dept, headcount, expected, actual, pct }) => (
                        <TableRow key={dept}>
                          <TableCell className="font-medium">{dept}</TableCell>
                          <TableCell className="text-right">{headcount}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{expected}</TableCell>
                          <TableCell className="text-right">{actual}</TableCell>
                          <TableCell className="text-right">
                            {pct === null ? (
                              <span className="text-muted-foreground text-xs">—</span>
                            ) : (
                              <span className={`font-semibold ${pct >= 90 ? 'text-status-success' : pct >= 70 ? 'text-status-warning' : 'text-destructive'}`}>
                                {pct}%
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                );
              })()}
            </CardContent>
          </Card>
          </div>
        )}

        {/* AWOL Tab */}
        {attendanceTab === 'awol' && (
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4">
                <div className="flex flex-row items-center justify-between w-full">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <UserX className="h-5 w-5 text-destructive" />
                      Absent Without Leave
                    </CardTitle>
                    <CardDescription>Working days where employees did not clock in or out, and had no approved leave</CardDescription>
                  </div>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <Input
                    type="text"
                    placeholder="dd/mm/yyyy"
                    value={formatDateForDisplay(awolStartDate)}
                    onChange={(e) => setAwolStartDate(parseDateFromDisplay(e.target.value))}
                    className="w-40"
                    data-testid="input-awol-start"
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    type="text"
                    placeholder="dd/mm/yyyy"
                    value={formatDateForDisplay(awolEndDate)}
                    onChange={(e) => setAwolEndDate(parseDateFromDisplay(e.target.value))}
                    className="w-40"
                    data-testid="input-awol-end"
                  />
                  <Select value={awolDeptFilter || 'all'} onValueChange={(v) => setAwolDeptFilter(v === 'all' ? '' : v)}>
                    <SelectTrigger className="w-40" data-testid="select-awol-dept">
                      <SelectValue placeholder="All Departments" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Departments</SelectItem>
                      {Array.from(new Set(users.filter(u => u.department).map(u => u.department!))).sort().map(dept => (
                        <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const eligibleUsers = users.filter(u => 
                  !u.terminationDate && 
                  u.attendanceRequired !== false && 
                  !u.exclude &&
                  (!(u as any).startDate || (u as any).startDate <= awolEndDate) &&
                  (!awolDeptFilter || u.department === awolDeptFilter)
                );

                const holidayDates = new Set<string>();
                publicHolidays.forEach((h: PublicHoliday) => {
                  if (h.date) {
                    const dateStr = typeof h.date === 'string' ? h.date.split('T')[0] : format(new Date(h.date), 'yyyy-MM-dd');
                    holidayDates.add(dateStr);
                  }
                });

                const approvedLeaveByUser = new Map<string, Set<string>>();
                leaveRequests
                  .filter((lr: LeaveRequest) => lr.status === 'approved' || lr.status === 'manager_approved' || lr.status === 'hr_approved')
                  .forEach((lr: LeaveRequest) => {
                    if (!lr.startDate || !lr.endDate) return;
                    const start = new Date(lr.startDate);
                    const end = new Date(lr.endDate);
                    if (!approvedLeaveByUser.has(lr.userId)) {
                      approvedLeaveByUser.set(lr.userId, new Set());
                    }
                    const dates = approvedLeaveByUser.get(lr.userId)!;
                    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                      dates.add(format(d, 'yyyy-MM-dd'));
                    }
                  });

                const attendanceDatesByUser = new Map<string, Set<string>>();
                awolAttendanceRecords.forEach((r: AttendanceRecord) => {
                  if (!attendanceDatesByUser.has(r.userId)) {
                    attendanceDatesByUser.set(r.userId, new Set());
                  }
                  const dateStr = format(new Date(r.timestamp), 'yyyy-MM-dd');
                  attendanceDatesByUser.get(r.userId)!.add(dateStr);
                });

                const workingDays: string[] = [];
                const startD = new Date(awolStartDate);
                const endD = new Date(awolEndDate);
                const todayDate = format(new Date(), 'yyyy-MM-dd');
                for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
                  const dayOfWeek = d.getDay();
                  const dateStr = format(d, 'yyyy-MM-dd');
                  if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidayDates.has(dateStr) && dateStr <= todayDate) {
                    workingDays.push(dateStr);
                  }
                }

                type AwolEntry = { user: User; date: string };
                const awolEntries: AwolEntry[] = [];

                eligibleUsers.forEach(user => {
                  const userAttendanceDates = attendanceDatesByUser.get(user.id) || new Set();
                  const userLeaveDates = approvedLeaveByUser.get(user.id) || new Set();
                  const userStartDate = user.startDate ? user.startDate.split('T')[0] : null;

                  workingDays.forEach(day => {
                    if (userStartDate && day < userStartDate) return;
                    if (!userAttendanceDates.has(day) && !userLeaveDates.has(day)) {
                      awolEntries.push({ user, date: day });
                    }
                  });
                });

                awolEntries.sort((a, b) => b.date.localeCompare(a.date) || a.user.surname.localeCompare(b.user.surname));

                const awolByUser = new Map<string, number>();
                awolEntries.forEach(e => {
                  awolByUser.set(e.user.id, (awolByUser.get(e.user.id) || 0) + 1);
                });

                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="p-4 bg-muted/50 rounded-lg border text-center">
                        <p className="text-2xl font-bold">{workingDays.length}</p>
                        <p className="text-xs text-muted-foreground">Working Days</p>
                      </div>
                      <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/30 text-center">
                        <p className="text-2xl font-bold text-destructive">{awolEntries.length}</p>
                        <p className="text-xs text-muted-foreground">Total AWOL Instances</p>
                      </div>
                      <div className="p-4 bg-status-warning-muted rounded-lg border border-status-warning/30 text-center">
                        <p className="text-2xl font-bold text-status-warning">{awolByUser.size}</p>
                        <p className="text-xs text-muted-foreground">Employees with AWOL</p>
                      </div>
                    </div>

                    {awolEntries.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <UserX className="h-12 w-12 mx-auto mb-2 opacity-20" />
                        <p>No absent without leave entries found for this period.</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Employee</TableHead>
                            <TableHead>Department</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Day</TableHead>
                            <TableHead>Total AWOL Days</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {awolEntries.slice(0, 200).map((entry, idx) => {
                            const d = new Date(entry.date);
                            const dayName = format(d, 'EEEE');
                            return (
                              <TableRow key={`${entry.user.id}-${entry.date}-${idx}`} className="bg-destructive/5">
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <div className="h-7 w-7 rounded-full overflow-hidden bg-muted">
                                      <img src={entry.user.photoUrl || 'https://github.com/shadcn.png'} alt="" className="h-full w-full object-cover" />
                                    </div>
                                    <span className="font-medium">{entry.user.firstName} {entry.user.surname}</span>
                                  </div>
                                </TableCell>
                                <TableCell>{entry.user.department || '-'}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="border-destructive/50 text-destructive">
                                    {format(d, 'dd/MM/yyyy')}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-muted-foreground">{dayName}</TableCell>
                                <TableCell>
                                  <Badge variant="destructive">{awolByUser.get(entry.user.id) || 0}</Badge>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                    {awolEntries.length > 200 && (
                      <p className="text-xs text-muted-foreground text-center">Showing first 200 of {awolEntries.length} entries. Narrow the date range for more detail.</p>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* Edit Attendance Dialog */}
        <Dialog open={!!editingAttendance} onOpenChange={(open) => !open && setEditingAttendance(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Attendance Record</DialogTitle>
              <DialogDescription>
                Correct clock-in or clock-out information
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-date" className="text-right text-sm">Date</Label>
                <Input
                  id="edit-date"
                  type="text"
                  placeholder="dd/mm/yyyy"
                  value={formatDateForDisplay(editAttendanceDate)}
                  onChange={(e) => setEditAttendanceDate(parseDateFromDisplay(e.target.value))}
                  className="col-span-3"
                  data-testid="input-edit-date"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-time" className="text-right text-sm">Time</Label>
                <Input
                  id="edit-time"
                  type="time"
                  value={editAttendanceTime}
                  onChange={(e) => setEditAttendanceTime(e.target.value)}
                  className="col-span-3"
                  data-testid="input-edit-time"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-type" className="text-right text-sm">Type</Label>
                <Select value={editAttendanceType} onValueChange={(v: 'in' | 'out') => setEditAttendanceType(v)}>
                  <SelectTrigger className="col-span-3" data-testid="select-edit-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">Clock In</SelectItem>
                    <SelectItem value="out">Clock Out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="edit-infringement" className="text-right text-sm">Infringement</Label>
                <Select value={editInfringementType} onValueChange={setEditInfringementType}>
                  <SelectTrigger className="col-span-3" data-testid="select-edit-infringement">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="late">Late Arrival</SelectItem>
                    <SelectItem value="early">Early Departure</SelectItem>
                    <SelectItem value="missing_out">Missing Clock Out</SelectItem>
                    <SelectItem value="manual">Manual Entry</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editInfringementType !== 'none' && (
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-reason" className="text-right text-sm">Reason</Label>
                  <Input
                    id="edit-reason"
                    value={editInfringementReason}
                    onChange={(e) => setEditInfringementReason(e.target.value)}
                    placeholder="Reason for infringement"
                    className="col-span-3"
                    data-testid="input-edit-reason"
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingAttendance(null)} data-testid="button-cancel-edit">
                Cancel
              </Button>
              <Button onClick={handleSaveAttendanceEdit} disabled={updateAttendanceMutation.isPending} data-testid="button-save-edit">
                {updateAttendanceMutation.isPending && <Clock className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
  