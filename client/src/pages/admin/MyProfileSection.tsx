import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { User, Mail, Phone, MapPin, Building2, Calendar, Clock, Users } from "lucide-react";
import { userApi, leaveBalanceApi, attendanceApi } from "@/lib/api";
import { formatLeaveDays, groupLeaveBalances, userHasRole } from './utils';
import { format } from "date-fns";
import type { LeaveBalance, AttendanceRecord } from "@shared/schema";

export default function MyProfileSection() {
  const { user } = useAuth();

  const { data: userDetails } = useQuery({
    queryKey: ['user', user?.id],
    queryFn: () => user?.id ? userApi.getById(user.id) : null,
    enabled: !!user?.id,
  });

  const { data: leaveBalances } = useQuery({
    queryKey: ['leave-balances', user?.id],
    queryFn: () => user?.id ? leaveBalanceApi.getByUserId(user.id) : [],
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: recentAttendance } = useQuery({
    queryKey: ['attendance', user?.id, 'recent'],
    queryFn: () => user?.id ? attendanceApi.getByUserId(user.id, 5) : [],
    enabled: !!user?.id,
  });

  const managerId = (userDetails as any)?.managerId || (user as any)?.managerId;
  const { data: managerDetails } = useQuery({
    queryKey: ['user', managerId],
    queryFn: () => userApi.getById(managerId),
    enabled: !!managerId,
  });

  if (!user) return null;

  const displayUser = userDetails || user;
  const managerName = managerDetails
    ? `${(managerDetails as any).firstName} ${(managerDetails as any).surname}`
    : null;

  const getInitials = () => {
    const first = (displayUser as any).firstName?.[0] || '';
    const last = (displayUser as any).surname?.[0] || '';
    return (first + last).toUpperCase() || 'U';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <Avatar className="h-24 w-24">
              <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-2xl font-bold">
                {(displayUser as any).firstName} {(displayUser as any).surname}
              </h2>
              {(displayUser as any).nickname && (
                <p className="text-muted-foreground">"{(displayUser as any).nickname}"</p>
              )}
              <div className="mt-2 flex flex-wrap justify-center md:justify-start gap-2">
                {((displayUser as any).roles?.length
                  ? (displayUser as any).roles
                  : [userHasRole(displayUser, 'manager') ? 'manager' : 'employee']
                ).map((r: string) => (
                  <Badge key={r} variant="secondary" className="capitalize">{r}</Badge>
                ))}
              </div>
              {(displayUser as any).department && (
                <p className="mt-2 text-sm text-muted-foreground flex items-center justify-center md:justify-start gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {(displayUser as any).department}
                </p>
              )}
              {managerName ? (
                <p className="mt-1 text-sm text-muted-foreground flex items-center justify-center md:justify-start gap-1">
                  <Users className="h-3.5 w-3.5" />
                  Reports to {managerName}
                </p>
              ) : (
                <p className="mt-1 text-sm text-status-warning flex items-center justify-center md:justify-start gap-1">
                  <Users className="h-3.5 w-3.5" />
                  No line manager assigned
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p>{(displayUser as any).email || 'Not provided'}</p>
              </div>
            </div>
            <Separator />
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Mobile</p>
                <p>{(displayUser as any).mobile || 'Not provided'}</p>
              </div>
            </div>
            <Separator />
            <div className="flex items-center gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Address</p>
                <p>{(displayUser as any).homeAddress || 'Not provided'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Leave Balances
            </CardTitle>
          </CardHeader>
          <CardContent>
            {leaveBalances && leaveBalances.length > 0 ? (
              (() => {
                const renderBalance = (balance: LeaveBalance) => {
                  const carryOver = (balance as any).carryOverDays as number | undefined;
                  const carryOverExpiry = (balance as any).carryOverExpiry as string | null | undefined;
                  const available = (balance.total ?? 0) - (balance.taken ?? 0) - (balance.pending ?? 0);
                  return (
                    <div key={balance.id} className="space-y-0.5">
                      <div className="flex justify-between items-center">
                        <span className="font-medium capitalize">{balance.leaveType.replace('_', ' ')}</span>
                        <div className="text-right">
                          <span className="text-status-success font-bold">{formatLeaveDays(available)}</span>
                          <span className="text-muted-foreground text-sm"> / {formatLeaveDays(balance.total)} days</span>
                        </div>
                      </div>
                      {!!carryOver && carryOver > 0 && (
                        <p className="text-xs text-status-warning">
                          +{formatLeaveDays(carryOver)} carried over
                          {carryOverExpiry && ` (expires ${new Date(carryOverExpiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })})`}
                        </p>
                      )}
                    </div>
                  );
                };
                const { standard, other } = groupLeaveBalances(leaveBalances as LeaveBalance[]);
                return (
                  <div className="space-y-4">
                    {standard.length > 0 && (
                      <div className="space-y-3">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Standard</p>
                        {standard.map(renderBalance)}
                      </div>
                    )}
                    {other.length > 0 && (
                      <div className="space-y-3">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Other</p>
                        {other.map(renderBalance)}
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <p className="text-muted-foreground">No leave balances found.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Attendance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentAttendance && recentAttendance.length > 0 ? (
            <div className="space-y-3">
              {recentAttendance.map((record: AttendanceRecord) => (
                <div key={record.id} className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                  <Badge variant={record.type === 'in' ? 'default' : 'secondary'}>
                    Clock {record.type === 'in' ? 'In' : 'Out'}
                  </Badge>
                  <span className="text-foreground">
                    {format(new Date(record.timestamp), "d MMM yyyy 'at' h:mm a")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No recent attendance records.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
