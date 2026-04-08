import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { departmentApi, userApi } from '@/lib/api';
import type { Department, User } from '@shared/schema';
import { useToast } from "@/hooks/use-toast";

export default function DepartmentsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Queries
  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: departmentApi.getAll,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: userApi.getAll,
  });

  // State
  const [isDeptDialogOpen, setIsDeptDialogOpen] = useState(false);
  const [currentDept, setCurrentDept] = useState<Partial<Department>>({});
  const [isEditingDept, setIsEditingDept] = useState(false);

  // Mutations
  const createDeptMutation = useMutation({
    mutationFn: departmentApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast({ title: "Department Created", description: "Department has been added successfully." });
      setIsDeptDialogOpen(false);
      setCurrentDept({});
      setIsEditingDept(false);
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
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
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const deleteDeptMutation = useMutation({
    mutationFn: departmentApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast({ title: "Department Deleted", description: "Department has been removed." });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  // Handlers
  const handleSaveDept = () => {
    if (!currentDept.name) {
      toast({ variant: "destructive", title: "Error", description: "Department name is required" });
      return;
    }

    if (isEditingDept && currentDept.id) {
      updateDeptMutation.mutate({ id: currentDept.id, name: currentDept.name, description: currentDept.description });
    } else {
      createDeptMutation.mutate({ name: currentDept.name, description: currentDept.description || undefined });
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

  const handleDeleteDept = (id: number) => {
    deleteDeptMutation.mutate(id);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-heading font-bold text-foreground">Departments</h1>
        <p className="text-muted-foreground">Manage departments for employee organization</p>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Departments</CardTitle>
            <CardDescription>Manage departments for employee organization</CardDescription>
          </div>
          <Button onClick={handleOpenCreateDept} className="btn-industrial bg-primary text-white" data-testid="button-add-department">
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
                          onClick={() => handleDeleteDept(dept.id)}
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
                onChange={(e) => setCurrentDept({...currentDept, name: e.target.value})}
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
                onChange={(e) => setCurrentDept({...currentDept, description: e.target.value})}
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
    </div>
  );
}
