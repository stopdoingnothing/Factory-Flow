import { useState, useMemo } from 'react';
import { formatDateForDisplay, parseDateFromDisplay, isValidDateFormat } from './admin/utils';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from '@/components/ui/searchable-select';
import { attendanceApi, userApi, departmentApi, settingsApi, publicHolidayApi } from '@/lib/api';
import type { User, AttendanceRecord, Department, PublicHoliday } from '@shared/schema';
import {
  Download, Clock, AlertTriangle, TrendingUp,
  Users, Calendar, Search, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, BarChart3, Filter, Star, Sun
} from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, eachDayOfInterval, isWeekend, differenceInMinutes, parseISO } from 'date-fns';
import jsPDF from 'jspdf';

type ReportPeriod = 'weekly' | 'monthly' | 'yearly' | 'custom';

interface EmployeeAttendanceSummary {
  userId: string;
  name: string;
  department: string;
  totalDaysWorked: number;
  totalWorkingDays: number;
  attendanceRate: number;
  lateArrivals: number;
  earlyDepartures: number;
  totalInfringements: number;
  avgClockInTime: string;
  avgClockOutTime: string;
  missedDays: number;
  totalHoursWorked: number;
  anomalies: Anomaly[];
  dailyRecords: DailyRecord[];
}

interface DailyRecord {
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  hoursWorked: number;
  isLate: boolean;
  isEarlyDeparture: boolean;
  infringementReason: string | null;
  isHoliday?: boolean;
  holidayName?: string;
  isFirstDay?: boolean;
}

interface Anomaly {
  type: 'frequent_late' | 'frequent_early' | 'low_attendance' | 'short_hours' | 'pattern_late_day' | 'no_clockout';
  severity: 'warning' | 'critical';
  description: string;
}

function getDateRange(period: ReportPeriod, customStart: string, customEnd: string): { start: Date; end: Date } {
  const now = new Date();
  switch (period) {
    case 'weekly':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'monthly':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'yearly':
      return { start: startOfYear(now), end: endOfYear(now) };
    case 'custom': {
      const s = customStart ? new Date(customStart) : startOfMonth(now);
      const e = customEnd ? new Date(customEnd) : endOfMonth(now);
      return { start: s <= e ? s : e, end: s <= e ? e : s };
    }
  }
}

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTimeStr(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function detectAnomalies(
  summary: Omit<EmployeeAttendanceSummary, 'anomalies'>,
  clockInCutoff: string,
  clockOutCutoff: string
): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const totalDays = summary.totalWorkingDays || 1;

  if (summary.lateArrivals / totalDays >= 0.3 && summary.lateArrivals >= 3) {
    anomalies.push({
      type: 'frequent_late',
      severity: summary.lateArrivals / totalDays >= 0.5 ? 'critical' : 'warning',
      description: `Late ${summary.lateArrivals} out of ${summary.totalWorkingDays} working days (${Math.round(summary.lateArrivals / totalDays * 100)}%)`,
    });
  }

  if (summary.earlyDepartures / totalDays >= 0.3 && summary.earlyDepartures >= 3) {
    anomalies.push({
      type: 'frequent_early',
      severity: summary.earlyDepartures / totalDays >= 0.5 ? 'critical' : 'warning',
      description: `Early departure ${summary.earlyDepartures} out of ${summary.totalWorkingDays} working days (${Math.round(summary.earlyDepartures / totalDays * 100)}%)`,
    });
  }

  if (summary.attendanceRate < 80 && totalDays >= 5) {
    anomalies.push({
      type: 'low_attendance',
      severity: summary.attendanceRate < 60 ? 'critical' : 'warning',
      description: `Attendance rate ${summary.attendanceRate.toFixed(0)}% (${summary.missedDays} days missed)`,
    });
  }

  const expectedHoursPerDay = (timeToMinutes(clockOutCutoff) - timeToMinutes(clockInCutoff)) / 60;
  if (summary.totalDaysWorked > 0) {
    const avgHours = summary.totalHoursWorked / summary.totalDaysWorked;
    if (avgHours < expectedHoursPerDay * 0.75 && summary.totalDaysWorked >= 3) {
      anomalies.push({
        type: 'short_hours',
        severity: avgHours < expectedHoursPerDay * 0.5 ? 'critical' : 'warning',
        description: `Average ${avgHours.toFixed(1)} hours/day (expected ~${expectedHoursPerDay.toFixed(1)} hours)`,
      });
    }
  }

  const dayLateCounts: Record<string, number> = {};
  summary.dailyRecords.forEach(r => {
    if (r.isLate) {
      const dayName = format(new Date(r.date), 'EEEE');
      dayLateCounts[dayName] = (dayLateCounts[dayName] || 0) + 1;
    }
  });
  Object.entries(dayLateCounts).forEach(([day, count]) => {
    if (count >= 3) {
      anomalies.push({
        type: 'pattern_late_day',
        severity: 'warning',
        description: `Frequently late on ${day}s (${count} times)`,
      });
    }
  });

  const noClockOutDays = summary.dailyRecords.filter(r => r.clockIn && !r.clockOut).length;
  if (noClockOutDays >= 3) {
    anomalies.push({
      type: 'no_clockout',
      severity: 'warning',
      description: `Missing clock-out on ${noClockOutDays} days`,
    });
  }

  return anomalies;
}

