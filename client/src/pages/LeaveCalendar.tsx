import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isWithinInterval, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, ArrowLeft, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useAuth } from '@/lib/auth-context';
import { leaveRequestApi, userApi, departmentApi } from '@/lib/api';
import type { LeaveRequest, User, Department } from '@shared/schema';

export default function LeaveCalendar() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');

  const { data: leaveRequests = [] } = useQuery({
    queryKey: ['leave-requests'],
    queryFn: () => leaveRequestApi.getAll(),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: userApi.getAll,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: departmentApi.getAll,
  });

  const approvedLeaves = useMemo(() => {
    return leaveRequests.filter((r: LeaveRequest) => r.status === 'approved');
  }, [leaveRequests]);

  const filteredLeaves = useMemo(() => {
    if (selectedDepartment === 'all') return approvedLeaves;
    return approvedLeaves.filter((r: LeaveRequest) => {
      const employee = users.find((u: User) => u.id === r.userId);
      return employee?.department === selectedDepartment;
    });
  }, [approvedLeaves, selectedDepartment, users]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const firstDayOfWeek = monthStart.getDay();
  const paddingDays = Array(firstDayOfWeek).fill(null);

  const getLeavesForDay = (day: Date) => {
    return filteredLeaves.filter((leave: LeaveRequest) => {
      const startDate = parseISO(leave.startDate);
      const endDate = parseISO(leave.endDate);
      return isWithinInterval(day, { start: startDate, end: endDate });
    });
  };

  const getLeaveTypeColor = (leaveType: string) => {
    const colors: Record<string, string> = {
      'Annual Leave': 'bg-blue-500',
      'Sick Leave': 'bg-red-500',
      'Family Responsibility': 'bg-purple-500',
      'Maternity Leave': 'bg-pink-500',
      'Study Leave': 'bg-green-500',
      'Unpaid Leave': 'bg-gray-500',
    };
    return colors[leaveType] || 'bg-slate-500';
  };

  const goToPreviousMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const goToToday = () => setCurrentMonth(new Date());

  if (!user || user.role !== 'manager') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-96">
          <CardContent className="pt-6 text-center">
            <p>You need manager access to view this page.</p>
            <Button className="mt-4" onClick={() => setLocation('/admin')}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => setLocation('/dashboard')}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
            </Button>
            <h1 className="text-2xl font-bold">Leave Calendar</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <SearchableSelect
              value={selectedDepartment}
              onValueChange={setSelectedDepartment}
              options={[
                { value: 'all', label: 'All Departments' },
                ...departments.map((dept: Department) => ({ value: dept.name, label: dept.name })),
              ]}
              placeholder="Filter by department"
              className="w-48"
            />
          </div>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">{format(currentMonth, 'MMMM yyyy')}</CardTitle>
                <CardDescription>Approved leave requests shown on calendar</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={goToPreviousMonth} data-testid="button-prev-month">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={goToToday} data-testid="button-today">
                  Today
                </Button>
                <Button variant="outline" size="icon" onClick={goToNextMonth} data-testid="button-next-month">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center py-2 font-medium text-sm text-muted-foreground border-b">
                  {day}
                </div>
              ))}
              
              {paddingDays.map((_, index) => (
                <div key={`padding-${index}`} className="min-h-[100px] bg-slate-100 dark:bg-slate-800/50 rounded" />
              ))}
              
              {daysInMonth.map(day => {
                const dayLeaves = getLeavesForDay(day);
                const isToday = isSameDay(day, new Date());
                
                return (
                  <div
                    key={day.toISOString()}
                    className={`min-h-[100px] border rounded p-1 ${
                      isToday ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300' : 'bg-white dark:bg-slate-800'
                    }`}
                    data-testid={`calendar-day-${format(day, 'yyyy-MM-dd')}`}
                  >
                    <div className={`text-sm font-medium mb-1 ${isToday ? 'text-blue-600' : ''}`}>
                      {format(day, 'd')}
                    </div>
                    <div className="space-y-1 overflow-y-auto max-h-[70px]">
                      {dayLeaves.slice(0, 3).map((leave: LeaveRequest) => {
                        const employee = users.find((u: User) => u.id === leave.userId);
                        return (
                          <div
                            key={leave.id}
                            className={`text-xs p-1 rounded text-white truncate ${getLeaveTypeColor(leave.leaveType)}`}
                            title={`${employee?.firstName} ${employee?.surname} - ${leave.leaveType}`}
                          >
                            {employee?.firstName} {employee?.surname?.charAt(0)}.
                          </div>
                        );
                      })}
                      {dayLeaves.length > 3 && (
                        <div className="text-xs text-muted-foreground text-center">
                          +{dayLeaves.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="mt-6 flex flex-wrap gap-4 pt-4 border-t">
              <span className="text-sm font-medium">Legend:</span>
              {[
                { type: 'Annual Leave', color: 'bg-blue-500' },
                { type: 'Sick Leave', color: 'bg-red-500' },
                { type: 'Family Responsibility', color: 'bg-purple-500' },
                { type: 'Maternity Leave', color: 'bg-pink-500' },
                { type: 'Study Leave', color: 'bg-green-500' },
                { type: 'Unpaid Leave', color: 'bg-gray-500' },
              ].map(item => (
                <div key={item.type} className="flex items-center gap-1">
                  <div className={`w-3 h-3 rounded ${item.color}`} />
                  <span className="text-xs text-muted-foreground">{item.type}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Leaves This Month
            </CardTitle>
            <CardDescription>
              {filteredLeaves.filter((r: LeaveRequest) => {
                const startDate = parseISO(r.startDate);
                const endDate = parseISO(r.endDate);
                return (
                  (startDate >= monthStart && startDate <= monthEnd) ||
                  (endDate >= monthStart && endDate <= monthEnd) ||
                  (startDate <= monthStart && endDate >= monthEnd)
                );
              }).length} approved leaves this month
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {filteredLeaves
                .filter((r: LeaveRequest) => {
                  const startDate = parseISO(r.startDate);
                  const endDate = parseISO(r.endDate);
                  return (
                    (startDate >= monthStart && startDate <= monthEnd) ||
                    (endDate >= monthStart && endDate <= monthEnd) ||
                    (startDate <= monthStart && endDate >= monthEnd)
                  );
                })
                .slice(0, 10)
                .map((leave: LeaveRequest) => {
                  const employee = users.find((u: User) => u.id === leave.userId);
                  return (
                    <div key={leave.id} className="flex items-center justify-between p-2 rounded border">
                      <div className="flex items-center gap-3">
                        <Badge className={getLeaveTypeColor(leave.leaveType)}>
                          {leave.leaveType}
                        </Badge>
                        <span className="font-medium">{employee?.firstName} {employee?.surname}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {format(parseISO(leave.startDate), 'dd MMM')} - {format(parseISO(leave.endDate), 'dd MMM')}
                      </span>
                    </div>
                  );
                })}
              {filteredLeaves.filter((r: LeaveRequest) => {
                const startDate = parseISO(r.startDate);
                const endDate = parseISO(r.endDate);
                return (
                  (startDate >= monthStart && startDate <= monthEnd) ||
                  (endDate >= monthStart && endDate <= monthEnd) ||
                  (startDate <= monthStart && endDate >= monthEnd)
                );
              }).length === 0 && (
                <p className="text-center text-muted-foreground py-4">
                  No approved leaves for this month
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
