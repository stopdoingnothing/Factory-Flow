import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, addMonths, subMonths, startOfMonth, getDaysInMonth, getDay } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { leaveRequestApi, userApi, publicHolidayApi } from '@/lib/api';
import type { LeaveRequest, PublicHoliday, User } from '@shared/schema';
import PublicHolidaysSection from './PublicHolidaysSection';

const LEAVE_TYPE_COLORS: Record<string, { bg: string; dot: string }> = {
  'Annual Leave':           { bg: 'bg-blue-100 dark:bg-blue-900/40',   dot: 'bg-blue-500' },
  'Sick Leave':             { bg: 'bg-red-100 dark:bg-red-900/40',     dot: 'bg-red-500' },
  'Family Responsibility':  { bg: 'bg-purple-100 dark:bg-purple-900/40', dot: 'bg-purple-500' },
  'Maternity Leave':        { bg: 'bg-pink-100 dark:bg-pink-900/40',   dot: 'bg-pink-500' },
  'Study Leave':            { bg: 'bg-green-100 dark:bg-green-900/40', dot: 'bg-green-500' },
  'Unpaid Leave':           { bg: 'bg-gray-100 dark:bg-gray-800/60',   dot: 'bg-gray-500' },
};
const DEFAULT_LEAVE = { bg: 'bg-emerald-100 dark:bg-emerald-900/40', dot: 'bg-emerald-500' };

