import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Save, CheckCircle2, X } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { orgPositionApi, departmentApi, userApi, employeeTypeApi } from '@/lib/api';
import type { OrgPosition, Department, User, EmployeeType } from '@shared/schema';

export default function OrgPositionsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Shared queries ──────────────────────────────────────────────────────────
  const { data: orgPositions = [] } = useQuery<OrgPosition[]>({
    queryKey: ['org-positions'],
    queryFn: () => orgPositionApi.getAll(),
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: departmentApi.getAll,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: userApi.getAll,
  });

  const { data: employeeTypes = [] } = useQuery<EmployeeType[]>({
    queryKey: ['employeeTypes'],
    queryFn: employeeTypeApi.getAll,
  });

  // ── Positions state & mutations ─────────────────────────────────────────────
  const [positionDialogOpen, setPositionDialogOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<OrgPosition | null>(null);
  const [positionForm, setPositionForm] = useState({ title: '', department: '', parentPositionId: '', sortOrder: '0', isOutsourced: false, tier: '1' });

  const createPositionMutation = useMutation({
    mutationFn: (data: any) => orgPositionApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-positions'] });
      setPositionDialogOpen(false);
      toast({ title: "Position Created", description: "Org position has been added." });
    },
  });

  const updatePositionMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => orgPositionApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-positions'] });
      setPositionDialogOpen(false);
      toast({ title: "Position Updated", description: "Org position has been updated." });
    },
  });

  const deletePositionMutation = useMutation({
    mutationFn: (id: number) => orgPositionApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-positions'] });
      toast({ title: "Position Deleted", description: "Org position has been removed." });
    },
  });

  const handleOpenCreatePosition = () => {
    setEditingPosition(null);
    setPositionForm({ title: '', department: '', parentPositionId: '', sortOrder: '0', isOutsourced: false, tier: '1' });
    setPositionDialogOpen(true);
  };

  const handleOpenEditPosition = (pos: OrgPosition) => {
    setEditingPosition(pos);
    setPositionForm({
      title: pos.title,
      department: pos.department || '',
      parentPositionId: pos.parentPositionId ? String(pos.parentPositionId) : '',
      sortOrder: String(pos.sortOrder || 0),
      isOutsourced: (pos as any).isOutsourced || false,
      tier: String((pos as any).tier || 1),
    });
    setPositionDialogOpen(true);
  };

  const handleSavePosition = () => {
    if (!positionForm.title) {
      toast({ variant: 'destructive', title: 'Error', description: 'Position title is required' });
      return;
    }
    const payload = {
      title: positionForm.title,
      department: positionForm.department || null,
      parentPositionId: positionForm.parentPositionId ? parseInt(positionForm.parentPositionId) : null,
      sortOrder: parseInt(positionForm.sortOrder) || 0,
      isOutsourced: positionForm.isOutsourced,
      tier: parseInt(positionForm.tier) || 1,
    };
    if (editingPosition) {
      updatePositionMutation.mutate({ id: editingPosition.id, ...payload });
    } else {
      createPositionMutation.mutate(payload);
    }
  };

  const handleDeletePosition = (id: number) => {
    if (window.confirm('Are you sure you want to delete this position?')) {
      deletePositionMutation.mutate(id);
    }
  };

  const isManagerPosition = (title: string) => /manager|director|assistant|supervisor/i.test(title);
  const managerPositions = [...orgPositions].filter(p => isManagerPosition(p.title)).sort((a, b) => a.title.localeCompare(b.title));
  const staffPositions = [...orgPositions].filter(p => !isManagerPosition(p.title)).sort((a, b) => a.title.localeCompare(b.title));

  const renderPositionTable = (positions: OrgPosition[], label: string) => (
    <Card>
      <CardHeader>
        <CardTitle>{label} ({positions.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Parent Position</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Assigned Employee(s)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((pos) => {
              const parentPos = orgPositions.find(p => p.id === pos.parentPositionId);
              const assignedUsers = users.filter(u => u.orgPositionId === pos.id && !u.terminationDate);
              const isFilled = assignedUsers.length > 0;
              const isOutsourced = !isFilled && (pos as any).isOutsourced;
              return (
                <TableRow key={pos.id} data-testid={`row-position-${pos.id}`}>
                  <TableCell className="font-medium">{pos.title}</TableCell>
                  <TableCell>{pos.department || '-'}</TableCell>
                  <TableCell>{parentPos ? parentPos.title : <span className="text-muted-foreground italic">Root</span>}</TableCell>
                  <TableCell>
                    {(() => {
                      const t = (pos as any).tier || 1;
                      return t > 1
                        ? <Badge variant="outline" className="text-xs">Tier {t}</Badge>
                        : <span className="text-muted-foreground text-xs">1</span>;
                    })()}
                  </TableCell>
                  <TableCell>
                    {isFilled ? (
                      <div className="space-y-0.5">
                        {assignedUsers
                          .sort((a, b) => `${a.firstName} ${a.surname}`.localeCompare(`${b.firstName} ${b.surname}`))
                          .map((u) => (
                            <div key={u.id} className="text-sm">{u.firstName} {u.surname}</div>
                          ))}
                      </div>
                    ) : isOutsourced ? (
                      <span className="text-status-warning italic">Outsourced</span>
                    ) : (
                      <span className="text-destructive italic">Vacant</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isFilled ? (
                      <Badge variant="default" className="bg-status-success text-white">{assignedUsers.length} assigned</Badge>
                    ) : isOutsourced ? (
                      <Badge className="bg-status-warning text-white">Outsourced</Badge>
                    ) : (
                      <Badge variant="destructive">Vacant</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenEditPosition(pos)} data-testid={`button-edit-position-${pos.id}`}>
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDeletePosition(pos.id)} data-testid={`button-delete-position-${pos.id}`}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  // ── Departments state & mutations ───────────────────────────────────────────
  const [isDeptDialogOpen, setIsDeptDialogOpen] = useState(false);
  const [currentDept, setCurrentDept] = useState<Partial<Department>>({});
  const [isEditingDept, setIsEditingDept] = useState(false);

  const createDeptMutation = useMutation({
    mutationFn: departmentApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast({ title: "Department Created", description: "Department has been added successfully." });
      setIsDeptDialogOpen(false);
      setCurrentDept({});
      setIsEditingDept(false);
    },
    onError: (error: Error) => toast({ variant: "destructive", title: "Error", description: error.message }),
  });

  const updateDeptMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => departmentApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast({ title: "Department Updated", description: "Department has been updated successfully." });
      setIsDeptDialogOpen(false);
      setCurrentDept({});
      setIsEditingDept(false);
    },
    onError: (error: Error) => toast({ variant: "destructive", title: "Error", description: error.message }),
  });

  const deleteDeptMutation = useMutation({
    mutationFn: departmentApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast({ title: "Department Deleted", description: "Department has been removed." });
    },
    onError: (error: Error) => toast({ variant: "destructive", title: "Error", description: error.message }),
  });

  const handleSaveDept = () => {
    if (!currentDept.name) {
      toast({ variant: "destructive", title: "Error", description: "Department name is required" });
      return;
    }
    if (isEditingDept && currentDept.id) {
      updateDeptMutation.mutate({ id: currentDept.id, name: currentDept.name, description: currentDept.description });
    } else {
      createDeptMutation.mutate({ name: currentDept.name!, description: currentDept.description || undefined });
    }
  };

  const handleOpenEditDept = (dept: Department) => {
    setCurrentDept(dept);
    setIsEditingDept(true);
    setIsDeptDialogOpen(true);
  };

  const handleOpenCreateDept = () => {
    setCurrentDept({});
    setIsEditingDept(false);
    setIsDeptDialogOpen(true);
  };

  // ── Employee Types state & mutations ────────────────────────────────────────
  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false);
  const [currentType, setCurrentType] = useState<Partial<EmployeeType>>({});
  const [isEditingType, setIsEditingType] = useState(false);

  const createTypeMutation = useMutation({
    mutationFn: employeeTypeApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employeeTypes'] });
      toast({ title: "Employee Type Created", description: "Employee type has been added successfully." });
      setIsTypeDialogOpen(false);
      setCurrentType({});
      setIsEditingType(false);
    },
    onError: (error: Error) => toast({ variant: "destructive", title: "Error", description: error.message }),
  });

  const updateTypeMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => employeeTypeApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employeeTypes'] });
      toast({ title: "Employee Type Updated", description: "Employee type has been updated successfully." });
      setIsTypeDialogOpen(false);
      setCurrentType({});
      setIsEditingType(false);
    },
    onError: (error: Error) => toast({ variant: "destructive", title: "Error", description: error.message }),
  });

  const deleteTypeMutation = useMutation({
    mutationFn: employeeTypeApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employeeTypes'] });
      toast({ title: "Employee Type Deleted", description: "Employee type has been removed." });
    },
    onError: (error: Error) => toast({ variant: "destructive", title: "Error", description: error.message }),
  });

  const handleSaveType = () => {
    if (!currentType.name) {
      toast({ variant: "destructive", title: "Error", description: "Type name is required" });
      return;
    }
    const payload = {
      name: currentType.name,
      description: currentType.description || null,
      leaveLabel: currentType.leaveLabel || 'leave',
      hasLeaveEntitlement: currentType.hasLeaveEntitlement || 'true',
      isPermanent: currentType.isPermanent || 'yes',
    };
    if (isEditingType && currentType.id) {
      updateTypeMutation.mutate({ id: currentType.id, ...payload });
    } else {
      createTypeMutation.mutate(payload as any);
    }
  };

  const handleOpenEditType = (type: EmployeeType) => {
    setCurrentType(type);
    setIsEditingType(true);
    setIsTypeDialogOpen(true);
  };

  const handleOpenCreateType = () => {
    setCurrentType({ leaveLabel: 'leave', hasLeaveEntitlement: 'true', isPermanent: 'yes' });
    setIsEditingType(false);
    setIsTypeDialogOpen(true);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-heading font-bold text-foreground">Organisation Setup</h1>
        <p className="text-muted-foreground">Manage positions, departments, and employee classifications.</p>
      </div>

      <Tabs defaultValue="positions">
        <TabsList className="mb-4">
          <TabsTrigger value="positions" data-testid="tab-positions">Org Positions</TabsTrigger>
          <TabsTrigger value="departments" data-testid="tab-departments">Departments</TabsTrigger>
          <TabsTrigger value="employee-types" data-testid="tab-employee-types">Employee Types</TabsTrigger>
        </TabsList>

        {/* ── Positions tab ─────────────────────────────────────────────────── */}
        <TabsContent value="positions" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Define the position-based hierarchy for the org chart. When positions exist, the org chart uses them instead of the manager-based tree.</p>
            <Button onClick={handleOpenCreatePosition} data-testid="button-add-position">
              <Plus className="h-4 w-4 mr-2" /> Add Position
            </Button>
          </div>

          {orgPositions.length === 0 ? (
            <Card>
              <CardContent className="py-8">
                <div className="text-center text-muted-foreground">
                  No positions defined yet. The org chart will use the manager-based hierarchy. Add positions to switch to a position-based org chart.
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {renderPositionTable(managerPositions, 'Manager Positions')}
              {renderPositionTable(staffPositions, 'Staff Positions')}
            </>
          )}
        </TabsContent>

        {/* ── Departments tab ───────────────────────────────────────────────── */}
        <TabsContent value="departments" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Departments</CardTitle>
                <CardDescription>Manage departments for employee organisation</CardDescription>
              </div>
              <Button onClick={handleOpenCreateDept} data-testid="button-add-department">
                <Plus className="mr-2 h-4 w-4" /> Add Department
              </Button>
            </CardHeader>
            <CardContent>
              {departments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No departments created yet. Click "Add Department" to create your first one.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Personnel</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {departments.map((dept) => {
                      const employeeCount = users.filter((u: User) => u.department === dept.name).length;
                      return (
                        <TableRow key={dept.id} data-testid={`row-department-${dept.id}`}>
                          <TableCell className="font-medium">{dept.name}</TableCell>
                          <TableCell className="text-muted-foreground">{dept.description || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{employeeCount}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenEditDept(dept)} data-testid={`button-edit-dept-${dept.id}`}>
                              <Pencil className="h-4 w-4 text-muted-foreground" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteDeptMutation.mutate(dept.id)}
                              disabled={employeeCount > 0}
                              title={employeeCount > 0 ? "Cannot delete department with personnel" : "Delete department"}
                              data-testid={`button-delete-dept-${dept.id}`}
                            >
                              <Trash2 className={`h-4 w-4 ${employeeCount > 0 ? 'text-muted-foreground/40' : 'text-destructive'}`} />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Employee Types tab ────────────────────────────────────────────── */}
        <TabsContent value="employee-types" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Employee Types</CardTitle>
                <CardDescription>Define different categories of personnel (e.g., permanent, contractor, consultant)</CardDescription>
              </div>
              <Button onClick={handleOpenCreateType} data-testid="button-create-type">
                <Plus className="h-4 w-4 mr-2" /> Add Employee Type
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Leave Label</TableHead>
                    <TableHead>Has Leave Entitlement</TableHead>
                    <TableHead>Default</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employeeTypes.map((type) => (
                    <TableRow key={type.id} data-testid={`row-type-${type.id}`}>
                      <TableCell className="font-medium">{type.name}</TableCell>
                      <TableCell>{type.description || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={type.leaveLabel === 'unavailable' ? 'secondary' : 'default'}>
                          {type.leaveLabel || 'leave'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {type.hasLeaveEntitlement === 'true' ? (
                          <CheckCircle2 className="h-4 w-4 text-status-success" />
                        ) : (
                          <X className="h-4 w-4 text-destructive" />
                        )}
                      </TableCell>
                      <TableCell>
                        {type.isDefault === 'true' && <Badge variant="outline">Default</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenEditType(type)} data-testid={`button-edit-type-${type.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteTypeMutation.mutate(type.id)}
                          disabled={type.isDefault === 'true'}
                          data-testid={`button-delete-type-${type.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Position Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={positionDialogOpen} onOpenChange={setPositionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPosition ? 'Edit Position' : 'Add Position'}</DialogTitle>
            <DialogDescription>
              {editingPosition ? 'Update the position details below.' : 'Create a new position in the org chart hierarchy.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="pos-title">Position Title *</Label>
              <Input
                id="pos-title"
                value={positionForm.title}
                onChange={(e) => setPositionForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. General Manager, Mechanical Supervisor"
                data-testid="input-position-title"
              />
            </div>
            <div>
              <Label htmlFor="pos-department">Department</Label>
              <SearchableSelect
                value={positionForm.department || "__none__"}
                onValueChange={(v) => setPositionForm(f => ({ ...f, department: v === '__none__' ? '' : v }))}
                options={[
                  { value: '__none__', label: 'No Department' },
                  ...departments.map(d => ({ value: d.name, label: d.name })),
                ]}
                placeholder="Select department"
              />
            </div>
            <div>
              <Label htmlFor="pos-parent">Parent Position</Label>
              <SearchableSelect
                value={positionForm.parentPositionId || "__none__"}
                onValueChange={(v) => setPositionForm(f => ({ ...f, parentPositionId: v === '__none__' ? '' : v }))}
                options={[
                  { value: '__none__', label: 'None (Root Position)' },
                  ...orgPositions
                    .filter(p => !editingPosition || p.id !== editingPosition.id)
                    .map(p => ({ value: String(p.id), label: `${p.title}${p.department ? ` (${p.department})` : ''}` })),
                ]}
                placeholder="None (Root Position)"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground bg-status-info-muted border border-status-info/30 rounded p-2">
                Employees are assigned to positions from the employee edit page, not here. This page is for defining position names and hierarchy only.
              </p>
            </div>
            <div className="flex items-start gap-3 p-3 border rounded-lg bg-status-warning-muted border-status-warning/30">
              <Checkbox
                id="pos-outsourced"
                checked={positionForm.isOutsourced}
                onCheckedChange={(checked) => setPositionForm(f => ({ ...f, isOutsourced: !!checked }))}
                data-testid="checkbox-position-outsourced"
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="pos-outsourced" className="font-medium cursor-pointer">Mark as Outsourced</Label>
                <p className="text-xs text-muted-foreground mt-0.5">When no employee is assigned, the org chart will show this position as "Outsourced" (amber) instead of "Vacant" (red).</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="pos-sort">Sort Order</Label>
                <Input
                  id="pos-sort"
                  type="number"
                  value={positionForm.sortOrder}
                  onChange={(e) => setPositionForm(f => ({ ...f, sortOrder: e.target.value }))}
                  placeholder="0"
                  data-testid="input-position-sort"
                />
                <p className="text-xs text-muted-foreground mt-1">Lower = left among siblings</p>
              </div>
              <div>
                <Label htmlFor="pos-tier">Org Chart Tier</Label>
                <Select value={positionForm.tier} onValueChange={(v) => setPositionForm(f => ({ ...f, tier: v }))}>
                  <SelectTrigger id="pos-tier" data-testid="select-position-tier">
                    <SelectValue placeholder="Tier 1 (normal)" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(t => (
                      <SelectItem key={t} value={String(t)}>
                        Tier {t}{t === 1 ? ' (normal)' : ` (${t - 1} row${t - 1 > 1 ? 's' : ''} lower)`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Higher = pushed down in chart</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPositionDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePosition} data-testid="button-save-position">
              <Save className="h-4 w-4 mr-2" /> {editingPosition ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Department Dialog ────────────────────────────────────────────────── */}
      <Dialog open={isDeptDialogOpen} onOpenChange={setIsDeptDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditingDept ? 'Edit Department' : 'Add New Department'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="deptName" className="text-right">Name</Label>
              <Input
                id="deptName"
                value={currentDept.name || ''}
                onChange={(e) => setCurrentDept({ ...currentDept, name: e.target.value })}
                className="col-span-3"
                placeholder="e.g., Assembly Line"
                data-testid="input-dept-name"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="deptDesc" className="text-right">Description</Label>
              <Input
                id="deptDesc"
                value={currentDept.description || ''}
                onChange={(e) => setCurrentDept({ ...currentDept, description: e.target.value })}
                className="col-span-3"
                placeholder="Optional description"
                data-testid="input-dept-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveDept} data-testid="button-save-department">
              {isEditingDept ? 'Save Changes' : 'Create Department'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Employee Type Dialog ─────────────────────────────────────────────── */}
      <Dialog open={isTypeDialogOpen} onOpenChange={setIsTypeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditingType ? 'Edit Employee Type' : 'Add New Employee Type'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="typeName" className="text-right">Name</Label>
              <Input
                id="typeName"
                value={currentType.name || ''}
                onChange={(e) => setCurrentType({ ...currentType, name: e.target.value })}
                className="col-span-3"
                placeholder="e.g., Permanent Employee"
                data-testid="input-type-name"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="typeDesc" className="text-right">Description</Label>
              <Input
                id="typeDesc"
                value={currentType.description || ''}
                onChange={(e) => setCurrentType({ ...currentType, description: e.target.value })}
                className="col-span-3"
                placeholder="Optional description"
                data-testid="input-type-description"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="leaveLabel" className="text-right">Leave Label</Label>
              <div className="col-span-3">
                <Select
                  value={currentType.leaveLabel || 'leave'}
                  onValueChange={(value) => setCurrentType({ ...currentType, leaveLabel: value })}
                >
                  <SelectTrigger data-testid="select-leave-label">
                    <SelectValue placeholder="Select leave label" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="leave">Leave (for permanent staff)</SelectItem>
                    <SelectItem value="unavailable">Unavailable (for contractors)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">"Leave" for permanent staff, "Unavailable" for contractors</p>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="hasLeaveEntitlement" className="text-right">Has Leave Entitlement</Label>
              <div className="col-span-3 flex items-center gap-2">
                <Switch
                  id="hasLeaveEntitlement"
                  checked={currentType.hasLeaveEntitlement === 'true'}
                  onCheckedChange={(checked) => setCurrentType({ ...currentType, hasLeaveEntitlement: checked ? 'true' : 'false' })}
                  data-testid="switch-has-leave"
                />
                <span className="text-sm text-muted-foreground">
                  {currentType.hasLeaveEntitlement === 'true' ? 'Yes - Can accrue leave' : 'No - Cannot accrue leave'}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="isPermanent" className="text-right">Permanent Position</Label>
              <div className="col-span-3 flex items-center gap-2">
                <Switch
                  id="isPermanent"
                  checked={currentType.isPermanent === 'yes'}
                  onCheckedChange={(checked) => setCurrentType({ ...currentType, isPermanent: checked ? 'yes' : 'no' })}
                  data-testid="switch-is-permanent"
                />
                <span className="text-sm text-muted-foreground">
                  {currentType.isPermanent === 'yes' ? 'Yes - No contract end date required' : 'No - Requires contract end date'}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveType} data-testid="button-save-type">
              {isEditingType ? 'Save Changes' : 'Create Employee Type'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
