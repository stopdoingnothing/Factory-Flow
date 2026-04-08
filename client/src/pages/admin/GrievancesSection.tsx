import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquareWarning, Eye, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from "@/hooks/use-toast";
import { grievanceApi, userApi } from '@/lib/api';
import type { Grievance } from '@shared/schema';

export function GrievancesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: grievances = [] } = useQuery({
    queryKey: ['grievances'],
    queryFn: () => grievanceApi.getAll(),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: userApi.getAll,
  });

  const [isGrievanceDialogOpen, setIsGrievanceDialogOpen] = useState(false);
  const [selectedGrievance, setSelectedGrievance] = useState<Grievance | null>(null);
  const [grievanceNotes, setGrievanceNotes] = useState('');
  const [grievanceResolution, setGrievanceResolution] = useState('');

  const updateGrievanceStatusMutation = useMutation({
    mutationFn: ({ id, status, adminNotes, resolution }: { id: number; status: string; adminNotes?: string; resolution?: string }) =>
      grievanceApi.updateStatus(id, status, adminNotes, resolution),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grievances'] });
      setIsGrievanceDialogOpen(false);
      setSelectedGrievance(null);
      setGrievanceNotes('');
      setGrievanceResolution('');
      toast({ title: "Grievance Updated", description: "The grievance status has been updated." });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to update grievance" });
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-heading font-bold text-foreground">Grievances</h1>
        <p className="text-muted-foreground">Review and manage employee grievances and complaints</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Grievances</CardTitle>
          <CardDescription>Employee complaints and concerns requiring attention</CardDescription>
        </CardHeader>
        <CardContent>
          {grievances.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquareWarning className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No grievances have been submitted yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Against</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grievances.map((grievance) => {
                  const employee = users.find(u => u.id === grievance.userId);
                  const targetEmployee = grievance.targetEmployeeId ? users.find(u => u.id === grievance.targetEmployeeId) : null;
                  return (
                    <TableRow key={grievance.id}>
                      <TableCell className="text-sm">
                        {format(new Date(grievance.submittedAt), 'd MMM yyyy')}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{employee?.firstName} {employee?.surname}</div>
                        <div className="text-xs text-muted-foreground">{employee?.id}</div>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{grievance.title}</TableCell>
                      <TableCell className="capitalize">{grievance.category.replace('_', ' ')}</TableCell>
                      <TableCell>
                        {grievance.targetType === 'company' ? (
                          <Badge variant="outline">Company</Badge>
                        ) : (
                          <span className="text-sm">{targetEmployee?.firstName} {targetEmployee?.surname}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={
                          grievance.priority === 'urgent' ? 'bg-destructive/10 text-destructive' :
                          grievance.priority === 'high' ? 'bg-status-warning-muted text-status-warning' :
                          grievance.priority === 'normal' ? 'bg-status-info-muted text-status-info' :
                          'bg-status-neutral-muted text-status-neutral'
                        }>
                          {grievance.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={
                          grievance.status === 'submitted' ? 'bg-status-warning-muted text-status-warning' :
                          grievance.status === 'in_review' ? 'bg-status-info-muted text-status-info' :
                          grievance.status === 'resolved' ? 'bg-status-success-muted text-status-success' :
                          grievance.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                          'bg-status-neutral-muted text-status-neutral'
                        }>
                          {grievance.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedGrievance(grievance);
                            setGrievanceNotes(grievance.adminNotes || '');
                            setGrievanceResolution(grievance.resolution || '');
                            setIsGrievanceDialogOpen(true);
                          }}
                          data-testid={`button-view-grievance-${grievance.id}`}
                        >
                          <Eye className="h-4 w-4" />
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

      {/* Grievance Review Dialog */}
      <Dialog open={isGrievanceDialogOpen} onOpenChange={setIsGrievanceDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Grievance Details</DialogTitle>
            <DialogDescription>Review and update this employee grievance</DialogDescription>
          </DialogHeader>
          {selectedGrievance && (() => {
            const employee = users.find(u => u.id === selectedGrievance.userId);
            const targetEmployee = selectedGrievance.targetEmployeeId ? users.find(u => u.id === selectedGrievance.targetEmployeeId) : null;
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground text-sm">Submitted By</Label>
                    <p className="font-medium">{employee?.firstName} {employee?.surname}</p>
                    <p className="text-xs text-muted-foreground">{employee?.id}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">Date Submitted</Label>
                    <p className="font-medium">{format(new Date(selectedGrievance.submittedAt), 'd MMMM yyyy h:mm a')}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">Target</Label>
                    <p className="font-medium">
                      {selectedGrievance.targetType === 'company' ? 'The Company' : `${targetEmployee?.firstName} ${targetEmployee?.surname}`}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">Category</Label>
                    <p className="font-medium capitalize">{selectedGrievance.category.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">Priority</Label>
                    <Badge className={
                      selectedGrievance.priority === 'urgent' ? 'bg-destructive/10 text-destructive' :
                      selectedGrievance.priority === 'high' ? 'bg-status-warning-muted text-status-warning' :
                      selectedGrievance.priority === 'normal' ? 'bg-status-info-muted text-status-info' :
                      'bg-status-neutral-muted text-status-neutral'
                    }>
                      {selectedGrievance.priority}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">Status</Label>
                    <Badge className={
                      selectedGrievance.status === 'submitted' ? 'bg-status-warning-muted text-status-warning' :
                      selectedGrievance.status === 'in_review' ? 'bg-status-info-muted text-status-info' :
                      selectedGrievance.status === 'resolved' ? 'bg-status-success-muted text-status-success' :
                      selectedGrievance.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                      'bg-status-neutral-muted text-status-neutral'
                    }>
                      {selectedGrievance.status.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>

                <div>
                  <Label className="text-muted-foreground text-sm">Title</Label>
                  <p className="font-medium">{selectedGrievance.title}</p>
                </div>

                <div>
                  <Label className="text-muted-foreground text-sm">Description</Label>
                  <div className="mt-1 p-3 bg-muted/50 rounded-lg border whitespace-pre-wrap">
                    {selectedGrievance.description}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="grievanceNotes">Admin Notes</Label>
                  <Textarea
                    id="grievanceNotes"
                    placeholder="Add internal notes about this grievance..."
                    value={grievanceNotes}
                    onChange={(e) => setGrievanceNotes(e.target.value)}
                    className="min-h-[80px]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="grievanceResolution">Resolution (if resolved)</Label>
                  <Textarea
                    id="grievanceResolution"
                    placeholder="Describe how this grievance was resolved..."
                    value={grievanceResolution}
                    onChange={(e) => setGrievanceResolution(e.target.value)}
                    className="min-h-[80px]"
                  />
                </div>

                <div className="flex justify-between pt-4 border-t">
                  <div className="flex gap-2">
                    {selectedGrievance.status === 'submitted' && (
                      <Button
                        variant="outline"
                        onClick={() => updateGrievanceStatusMutation.mutate({
                          id: selectedGrievance.id,
                          status: 'in_review',
                          adminNotes: grievanceNotes || undefined,
                        })}
                      >
                        Mark In Review
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => updateGrievanceStatusMutation.mutate({
                        id: selectedGrievance.id,
                        status: 'rejected',
                        adminNotes: grievanceNotes || undefined,
                      })}
                    >
                      <X className="mr-2 h-4 w-4" /> Reject
                    </Button>
                    <Button
                      className="bg-status-success hover:bg-status-success/80 text-white"
                      onClick={() => updateGrievanceStatusMutation.mutate({
                        id: selectedGrievance.id,
                        status: 'resolved',
                        adminNotes: grievanceNotes || undefined,
                        resolution: grievanceResolution || undefined,
                      })}
                    >
                      <Check className="mr-2 h-4 w-4" /> Mark Resolved
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
