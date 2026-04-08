import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Building } from 'lucide-react';
import { companyApi, userApi } from '@/lib/api';
import { useToast } from "@/hooks/use-toast";

type Company = {
  id: number;
  name: string;
  registrationNumber?: string | null;
  description?: string | null;
};

export default function CompaniesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ['companies'],
    queryFn: companyApi.getAll,
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ['users'],
    queryFn: userApi.getAll,
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [current, setCurrent] = useState<Partial<Company>>({});
  const [isEditing, setIsEditing] = useState(false);

  const createMutation = useMutation({
    mutationFn: companyApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast({ title: "Company Created", description: "Company has been added successfully." });
      setIsDialogOpen(false);
      setCurrent({});
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => companyApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: "Company Updated", description: "Company has been updated successfully." });
      setIsDialogOpen(false);
      setCurrent({});
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: companyApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      toast({ title: "Company Deleted", description: "Company has been removed." });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const handleSave = () => {
    if (!current.name?.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Company name is required" });
      return;
    }
    if (isEditing && current.id) {
      updateMutation.mutate({ id: current.id, name: current.name, registrationNumber: current.registrationNumber, description: current.description });
    } else {
      createMutation.mutate({ name: current.name!, registrationNumber: current.registrationNumber || undefined, description: current.description || undefined });
    }
  };

  const handleOpenEdit = (company: Company) => {
    setCurrent(company);
    setIsEditing(true);
    setIsDialogOpen(true);
  };

  const handleOpenCreate = () => {
    setCurrent({});
    setIsEditing(false);
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-heading font-bold text-foreground">Companies</h1>
        <p className="text-muted-foreground">Manage payroll companies that employees are assigned to</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Companies</CardTitle>
            <CardDescription>Create and manage payroll companies</CardDescription>
          </div>
          <Button onClick={handleOpenCreate} className="btn-industrial bg-primary text-white" data-testid="button-add-company">
            <Plus className="mr-2 h-4 w-4" /> Add Company
          </Button>
        </CardHeader>
        <CardContent>
          {companies.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No companies created yet. Click "Add Company" to create your first one.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Reg. Number</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Employees</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((company) => {
                  const count = users.filter((u: any) => u.companyId === company.id).length;
                  return (
                    <TableRow key={company.id} data-testid={`row-company-${company.id}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4 text-muted-foreground" />
                          {company.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{company.registrationNumber || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{company.description || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{count}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(company)} data-testid={`button-edit-company-${company.id}`}>
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(company.id)}
                          disabled={count > 0}
                          title={count > 0 ? "Cannot delete a company that has employees assigned" : "Delete company"}
                          data-testid={`button-delete-company-${company.id}`}
                        >
                          <Trash2 className={`h-4 w-4 ${count > 0 ? 'text-muted-foreground/40' : 'text-destructive'}`} />
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Company' : 'Add New Company'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="companyName" className="text-right">Name *</Label>
              <Input
                id="companyName"
                value={current.name || ''}
                onChange={(e) => setCurrent({ ...current, name: e.target.value })}
                className="col-span-3"
                placeholder="e.g., ABC Manufacturing (Pty) Ltd"
                data-testid="input-company-name"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="companyReg" className="text-right">Reg. Number</Label>
              <Input
                id="companyReg"
                value={current.registrationNumber || ''}
                onChange={(e) => setCurrent({ ...current, registrationNumber: e.target.value })}
                className="col-span-3"
                placeholder="e.g., 2001/012345/07"
                data-testid="input-company-registration"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="companyDesc" className="text-right">Description</Label>
              <Input
                id="companyDesc"
                value={current.description || ''}
                onChange={(e) => setCurrent({ ...current, description: e.target.value })}
                className="col-span-3"
                placeholder="Optional description"
                data-testid="input-company-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} data-testid="button-save-company">
              {isEditing ? 'Save Changes' : 'Create Company'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
