import React, { useState } from 'react';
import { formatDateForDisplay, parseDateFromDisplay } from './utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from "@/hooks/use-toast";
import { publicHolidayApi } from '@/lib/api';
import type { PublicHoliday } from '@shared/schema';

export default function PublicHolidaysSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: publicHolidays = [] } = useQuery({
    queryKey: ['public-holidays'],
    queryFn: () => publicHolidayApi.getAll(),
  });

  const [isHolidayDialogOpen, setIsHolidayDialogOpen] = useState(false);
  const [currentHoliday, setCurrentHoliday] = useState<Partial<PublicHoliday>>({});
  const [isEditingHoliday, setIsEditingHoliday] = useState(false);

  const createHolidayMutation = useMutation({
    mutationFn: (data: any) => publicHolidayApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-holidays'] });
      setIsHolidayDialogOpen(false);
      toast({ title: "Holiday Created", description: "Public holiday has been added." });
    },
  });

  const updateHolidayMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => publicHolidayApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-holidays'] });
      setIsHolidayDialogOpen(false);
      toast({ title: "Holiday Updated", description: "Public holiday has been updated." });
    },
  });

  const deleteHolidayMutation = useMutation({
    mutationFn: (id: number) => publicHolidayApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-holidays'] });
      toast({ title: "Holiday Deleted", description: "Public holiday has been removed." });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground">Public Holidays</h1>
          <p className="text-muted-foreground">Manage public holidays that affect leave calculations</p>
        </div>
        <Button onClick={() => { setCurrentHoliday({}); setIsEditingHoliday(false); setIsHolidayDialogOpen(true); }} data-testid="add-holiday">
          <Plus className="h-4 w-4 mr-2" /> Add Holiday
        </Button>
      </div>
      
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Applies To</TableHead>
                <TableHead>Recurring</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(publicHolidays as PublicHoliday[]).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No public holidays configured. Add holidays to exclude them from leave calculations.
                  </TableCell>
                </TableRow>
              ) : (
                (publicHolidays as PublicHoliday[]).map((holiday: PublicHoliday) => (
                  <TableRow key={holiday.id} data-testid={`holiday-row-${holiday.id}`}>
                    <TableCell className="font-mono">
                      {format(new Date(holiday.date), 'dd/MM/yyyy')}
                    </TableCell>
                    <TableCell className="font-medium">{holiday.name}</TableCell>
                    <TableCell className="text-muted-foreground">{holiday.description || '-'}</TableCell>
                    <TableCell>
                      {holiday.religionGroup ? (() => {
                        const cls: Record<string, string> = {
                          muslim: 'bg-status-success-muted text-status-success border-status-success/30',
                          jewish: 'bg-status-info-muted text-status-info border-status-info/30',
                          christian: 'bg-status-neutral-muted text-status-neutral border-status-neutral/30',
                          hindu: 'bg-status-warning-muted text-status-warning border-status-warning/30',
                        };
                        return (
                          <Badge className={cls[holiday.religionGroup!] || 'bg-muted text-muted-foreground'}>
                            {holiday.religionGroup!.charAt(0).toUpperCase() + holiday.religionGroup!.slice(1)} only
                          </Badge>
                        );
                      })() : (
                        <Badge variant="outline" className="text-muted-foreground">Everyone</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {holiday.isRecurring ? (
                        <Badge variant="secondary">Annual</Badge>
                      ) : (
                        <Badge variant="outline">One-time</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setCurrentHoliday(holiday);
                            setIsEditingHoliday(true);
                            setIsHolidayDialogOpen(true);
                          }}
                          data-testid={`edit-holiday-${holiday.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => {
                            if (window.confirm('Are you sure you want to delete this holiday?')) {
                              deleteHolidayMutation.mutate(holiday.id);
                            }
                          }}
                          data-testid={`delete-holiday-${holiday.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {/* Holiday Dialog */}
      <Dialog open={isHolidayDialogOpen} onOpenChange={setIsHolidayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditingHoliday ? 'Edit Holiday' : 'Add Public Holiday'}</DialogTitle>
            <DialogDescription>
              {isEditingHoliday ? 'Update the holiday details.' : 'Add a new public holiday to the system.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Holiday Name</Label>
              <Input
                value={currentHoliday.name || ''}
                onChange={(e) => setCurrentHoliday({ ...currentHoliday, name: e.target.value })}
                placeholder="e.g. New Year's Day"
                data-testid="holiday-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="text"
                placeholder="dd/mm/yyyy"
                value={formatDateForDisplay(currentHoliday.date)}
                onChange={(e) => setCurrentHoliday({ ...currentHoliday, date: parseDateFromDisplay(e.target.value) })}
                data-testid="holiday-date"
              />
            </div>
            <div className="space-y-2">
              <Label>Description (Optional)</Label>
              <Input
                value={currentHoliday.description || ''}
                onChange={(e) => setCurrentHoliday({ ...currentHoliday, description: e.target.value })}
                placeholder="Brief description"
                data-testid="holiday-description"
              />
            </div>
            <div className="space-y-2">
              <Label>Applies To</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={currentHoliday.religionGroup || ''}
                onChange={(e) => setCurrentHoliday({ ...currentHoliday, religionGroup: e.target.value || null })}
                data-testid="holiday-religion-group"
              >
                <option value="">Everyone (public holiday)</option>
                <option value="christian">Christians only</option>
                <option value="muslim">Muslims only</option>
                <option value="jewish">Jewish employees only</option>
                <option value="hindu">Hindus only</option>
              </select>
              <p className="text-xs text-muted-foreground">Religious holidays only count for employees with the matching religion set on their profile.</p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={currentHoliday.isRecurring || false}
                onCheckedChange={(checked) => setCurrentHoliday({ ...currentHoliday, isRecurring: checked })}
                data-testid="holiday-recurring"
              />
              <Label>Recurring annually (same date each year)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsHolidayDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!currentHoliday.name || !currentHoliday.date) {
                  toast({ variant: 'destructive', title: 'Error', description: 'Name and date are required' });
                  return;
                }
                if (isEditingHoliday && currentHoliday.id) {
                  updateHolidayMutation.mutate({ id: currentHoliday.id, ...currentHoliday });
                } else {
                  createHolidayMutation.mutate(currentHoliday);
                }
              }}
              data-testid="save-holiday"
            >
              {isEditingHoliday ? 'Update' : 'Add'} Holiday
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
