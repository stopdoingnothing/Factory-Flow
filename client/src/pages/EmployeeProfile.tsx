import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, User, Mail, Phone, MapPin, Building2, Calendar, Clock } from "lucide-react";
import { userApi, leaveBalanceApi, attendanceApi } from "@/lib/api";
import { format } from "date-fns";
import type { LeaveBalance, AttendanceRecord } from "@shared/schema";

export default function EmployeeProfile() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: userDetails } = useQuery({
    queryKey: ['user', user?.id],
    queryFn: () => user?.id ? userApi.getById(user.id) : null,
    enabled: !!user?.id,
  });

  const { data: leaveBalances } = useQuery({
    queryKey: ['leave-balances', user?.id],
    queryFn: () => user?.id ? leaveBalanceApi.getByUserId(user.id) : [],
    enabled: !!user?.id,
  });

  const { data: recentAttendance } = useQuery({
    queryKey: ['attendance', user?.id, 'recent'],
    queryFn: () => user?.id ? attendanceApi.getByUserId(user.id, 5) : [],
    enabled: !!user?.id,
  });

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Please log in to view your profile.</p>
      </div>
    );
  }

  const displayUser = userDetails || user;
  const departmentName = displayUser.department;

  const getInitials = () => {
    const first = displayUser.firstName?.[0] || '';
    const last = displayUser.surname?.[0] || '';
    return (first + last).toUpperCase() || 'U';
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-100 to-neutral-200">
      <header className="bg-neutral-800 text-white p-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setLocation("/dashboard")}
            className="text-white hover:bg-neutral-700"
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold font-display">My Profile</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
              <Avatar className="h-24 w-24">
                <AvatarFallback className="text-2xl bg-blue-600 text-white">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 text-center md:text-left">
                <h2 className="text-2xl font-bold" data-testid="text-employee-name">
                  {displayUser.firstName} {displayUser.surname}
                </h2>
                {displayUser.nickname && (
                  <p className="text-gray-500" data-testid="text-nickname">
                    "{displayUser.nickname}"
                  </p>
                )}
                <div className="mt-2 flex flex-wrap justify-center md:justify-start gap-2">
                  <Badge variant={displayUser.role === 'manager' ? 'default' : 'secondary'}>
                    {displayUser.role === 'manager' ? 'Manager' : 'Employee'}
                  </Badge>
                  {departmentName && (
                    <Badge variant="outline">{departmentName}</Badge>
                  )}
                </div>
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
                <Mail className="h-4 w-4 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-500">Email</p>
                  <p data-testid="text-email">{displayUser.email || 'Not provided'}</p>
                </div>
              </div>
              
              <Separator />
              
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-500">Mobile</p>
                  <p data-testid="text-mobile">{displayUser.mobile || 'Not provided'}</p>
                </div>
              </div>
              
              <Separator />
              
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-500">Address</p>
                  <p data-testid="text-address">{displayUser.homeAddress || 'Not provided'}</p>
                </div>
              </div>
              
              <Separator />
              
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-500">Department</p>
                  <p data-testid="text-department">{departmentName || 'Not assigned'}</p>
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
                <div className="space-y-4">
                  {leaveBalances.map((balance: LeaveBalance) => {
                    const carryOver = (balance as any).carryOverDays as number | undefined;
                    const carryOverExpiry = (balance as any).carryOverExpiry as string | null | undefined;
                    const available = (balance.total ?? 0) - (balance.taken ?? 0) - (balance.pending ?? 0);
                    return (
                      <div key={balance.id} className="space-y-0.5" data-testid={`leave-balance-${balance.id}`}>
                        <div className="flex justify-between items-center">
                          <span className="font-medium capitalize">{balance.leaveType.replace('_', ' ')}</span>
                          <div className="text-right">
                            <span className="text-green-600 font-bold">{available}</span>
                            <span className="text-gray-500 text-sm"> / {balance.total} days</span>
                          </div>
                        </div>
                        {!!carryOver && carryOver > 0 && (
                          <p className="text-xs text-amber-600">
                            +{carryOver} carried over
                            {carryOverExpiry && ` (expires ${new Date(carryOverExpiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })})`}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-500">No leave balances found.</p>
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
                  <div 
                    key={record.id} 
                    className="flex justify-between items-center p-3 bg-gray-50 rounded-lg"
                    data-testid={`attendance-record-${record.id}`}
                  >
                    <div>
                      <Badge variant={record.type === 'in' ? 'default' : 'secondary'}>
                        Clock {record.type === 'in' ? 'In' : 'Out'}
                      </Badge>
                    </div>
                    <span className="text-gray-600">
                      {format(new Date(record.timestamp), "d MMM yyyy 'at' h:mm a")}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No recent attendance records.</p>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-center">
          <Button 
            variant="outline" 
            onClick={() => setLocation("/dashboard")}
            data-testid="button-back-to-dashboard"
          >
            Back to Dashboard
          </Button>
        </div>
      </main>
    </div>
  );
}
