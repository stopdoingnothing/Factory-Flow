import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from '@/components/ui/searchable-select';
import { userApi, departmentApi, leaveBalanceApi } from '@/lib/api';
import type { User, Department, LeaveBalance } from '@shared/schema';
import { Search } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { formatDateForDisplay, getEmploymentDuration, getRoleLabel, userHasRole } from './utils';

export default function MyTeamSection() {
  const { user } = useAuth();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'terminated'>('active');
  const [departmentFilter, setDepartmentFilter] = useState('');

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => userApi.getAll(),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentApi.getAll(),
  });

  const { data: leaveBalances = [] } = useQuery({
    queryKey: ['leave-balances'],
    queryFn: () => leaveBalanceApi.getAll(),
  });

  // Filter to direct reports only — position-based takes precedence over managerId
  const teamMembers = (allUsers as User[]).filter((u) => {
    if ((u as any).reportsToPositionId != null) {
      return (user as any)?.orgPositionId != null &&
        (u as any).reportsToPositionId === (user as any).orgPositionId;
    }
    // A self-reporting employee is not a member of their own team
    return u.managerId === user?.id && u.id !== user?.id;
  });

  const filtered = teamMembers
    .filter((u) => {
      if (statusFilter === 'active') return !u.terminationDate && !(u as any).excludeFromLeave;
      if (statusFilter === 'terminated') return !!u.terminationDate;
      return true;
    })
    .filter((u) => {
      if (!departmentFilter) return true;
      return u.department?.toString() === departmentFilter;
    })
    .filter((u) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        u.firstName?.toLowerCase().includes(q) ||
        u.surname?.toLowerCase().includes(q) ||
        u.id?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        (u.mobile || '').toLowerCase().includes(q)
      );
    });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-heading font-bold text-foreground">My Team</h1>
        <p className="text-muted-foreground">Your direct reports</p>
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>My Team</CardTitle>
              <CardDescription>Your direct reports</CardDescription>
            </div>
          </div>
          <div className="flex gap-4 mt-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, ID, email, or mobile..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 max-w-sm"
                />
              </div>
            </div>
            <SearchableSelect
              value={departmentFilter || 'all'}
              onValueChange={(v) => setDepartmentFilter(v === 'all' ? '' : v)}
              options={[
                { value: 'all', label: 'All Departments' },
                ...departments.map((d: Department) => ({ value: d.name, label: d.name })),
              ]}
              placeholder="Department"
              className="w-40"
            />
            <Select value={statusFilter} onValueChange={(v: 'all' | 'active' | 'terminated') => setStatusFilter(v)}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No team members found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Number</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Tenure</TableHead>
                  <TableHead>Leave Balance</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((emp) => {
                  const empBalances = (leaveBalances as LeaveBalance[]).filter((b) => b.userId === emp.id);
                  const annualBalance = empBalances.find((b) => b.leaveType === 'Annual Leave');
                  const totalAvailable = annualBalance
                    ? Math.round(((annualBalance.total ?? 0) + (annualBalance.carryOverDays ?? 0) - (annualBalance.taken ?? 0) - (annualBalance.pending ?? 0)) * 10) / 10
                    : 0;
                  return (
                    <TableRow key={emp.id}>
                      <TableCell className="font-mono font-medium">{emp.id}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full overflow-hidden bg-muted">
                            <img src={emp.photoUrl || 'https://github.com/shadcn.png'} alt={`${emp.firstName} ${emp.surname}`} className="h-full w-full object-cover" />
                          </div>
                          {emp.firstName} {emp.surname}
                        </div>
                      </TableCell>
                      <TableCell>{emp.department || '-'}</TableCell>
                      <TableCell>
                        <span className="text-sm" title={emp.startDate ? `Started: ${formatDateForDisplay(emp.startDate)}` : 'Start date not set'}>
                          {getEmploymentDuration(emp.startDate)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {annualBalance ? (
                          <Badge variant={totalAvailable > 5 ? 'default' : totalAvailable > 0 ? 'secondary' : 'destructive'}>
                            {totalAvailable} days annual leave
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">Not set</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={userHasRole(emp, 'manager') ? 'default' : 'secondary'}>
                          {getRoleLabel(emp)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