export default function LeaveCalendarSection() {
  const [displayDate, setDisplayDate] = useState(() => startOfMonth(new Date()));

  const { data: leaveRequests = [] } = useQuery({
    queryKey: ['leave-requests'],
    queryFn: () => leaveRequestApi.getAll(),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: userApi.getAll,
  });

  const { data: publicHolidays = [] } = useQuery({
    queryKey: ['public-holidays'],
    queryFn: () => publicHolidayApi.getAll(),
  });

  const today = new Date();
  const currentMonth = displayDate.getMonth();
  const currentYear = displayDate.getFullYear();
  const daysInMonth = getDaysInMonth(displayDate);
  const firstDayOfWeek = getDay(displayDate);

  const approvedLeaves = (leaveRequests as LeaveRequest[]).filter((lr: LeaveRequest) => lr.status === 'approved' && !lr.isHistoric);

  const monthHolidays = (publicHolidays as PublicHoliday[]).filter((h: PublicHoliday) => {
    const hDate = new Date(h.date + 'T00:00:00');
    if (h.isRecurring) {
      return hDate.getMonth() === currentMonth;
    }
    return hDate.getMonth() === currentMonth && hDate.getFullYear() === currentYear;
  });

  const upcomingLeaves = approvedLeaves.filter((lr: LeaveRequest) => {
    const start = new Date(lr.startDate + 'T00:00:00');
    return start.getMonth() === currentMonth && start.getFullYear() === currentYear;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-heading font-bold text-foreground">Leave Calendar</h1>
        <p className="text-muted-foreground">Visual overview of employee leave schedules and public holidays</p>
      </div>

      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar">Leave Calendar</TabsTrigger>
          <TabsTrigger value="holidays">Public Holidays</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle>Monthly Leave Overview</CardTitle>
                  <CardDescription>See who is on leave and when</CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="sm" onClick={() => setDisplayDate(d => subMonths(d, 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="font-semibold text-lg min-w-[140px] text-center">
                    {format(displayDate, 'MMMM yyyy')}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setDisplayDate(d => addMonths(d, 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDisplayDate(startOfMonth(new Date()))}>
                    Today
                  </Button>
                </div>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded ring-2 ring-primary ring-offset-1 bg-card"></div>
                  Today
                </span>
                <span className="flex items-center gap-1.5">
                  <div className="w-3 h-3 bg-orange-100 dark:bg-orange-900/40 border border-orange-300 dark:border-orange-700 rounded"></div>
                  Public Holiday
                </span>
                <span className="text-border select-none">|</span>
                {Object.entries(LEAVE_TYPE_COLORS).map(([type, colors]) => (
                  <span key={type} className="flex items-center gap-1.5">
                    <div className={`w-2.5 h-2.5 ${colors.dot} rounded-full`}></div>
                    {type}
                  </span>
                ))}
              </div>
            </CardHeader>

            <CardContent>
              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1 text-center text-sm">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <div key={d} className="font-semibold py-2 text-muted-foreground text-xs">{d}</div>
                ))}

                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                  <div key={`empty-${i}`} className="py-2"></div>
                ))}

                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                  const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const holiday = monthHolidays.find((h: PublicHoliday) => {
                    const hDate = new Date(h.date + 'T00:00:00');
                    if (h.isRecurring) {
                      return hDate.getMonth() === currentMonth && hDate.getDate() === day;
                    }
                    return h.date === dateStr;
                  });
                  const leavesOnDay = approvedLeaves.filter((lr: LeaveRequest) =>
                    lr.startDate <= dateStr && lr.endDate >= dateStr
                  );
                  const isToday = currentMonth === today.getMonth() && currentYear === today.getFullYear() && day === today.getDate();
                  const isWeekendDay = [0, 6].includes(new Date(dateStr).getDay());

                  let cellBg = isWeekendDay ? 'bg-muted/40' : 'bg-muted/20';
                  if (holiday) cellBg = 'bg-orange-100 dark:bg-orange-900/40 border border-orange-300 dark:border-orange-700';
                  else if (leavesOnDay.length > 0) {
                    const firstType = leavesOnDay[0].leaveType;
                    cellBg = (LEAVE_TYPE_COLORS[firstType] || DEFAULT_LEAVE).bg;
                  }

                  const leaveTypeDotsSet = new Set(leavesOnDay.map((lr: LeaveRequest) => lr.leaveType));
                  const leaveDots = Array.from(leaveTypeDotsSet).slice(0, 4);

                  return (
                    <div
                      key={day}
                      className={`relative min-h-[52px] rounded p-1 ${isToday ? 'ring-2 ring-primary ring-offset-1' : ''} ${cellBg}`}
                      title={[
                        holiday ? `🎉 ${holiday.name}` : null,
                        leavesOnDay.length > 0 ? `${leavesOnDay.length} on leave` : null,
                      ].filter(Boolean).join(' | ') || undefined}
                    >
                      <span className={`text-xs font-medium ${isToday ? 'font-bold text-primary' : isWeekendDay ? 'text-muted-foreground/60' : ''}`}>
                        {day}
                      </span>

                      {holiday && (
                        <div className="text-orange-700 dark:text-orange-400 text-[9px] leading-tight mt-0.5 truncate font-medium">
                          {holiday.name}
                          {holiday.religionGroup && (
                            <span className="ml-1 text-[8px] bg-orange-200 dark:bg-orange-900 text-orange-800 dark:text-orange-300 rounded px-0.5">
                              {holiday.religionGroup}
                            </span>
                          )}
                        </div>
                      )}

                      {leavesOnDay.length > 0 && (
                        <div className="absolute bottom-1 right-1 flex items-center gap-0.5">
                          {leaveDots.map((type: string) => (
                            <div
                              key={type}
                              className={`w-2 h-2 rounded-full ${(LEAVE_TYPE_COLORS[type] || DEFAULT_LEAVE).dot}`}
                              title={type}
                            />
                          ))}
                          <span className="text-[9px] font-bold text-foreground ml-0.5">{leavesOnDay.length}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Upcoming Leave List */}
              <div className="mt-6">
                <h4 className="font-semibold mb-3">Leave This Month
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({upcomingLeaves.length} approved)
                  </span>
                </h4>
                {upcomingLeaves.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No approved leave this month</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {upcomingLeaves
                      .sort((a: LeaveRequest, b: LeaveRequest) => a.startDate.localeCompare(b.startDate))
                      .map((lr: LeaveRequest) => {
                        const emp = (users as User[]).find(u => u.id === lr.userId);
                        const colors = LEAVE_TYPE_COLORS[lr.leaveType] || DEFAULT_LEAVE;
                        return (
                          <div key={lr.id} className="flex items-center justify-between p-2 bg-muted/40 rounded">
                            <div className="flex items-center gap-2">
                              <div className={`w-2.5 h-2.5 rounded-full ${colors.dot} flex-shrink-0`} />
                              <span className="font-medium text-sm">{emp?.firstName} {emp?.surname}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(lr.startDate + 'T00:00:00'), 'dd MMM')}
                              {lr.startDate !== lr.endDate && ` – ${format(new Date(lr.endDate + 'T00:00:00'), 'dd MMM')}`}
                              {' '}· {lr.leaveType}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Public Holidays This Month */}
              {monthHolidays.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <h4 className="font-semibold mb-2 text-sm">Public Holidays This Month</h4>
                  <div className="flex flex-wrap gap-2">
                    {monthHolidays.map((h: PublicHoliday) => (
                      <span key={h.id} className="text-xs bg-orange-100 text-orange-800 border border-orange-200 rounded px-2 py-1">
                        {format(new Date(h.date + 'T00:00:00'), 'dd MMM')} · {h.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="holidays" className="mt-4">
          <PublicHolidaysSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
