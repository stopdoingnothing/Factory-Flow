import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, CheckCircle2, X } from 'lucide-react';
import { employeeTypeApi } from '@/lib/api';
import type { EmployeeType } from '@shared/schema';
import { useToast } from "@/hooks/use-toast";

export default function EmployeeTypesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: employeeTypes = [] } = useQuery({
    queryKey: ['employeeTypes'],
    queryFn: employeeTypeApi.getAll,
  });

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
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
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
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const deleteTypeMutation = useMutation({
    mutationFn: employeeTypeApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employeeTypes'] });
      toast({ title: "Employee Type Deleted", description: "Employee type has been removed." });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const handleSaveType = () => {
    if (!currentType.name) {
      toast({ variant: "destructive", title: "Error", description: "Type name is required" });
      return;
    }

    if (isEditingType && currentType.id) {
      updateTypeMutation.mutate({
        id: currentType.id,
        name: currentType.name,
        description: currentType.description || null,
        leaveLabel: currentType.leaveLabel || 'leave',
        hasLeaveEntitlement: currentType.hasLeaveEntitlement || 'true',
        isPermanent: currentType.isPermanent || 'yes',
      });
    } else {
      createTypeMutation.mutate({
        name: currentType.name,
        description: currentType.description || undefined,
        leaveLabel: currentType.leaveLabel || 'leave',
        hasLeaveEntitlement: currentType.hasLeaveEntitlement || 'true',
        isPermanent: currentType.isPermanent || 'yes',
      });
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

  const handleDeleteType = (id: number) => {
    deleteTypeMutation.mutate(id);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground">Employee Types</h1>
          <p className="text-muted-foreground">Manage employee classifications and their leave settings</p>
        </div>
        <Button onClick={handleOpenCreateType} data-testid="button-create-type">
          <Plus className="h-4 w-4 mr-2" /> Add Employee Type
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Employee Types</CardTitle>
          <CardDescription>Define different categories of personnel (e.g., permanent, contractor, consultant)</CardDescription>
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
                    {type.isDefault === 'true' && (
                      <Badge variant="outline">Default</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenEditType(type)} data-testid={`button-edit-type-${type.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleDeleteType(type.id)}
                      data-testid={`button-delete-type-${type.id}`}
                      disabled={type.isDefault === 'true'}
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
                onChange={(e) => setCurrentType({...currentType, name: e.target.value})}
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
                onChange={(e) => setCurrentType({...currentType, description: e.target.value})}
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
                  onValueChange={(value) => setCurrentType({...currentType, leaveLabel: value})}
                >
                  <SelectTrigger data-testid="select-leave-label">
                    <SelectValue placeholder="Select leave label" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="leave">Leave (for permanent staff)</SelectItem>
                    <SelectItem value="unavailable">Unavailable (for contractors)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  "Leave" for permanent staff, "Unavailable" for contractors
                </p>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="hasLeaveEntitlement" className="text-right">Has Leave Entitlement</Label>
              <div className="col-span-3 flex items-center gap-2">
                <Switch 
                  id="hasLeaveEntitlement"
                  checked={currentType.hasLeaveEntitlement === 'true'}
                  onCheckedChange={(checked) => setCurrentType({...currentType, hasLeaveEntitlement: checked ? 'true' : 'false'})}
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
                  onCheckedChange={(checked) => setCurrentType({...currentType, isPermanent: checked ? 'yes' : 'no'})}
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