export default function AttendanceReports() {
  const [period, setPeriod] = useState<ReportPeriod>('weekly');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [customStartInput, setCustomStartInput] = useState('');
  const [customEndInput, setCustomEndInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'attendance' | 'infringements' | 'hours'>('name');

  const { start, end } = getDateRange(period, customStart, customEnd);

  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: userApi.getAll });
  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: departmentApi.getAll });
  const { data: clockInSetting } = useQuery({
    queryKey: ['settings', 'clock_in_cutoff'],
    queryFn: () => settingsApi.get('clock_in_cutoff'),
  });
  const { data: clockOutSetting } = useQuery({
    queryKey: ['settings', 'clock_out_cutoff'],
    queryFn: () => settingsApi.get('clock_out_cutoff'),
  });

  const clockInCutoff = clockInSetting?.value || '07:30';
  const clockOutCutoff = clockOutSetting?.value || '16:00';

  const { data: attendanceRecords = [], isLoading } = useQuery({
    queryKey: ['attendance-report', start.toISOString(), end.toISOString()],
    queryFn: () => attendanceApi.getAll(start.toISOString().split('T')[0], end.toISOString().split('T')[0]),
  });

  const { data: allPublicHolidays = [] } = useQuery({
    queryKey: ['public-holidays'],
    queryFn: publicHolidayApi.getAll,
  });

  const holidaysInRange = useMemo(() => {
    return allPublicHolidays.filter(h => {
      const hDate = h.date;
      const startStr = format(start, 'yyyy-MM-dd');
      const endStr = format(end, 'yyyy-MM-dd');
      return hDate >= startStr && hDate <= endStr;
    });
  }, [allPublicHolidays, start, end]);

  // Global holiday set (for calendar display and non-per-user purposes)
  const holidayDateSet = useMemo(() => {
    return new Set(holidaysInRange.map(h => h.date));
  }, [holidaysInRange]);

  // Per-user holiday set: filters out religious holidays that don't apply to the user's religion
  const getHolidayDateSetForUser = (userReligion: string | null | undefined): Set<string> => {
    const applicable = holidaysInRange.filter(h =>
      !h.religionGroup || h.religionGroup === (userReligion || '')
    );
    return new Set(applicable.map(h => h.date));
  };

  const activeUsers = useMemo(() => {
    return users.filter(u => !u.terminationDate && !u.exclude && u.attendanceRequired !== false && (u.role === 'worker' || u.role === 'manager'));
  }, [users]);

  const summaries = useMemo(() => {
    if (!activeUsers.length) return [];

    const now = new Date();

    const recordsByUser = new Map<string, AttendanceRecord[]>();
    attendanceRecords.forEach(record => {
      const existing = recordsByUser.get(record.userId) || [];
      existing.push(record);
      recordsByUser.set(record.userId, existing);
    });

    const results: (EmployeeAttendanceSummary | null)[] = activeUsers.map(user => {
      // Effective start: the later of the report period start and the employee's own start date.
      // This ensures days before the employee joined are never counted as absences.
      const userStartDate = user.startDate ? parseISO(user.startDate) : start;
      const effectiveStart = userStartDate > start ? userStartDate : start;

      // Use per-user holiday set that respects their religion
      const userHolidaySet = getHolidayDateSetForUser((user as any).religion);

      // Working days for this specific employee (from their effective start)
      // If the employee hasn't started yet within this period, return empty summary
      if (effectiveStart > end) return null;
      const userWorkingDays = eachDayOfInterval({ start: effectiveStart, end }).filter(d => {
        const dateKey = format(d, 'yyyy-MM-dd');
        return !isWeekend(d) && d <= now && !userHolidaySet.has(dateKey);
      });
      const userTotalWorkingDays = userWorkingDays.length;

      // The first working day for this employee in the period (used to suppress the late penalty)
      const firstWorkingDayKey = userWorkingDays.length > 0 ? format(userWorkingDays[0], 'yyyy-MM-dd') : null;

      const userRecords = recordsByUser.get(user.id) || [];
      const sortedRecords = [...userRecords].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const dailyMap = new Map<string, { clockIns: Date[]; clockOuts: Date[]; infringementReasons: string[] }>();

      sortedRecords.forEach(record => {
        const dateKey = format(new Date(record.timestamp), 'yyyy-MM-dd');
        if (!dailyMap.has(dateKey)) {
          dailyMap.set(dateKey, { clockIns: [], clockOuts: [], infringementReasons: [] });
        }
        const day = dailyMap.get(dateKey)!;
        if (record.type === 'in') {
          day.clockIns.push(new Date(record.timestamp));
        } else {
          day.clockOuts.push(new Date(record.timestamp));
        }
        if (record.infringementReason) {
          day.infringementReasons.push(record.infringementReason);
        }
      });

      let lateArrivals = 0;
      let earlyDepartures = 0;
      let totalHoursWorked = 0;
      const clockInMinutesArr: number[] = [];
      const clockOutMinutesArr: number[] = [];
      const dailyRecords: DailyRecord[] = [];

      userWorkingDays.forEach(day => {
        const dateKey = format(day, 'yyyy-MM-dd');
        // The first day in the period is the employee's registration/start day — never penalize for late
        const isFirstDay = dateKey === firstWorkingDayKey;
        const dayData = dailyMap.get(dateKey);

        if (!dayData || dayData.clockIns.length === 0) {
          dailyRecords.push({
            date: dateKey,
            clockIn: null,
            clockOut: null,
            hoursWorked: 0,
            isLate: false,
            isEarlyDeparture: false,
            infringementReason: null,
            isFirstDay,
          });
          return;
        }

        const firstClockIn = dayData.clockIns[0];
        const lastClockOut = dayData.clockOuts.length > 0 ? dayData.clockOuts[dayData.clockOuts.length - 1] : null;

        const clockInTime = format(firstClockIn, 'HH:mm');
        const clockOutTime = lastClockOut ? format(lastClockOut, 'HH:mm') : null;

        // On the first day the employee appears in the system, don't flag as late —
        // they were being registered/captured, not starting a normal work day.
        const isLate = !isFirstDay && clockInTime > clockInCutoff;
        const isEarly = !isFirstDay && (clockOutTime ? clockOutTime < clockOutCutoff : false);

        if (isLate) lateArrivals++;
        if (isEarly) earlyDepartures++;

        const hoursWorked = lastClockOut ? differenceInMinutes(lastClockOut, firstClockIn) / 60 : 0;
        totalHoursWorked += hoursWorked;

        clockInMinutesArr.push(timeToMinutes(clockInTime));
        if (clockOutTime) clockOutMinutesArr.push(timeToMinutes(clockOutTime));

        dailyRecords.push({
          date: dateKey,
          clockIn: clockInTime,
          clockOut: clockOutTime,
          hoursWorked,
          isLate,
          isEarlyDeparture: isEarly,
          infringementReason: dayData.infringementReasons.length > 0 ? dayData.infringementReasons.join('; ') : null,
          isFirstDay,
        });
      });

      // Add public holidays applicable to this employee (filtered by their religion)
      eachDayOfInterval({ start: effectiveStart, end }).filter(d => !isWeekend(d) && d <= now).forEach(day => {
        const dateKey = format(day, 'yyyy-MM-dd');
        if (userHolidaySet.has(dateKey)) {
          const holiday = holidaysInRange.find(h => h.date === dateKey && (!h.religionGroup || h.religionGroup === (user as any).religion));
          dailyRecords.push({
            date: dateKey,
            clockIn: null,
            clockOut: null,
            hoursWorked: 0,
            isLate: false,
            isEarlyDeparture: false,
            infringementReason: null,
            isHoliday: true,
            holidayName: holiday?.name || 'Public Holiday',
          });
        }
      });

      dailyRecords.sort((a, b) => a.date.localeCompare(b.date));

      const totalDaysWorked = dailyRecords.filter(r => r.clockIn !== null && !r.isHoliday).length;
      const missedDays = userTotalWorkingDays - totalDaysWorked;
      const attendanceRate = userTotalWorkingDays > 0 ? (totalDaysWorked / userTotalWorkingDays) * 100 : 0;

      const avgClockIn = clockInMinutesArr.length > 0
        ? minutesToTimeStr(clockInMinutesArr.reduce((a, b) => a + b, 0) / clockInMinutesArr.length)
        : '--:--';
      const avgClockOut = clockOutMinutesArr.length > 0
        ? minutesToTimeStr(clockOutMinutesArr.reduce((a, b) => a + b, 0) / clockOutMinutesArr.length)
        : '--:--';

      const partialSummary = {
        userId: user.id,
        name: `${user.firstName} ${user.surname}`,
        department: user.department || 'Unassigned',
        totalDaysWorked,
        totalWorkingDays: userTotalWorkingDays,
        attendanceRate,
        lateArrivals,
        earlyDepartures,
        totalInfringements: lateArrivals + earlyDepartures,
        avgClockInTime: avgClockIn,
        avgClockOutTime: avgClockOut,
        missedDays,
        totalHoursWorked,
        dailyRecords,
      };

      return {
        ...partialSummary,
        anomalies: detectAnomalies(partialSummary, clockInCutoff, clockOutCutoff),
      };
    });

    return results.filter((r): r is EmployeeAttendanceSummary => r !== null);
  }, [activeUsers, attendanceRecords, start, end, clockInCutoff, clockOutCutoff, holidayDateSet, holidaysInRange]);

  const filteredSummaries = useMemo(() => {
    let result = summaries;

    if (selectedDepartment !== 'all') {
      result = result.filter(s => s.department === selectedDepartment);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.userId.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case 'attendance': return a.attendanceRate - b.attendanceRate;
        case 'infringements': return b.totalInfringements - a.totalInfringements;
        case 'hours': return a.totalHoursWorked - b.totalHoursWorked;
        default: return a.name.localeCompare(b.name);
      }
    });

    return result;
  }, [summaries, selectedDepartment, searchQuery, sortBy]);

  const overallStats = useMemo(() => {
    if (!filteredSummaries.length) return null;
    const total = filteredSummaries.length;
    const avgAttendance = filteredSummaries.reduce((s, e) => s + e.attendanceRate, 0) / total;
    const totalLate = filteredSummaries.reduce((s, e) => s + e.lateArrivals, 0);
    const totalEarly = filteredSummaries.reduce((s, e) => s + e.earlyDepartures, 0);
    const employeesWithAnomalies = filteredSummaries.filter(e => e.anomalies.length > 0).length;
    const totalHours = filteredSummaries.reduce((s, e) => s + e.totalHoursWorked, 0);
    return { total, avgAttendance, totalLate, totalEarly, employeesWithAnomalies, totalHours };
  }, [filteredSummaries]);

  const departmentAbsenteeism = useMemo(() => {
    const map: Record<string, { dept: string; employees: number; totalDaysWorked: number; totalWorkingDays: number; totalLate: number; totalEarly: number; totalHours: number; withAnomalies: number }> = {};
    for (const s of filteredSummaries) {
      const dept = s.department || 'Unassigned';
      if (!map[dept]) map[dept] = { dept, employees: 0, totalDaysWorked: 0, totalWorkingDays: 0, totalLate: 0, totalEarly: 0, totalHours: 0, withAnomalies: 0 };
      map[dept].employees++;
      map[dept].totalDaysWorked += s.totalDaysWorked;
      map[dept].totalWorkingDays += s.totalWorkingDays;
      map[dept].totalLate += s.lateArrivals;
      map[dept].totalEarly += s.earlyDepartures;
      map[dept].totalHours += s.totalHoursWorked;
      if (s.anomalies.length > 0) map[dept].withAnomalies++;
    }
    return Object.values(map).sort((a, b) => {
      const rateA = a.totalWorkingDays > 0 ? a.totalDaysWorked / a.totalWorkingDays : 1;
      const rateB = b.totalWorkingDays > 0 ? b.totalDaysWorked / b.totalWorkingDays : 1;
      return rateA - rateB;
    });
  }, [filteredSummaries]);

  const exportPdf = () => {
    const pdf = new jsPDF('landscape');
    const periodLabel = period === 'custom'
      ? `${customStart} to ${customEnd}`
      : period.charAt(0).toUpperCase() + period.slice(1);

    pdf.setFontSize(18);
    pdf.text(`Attendance Report - ${periodLabel}`, 14, 20);
    pdf.setFontSize(10);
    pdf.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 28);
    pdf.text(`Period: ${format(start, 'dd/MM/yyyy')} - ${format(end, 'dd/MM/yyyy')}`, 14, 34);

    if (overallStats) {
      pdf.setFontSize(12);
      pdf.text('Summary', 14, 44);
      pdf.setFontSize(9);
      pdf.text(`Employees: ${overallStats.total}  |  Avg Attendance: ${overallStats.avgAttendance.toFixed(1)}%  |  Total Late: ${overallStats.totalLate}  |  Total Early Departures: ${overallStats.totalEarly}  |  Anomalies: ${overallStats.employeesWithAnomalies}`, 14, 50);
    }

    let y = 60;

    if (holidaysInRange.length > 0) {
      pdf.setFontSize(11);
      pdf.text('Public & Religious Holidays (excluded from attendance)', 14, y);
      y += 6;
      pdf.setFontSize(8);
      holidaysInRange.sort((a, b) => a.date.localeCompare(b.date)).forEach(h => {
        const typeLabel = h.type === 'religious' ? '[Religious]' : '[Public]';
        pdf.text(`${h.date}  ${typeLabel}  ${h.name}`, 14, y);
        y += 4;
      });
      y += 4;
    }

    const headers = ['Name', 'Dept', 'Days Worked', 'Attendance %', 'Late', 'Early', 'Avg In', 'Avg Out', 'Hours', 'Anomalies'];
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    const colX = [14, 60, 110, 130, 155, 170, 185, 200, 215, 235];
    headers.forEach((h, i) => pdf.text(h, colX[i], y));
    y += 6;
    pdf.setFont('helvetica', 'normal');

    filteredSummaries.forEach(s => {
      if (y > 190) {
        pdf.addPage();
        y = 20;
        pdf.setFont('helvetica', 'bold');
        headers.forEach((h, i) => pdf.text(h, colX[i], y));
        y += 6;
        pdf.setFont('helvetica', 'normal');
      }

      const row = [
        s.name.substring(0, 25),
        s.department.substring(0, 20),
        `${s.totalDaysWorked}/${s.totalWorkingDays}`,
        `${s.attendanceRate.toFixed(0)}%`,
        `${s.lateArrivals}`,
        `${s.earlyDepartures}`,
        s.avgClockInTime,
        s.avgClockOutTime,
        s.totalHoursWorked.toFixed(1),
        s.anomalies.length > 0 ? `${s.anomalies.length} issue(s)` : 'None',
      ];

      if (s.anomalies.some(a => a.severity === 'critical')) {
        pdf.setTextColor(220, 38, 38);
      } else if (s.anomalies.length > 0) {
        pdf.setTextColor(234, 179, 8);
      }

      row.forEach((cell, i) => pdf.text(cell, colX[i], y));
      pdf.setTextColor(0, 0, 0);
      y += 5;
    });

    pdf.save(`attendance-report-${period}-${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  const periodLabel = period === 'weekly' ? 'This Week' : period === 'monthly' ? 'This Month' : period === 'yearly' ? 'This Year' : 'Custom Period';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold text-slate-900" data-testid="text-report-title">
            Attendance Reports
          </h1>
          <p className="text-muted-foreground">
            {format(start, 'dd MMM yyyy')} - {format(end, 'dd MMM yyyy')}
          </p>
        </div>
        <Button onClick={exportPdf} data-testid="button-export-pdf">
          <Download className="h-4 w-4 mr-2" /> Export PDF
        </Button>
      </div>

        <Tabs value={period} onValueChange={(v) => setPeriod(v as ReportPeriod)}>
          <TabsList className="grid w-full grid-cols-4" data-testid="tabs-period">
            <TabsTrigger value="weekly" data-testid="tab-weekly">This Week</TabsTrigger>
            <TabsTrigger value="monthly" data-testid="tab-monthly">This Month</TabsTrigger>
            <TabsTrigger value="yearly" data-testid="tab-yearly">This Year</TabsTrigger>
            <TabsTrigger value="custom" data-testid="tab-custom">Custom</TabsTrigger>
          </TabsList>

          <TabsContent value="custom" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap gap-4 items-end">
                  <div>
                    <Label htmlFor="start-date">Start Date</Label>
                    <Input
                      id="start-date"
                      type="text"
                      placeholder="dd/mm/yyyy"
                      value={customStartInput}
                      onChange={(e) => {
                        setCustomStartInput(e.target.value);
                        if (isValidDateFormat(e.target.value)) {
                          setCustomStart(parseDateFromDisplay(e.target.value));
                        } else if (!e.target.value) {
                          setCustomStart('');
                        }
                      }}
                      onBlur={(e) => {
                        if (!isValidDateFormat(e.target.value)) {
                          setCustomStartInput(formatDateForDisplay(customStart));
                        }
                      }}
                      data-testid="input-start-date"
                    />
                  </div>
                  <div>
                    <Label htmlFor="end-date">End Date</Label>
                    <Input
                      id="end-date"
                      type="text"
                      placeholder="dd/mm/yyyy"
                      value={customEndInput}
                      onChange={(e) => {
                        setCustomEndInput(e.target.value);
                        if (isValidDateFormat(e.target.value)) {
                          setCustomEnd(parseDateFromDisplay(e.target.value));
                        } else if (!e.target.value) {
                          setCustomEnd('');
                        }
                      }}
                      onBlur={(e) => {
                        if (!isValidDateFormat(e.target.value)) {
                          setCustomEndInput(formatDateForDisplay(customEnd));
                        }
                      }}
                      data-testid="input-end-date"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {overallStats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <Users className="h-5 w-5 mx-auto mb-1 text-blue-500" />
                <p className="text-2xl font-bold" data-testid="stat-employees">{overallStats.total}</p>
                <p className="text-xs text-muted-foreground">Employees</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-green-500" />
                <p className="text-2xl font-bold" data-testid="stat-attendance">{overallStats.avgAttendance.toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground">Avg Attendance</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <Clock className="h-5 w-5 mx-auto mb-1 text-orange-500" />
                <p className="text-2xl font-bold" data-testid="stat-late">{overallStats.totalLate}</p>
                <p className="text-xs text-muted-foreground">Late Arrivals</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-amber-500" />
                <p className="text-2xl font-bold" data-testid="stat-early">{overallStats.totalEarly}</p>
                <p className="text-xs text-muted-foreground">Early Departures</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <TrendingUp className="h-5 w-5 mx-auto mb-1 text-purple-500" />
                <p className="text-2xl font-bold" data-testid="stat-hours">{overallStats.totalHours.toFixed(0)}</p>
                <p className="text-xs text-muted-foreground">Total Hours</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4 text-center">
                <XCircle className="h-5 w-5 mx-auto mb-1 text-red-500" />
                <p className="text-2xl font-bold" data-testid="stat-anomalies">{overallStats.employeesWithAnomalies}</p>
                <p className="text-xs text-muted-foreground">With Anomalies</p>
              </CardContent>
            </Card>
          </div>
        )}

        {departmentAbsenteeism.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-blue-500" />
                Department Absenteeism Summary
              </CardTitle>
              <CardDescription>Sorted by lowest attendance rate first</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-center">Employees</TableHead>
                    <TableHead className="text-center">Attendance %</TableHead>
                    <TableHead className="text-center">Late Arrivals</TableHead>
                    <TableHead className="text-center">Early Departures</TableHead>
                    <TableHead className="text-center">Total Hours</TableHead>
                    <TableHead className="text-center">With Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departmentAbsenteeism.map((d) => {
                    const rate = d.totalWorkingDays > 0 ? (d.totalDaysWorked / d.totalWorkingDays) * 100 : 100;
                    return (
                      <TableRow key={d.dept} data-testid={`dept-row-${d.dept}`}>
                        <TableCell className="font-medium">{d.dept}</TableCell>
                        <TableCell className="text-center">{d.employees}</TableCell>
                        <TableCell className="text-center">
                          <span className={`font-semibold ${rate >= 90 ? 'text-green-600' : rate >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                            {rate.toFixed(0)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-center">{d.totalLate}</TableCell>
                        <TableCell className="text-center">{d.totalEarly}</TableCell>
                        <TableCell className="text-center">{d.totalHours.toFixed(0)}</TableCell>
                        <TableCell className="text-center">
                          {d.withAnomalies > 0 ? (
                            <Badge variant="destructive" className="text-xs">{d.withAnomalies}</Badge>
                          ) : (
                            <span className="text-green-600 text-xs">None</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {holidaysInRange.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-indigo-500" />
                Public & Religious Holidays in Period
              </CardTitle>
              <CardDescription>
                {holidaysInRange.length} holiday{holidaysInRange.length !== 1 ? 's' : ''} — these days are excluded from attendance calculations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {holidaysInRange
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((holiday) => (
                  <div
                    key={holiday.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30"
                    data-testid={`holiday-card-${holiday.id}`}
                  >
                    <div className={`mt-0.5 rounded-full p-1.5 ${holiday.type === 'religious' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                      {holiday.type === 'religious' ? <Star className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate" data-testid={`holiday-name-${holiday.id}`}>
                        {holiday.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(holiday.date + 'T00:00:00'), 'EEEE, dd MMMM yyyy')}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${holiday.type === 'religious' ? 'border-purple-300 text-purple-600 dark:border-purple-700 dark:text-purple-400' : 'border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400'}`}>
                          {holiday.type === 'religious' ? 'Religious' : 'Public'}
                        </Badge>
                        {holiday.isRecurring && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-300 text-green-600 dark:border-green-700 dark:text-green-400">
                            Annual
                          </Badge>
                        )}
                      </div>
                      {holiday.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{holiday.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Per-Employee Breakdown
                </CardTitle>
                <CardDescription>{filteredSummaries.length} employees</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 w-48"
                    data-testid="input-search-reports"
                  />
                </div>
                <SearchableSelect
                  value={selectedDepartment}
                  onValueChange={setSelectedDepartment}
                  options={[
                    { value: 'all', label: 'All Departments' },
                    ...departments.map(d => ({ value: d.name, label: d.name })),
                  ]}
                  placeholder="Department"
                  className="w-40"
                />
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                  <SelectTrigger className="w-40" data-testid="select-sort">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="attendance">Attendance (Low First)</SelectItem>
                    <SelectItem value="infringements">Infringements (High First)</SelectItem>
                    <SelectItem value="hours">Hours (Low First)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-10 text-muted-foreground">Loading report data...</div>
            ) : filteredSummaries.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">No data available for this period.</div>
            ) : (
              <div className="space-y-2">
                {filteredSummaries.map((summary) => (
                  <div
                    key={summary.userId}
                    className={`border rounded-lg overflow-hidden transition-colors ${
                      summary.anomalies.some(a => a.severity === 'critical')
                        ? 'border-red-300 bg-red-50/50 dark:bg-red-950/20 dark:border-red-800'
                        : summary.anomalies.length > 0
                        ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800'
                        : 'border-border'
                    }`}
                    data-testid={`card-employee-${summary.userId}`}
                  >
                    <button
                      onClick={() => setExpandedEmployee(expandedEmployee === summary.userId ? null : summary.userId)}
                      className="w-full text-left p-4 hover:bg-muted/50 transition-colors"
                      data-testid={`button-expand-${summary.userId}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {expandedEmployee === summary.userId ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div>
                            <span className="font-medium">{summary.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">({summary.userId})</span>
                            <span className="text-xs text-muted-foreground ml-2">• {summary.department}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <div className="text-center hidden sm:block">
                            <span className={`font-semibold ${summary.attendanceRate >= 90 ? 'text-green-600' : summary.attendanceRate >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                              {summary.attendanceRate.toFixed(0)}%
                            </span>
                            <p className="text-xs text-muted-foreground">Attendance</p>
                          </div>
                          <div className="text-center hidden sm:block">
                            <span className="font-semibold">{summary.totalDaysWorked}/{summary.totalWorkingDays}</span>
                            <p className="text-xs text-muted-foreground">Days</p>
                          </div>
                          <div className="text-center hidden md:block">
                            <span className={`font-semibold ${summary.lateArrivals > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                              {summary.lateArrivals}
                            </span>
                            <p className="text-xs text-muted-foreground">Late</p>
                          </div>
                          <div className="text-center hidden md:block">
                            <span className={`font-semibold ${summary.earlyDepartures > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                              {summary.earlyDepartures}
                            </span>
                            <p className="text-xs text-muted-foreground">Early</p>
                          </div>
                          <div className="text-center hidden lg:block">
                            <span className="font-semibold">{summary.totalHoursWorked.toFixed(1)}</span>
                            <p className="text-xs text-muted-foreground">Hours</p>
                          </div>
                          {summary.anomalies.length > 0 && (
                            <Badge variant={summary.anomalies.some(a => a.severity === 'critical') ? 'destructive' : 'secondary'}>
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              {summary.anomalies.length}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>

                    {expandedEmployee === summary.userId && (
                      <div className="border-t p-4 space-y-4 bg-card">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="text-center p-3 bg-muted rounded-lg">
                            <p className="text-sm text-muted-foreground">Avg Clock In</p>
                            <p className={`text-lg font-semibold ${summary.avgClockInTime > clockInCutoff ? 'text-orange-600' : 'text-green-600'}`}>
                              {summary.avgClockInTime}
                            </p>
                            <p className="text-xs text-muted-foreground">Cutoff: {clockInCutoff}</p>
                          </div>
                          <div className="text-center p-3 bg-muted rounded-lg">
                            <p className="text-sm text-muted-foreground">Avg Clock Out</p>
                            <p className={`text-lg font-semibold ${summary.avgClockOutTime < clockOutCutoff && summary.avgClockOutTime !== '--:--' ? 'text-amber-600' : 'text-green-600'}`}>
                              {summary.avgClockOutTime}
                            </p>
                            <p className="text-xs text-muted-foreground">Cutoff: {clockOutCutoff}</p>
                          </div>
                          <div className="text-center p-3 bg-muted rounded-lg">
                            <p className="text-sm text-muted-foreground">Missed Days</p>
                            <p className={`text-lg font-semibold ${summary.missedDays > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {summary.missedDays}
                            </p>
                          </div>
                          <div className="text-center p-3 bg-muted rounded-lg">
                            <p className="text-sm text-muted-foreground">Avg Hours/Day</p>
                            <p className="text-lg font-semibold">
                              {summary.totalDaysWorked > 0 ? (summary.totalHoursWorked / summary.totalDaysWorked).toFixed(1) : '0'}
                            </p>
                          </div>
                        </div>

                        {summary.anomalies.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4 text-amber-500" />
                              Anomalies Detected
                            </h4>
                            {summary.anomalies.map((anomaly, i) => (
                              <div
                                key={i}
                                className={`flex items-start gap-2 p-2 rounded text-sm ${
                                  anomaly.severity === 'critical' ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                }`}
                                data-testid={`anomaly-${summary.userId}-${i}`}
                              >
                                {anomaly.severity === 'critical' ? (
                                  <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                ) : (
                                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                )}
                                <span>{anomaly.description}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div>
                          <h4 className="text-sm font-semibold mb-2">Daily Breakdown</h4>
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Date</TableHead>
                                  <TableHead>Day</TableHead>
                                  <TableHead>Clock In</TableHead>
                                  <TableHead>Clock Out</TableHead>
                                  <TableHead>Hours</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead>Reason</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {summary.dailyRecords.map((record) => (
                                  <TableRow
                                    key={record.date}
                                    data-testid={`row-daily-${summary.userId}-${record.date}`}
                                    className={record.isHoliday ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : ''}
                                  >
                                    <TableCell className="text-sm">{format(new Date(record.date + 'T00:00:00'), 'dd/MM')}</TableCell>
                                    <TableCell className="text-sm">{format(new Date(record.date + 'T00:00:00'), 'EEE')}</TableCell>
                                    {record.isHoliday ? (
                                      <>
                                        <TableCell colSpan={3} className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">
                                          <div className="flex items-center gap-1.5">
                                            <Calendar className="h-3.5 w-3.5" />
                                            {record.holidayName}
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          <Badge variant="outline" className="text-xs border-indigo-300 text-indigo-600 dark:border-indigo-700 dark:text-indigo-400">Holiday</Badge>
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">-</TableCell>
                                      </>
                                    ) : (
                                      <>
                                        <TableCell>
                                          {record.clockIn ? (
                                            <span className={record.isLate ? 'text-orange-600 font-medium' : ''}>
                                              {record.clockIn}
                                            </span>
                                          ) : (
                                            <span className="text-red-500">--:--</span>
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          {record.clockOut ? (
                                            <span className={record.isEarlyDeparture ? 'text-amber-600 font-medium' : ''}>
                                              {record.clockOut}
                                            </span>
                                          ) : record.clockIn ? (
                                            <span className="text-muted-foreground">--:--</span>
                                          ) : (
                                            <span className="text-red-500">--:--</span>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-sm">{record.hoursWorked > 0 ? record.hoursWorked.toFixed(1) : '-'}</TableCell>
                                        <TableCell>
                                          {record.isFirstDay && record.clockIn ? (
                                            <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800 border-blue-200">Registered</Badge>
                                          ) : !record.clockIn ? (
                                            <Badge variant="destructive" className="text-xs">Absent</Badge>
                                          ) : record.isLate && record.isEarlyDeparture ? (
                                            <Badge variant="destructive" className="text-xs">Late + Early</Badge>
                                          ) : record.isLate ? (
                                            <Badge className="bg-orange-500 text-xs">Late</Badge>
                                          ) : record.isEarlyDeparture ? (
                                            <Badge className="bg-amber-500 text-xs">Early</Badge>
                                          ) : !record.clockOut && record.clockIn ? (
                                            <Badge variant="secondary" className="text-xs">No Clock-out</Badge>
                                          ) : (
                                            <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">On Time</Badge>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                                          {record.isFirstDay && record.clockIn
                                            ? (record.infringementReason ? `${record.infringementReason}; First day registered` : 'First day registered')
                                            : (record.infringementReason || '-')}
                                        </TableCell>
                                      </>
                                    )}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Department-Level Attendance Summary (#23) */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-500" />
              Department Attendance Summary
            </CardTitle>
            <CardDescription>Aggregate attendance rates and infringements by department for the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const departments = Array.from(new Set(summaries.map(s => s.department || 'Unassigned'))).sort();
              const deptRows = departments.map(dept => {
                const deptSummaries = summaries.filter(s => (s.department || 'Unassigned') === dept);
                const totalWorking = deptSummaries.reduce((a, s) => a + s.totalWorkingDays, 0);
                const totalWorked = deptSummaries.reduce((a, s) => a + s.totalDaysWorked, 0);
                const totalLate = deptSummaries.reduce((a, s) => a + s.lateArrivals, 0);
                const totalEarly = deptSummaries.reduce((a, s) => a + s.earlyDepartures, 0);
                const totalMissed = deptSummaries.reduce((a, s) => a + s.missedDays, 0);
                const avgRate = totalWorking > 0 ? (totalWorked / totalWorking) * 100 : 0;
                return { dept, count: deptSummaries.length, totalWorking, totalWorked, totalLate, totalEarly, totalMissed, avgRate };
              });

              if (!deptRows.length) return <p className="text-sm text-muted-foreground">No data for the selected period.</p>;

              return (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Department</TableHead>
                      <TableHead className="text-center">Headcount</TableHead>
                      <TableHead className="text-center">Working Days</TableHead>
                      <TableHead className="text-center">Days Present</TableHead>
                      <TableHead className="text-center">Attendance Rate</TableHead>
                      <TableHead className="text-center">Late Arrivals</TableHead>
                      <TableHead className="text-center">Early Departures</TableHead>
                      <TableHead className="text-center">Absent Days</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deptRows.map(row => (
                      <TableRow key={row.dept}>
                        <TableCell className="font-medium">{row.dept}</TableCell>
                        <TableCell className="text-center">{row.count}</TableCell>
                        <TableCell className="text-center">{row.totalWorking}</TableCell>
                        <TableCell className="text-center">{row.totalWorked}</TableCell>
                        <TableCell className="text-center">
                          <span className={`font-semibold ${row.avgRate >= 90 ? 'text-green-600' : row.avgRate >= 75 ? 'text-amber-600' : 'text-red-600'}`}>
                            {row.avgRate.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={row.totalLate > 0 ? 'text-orange-600 font-medium' : ''}>{row.totalLate}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={row.totalEarly > 0 ? 'text-amber-600 font-medium' : ''}>{row.totalEarly}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={row.totalMissed > 0 ? 'text-red-600 font-medium' : ''}>{row.totalMissed}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Totals row */}
                    <TableRow className="border-t-2 bg-slate-50 font-semibold">
                      <TableCell>TOTAL</TableCell>
                      <TableCell className="text-center">{deptRows.reduce((a, r) => a + r.count, 0)}</TableCell>
                      <TableCell className="text-center">{deptRows.reduce((a, r) => a + r.totalWorking, 0)}</TableCell>
                      <TableCell className="text-center">{deptRows.reduce((a, r) => a + r.totalWorked, 0)}</TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          const tw = deptRows.reduce((a, r) => a + r.totalWorking, 0);
                          const tp = deptRows.reduce((a, r) => a + r.totalWorked, 0);
                          return tw > 0 ? ((tp / tw) * 100).toFixed(1) + '%' : '-';
                        })()}
                      </TableCell>
                      <TableCell className="text-center">{deptRows.reduce((a, r) => a + r.totalLate, 0)}</TableCell>
                      <TableCell className="text-center">{deptRows.reduce((a, r) => a + r.totalEarly, 0)}</TableCell>
                      <TableCell className="text-center">{deptRows.reduce((a, r) => a + r.totalMissed, 0)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              );
            })()}
          </CardContent>
        </Card>
    </div>
  );
}
