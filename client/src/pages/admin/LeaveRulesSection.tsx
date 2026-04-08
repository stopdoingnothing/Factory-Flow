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
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, Settings, Loader2, RefreshCw, ChevronDown, ChevronRight, BookOpen, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { leaveRuleApi, leaveRulePhaseApi, employeeTypeApi, leaveBalanceApi } from '@/lib/api';
import type { LeaveRule, LeaveRulePhase } from '@shared/schema';
import { useToast } from "@/hooks/use-toast";

const SA_BCEA_RULES = [
  {
    type: 'Annual Leave',
    section: 'BCEA Section 20',
    color: 'blue',
    entitlement: '21 consecutive days per 12-month leave cycle',
    accrual: '1.75 days per month (pro-rated)',
    waitingPeriod: 'None — starts accruing from day 1',
    cycleLength: '12 months from employment start date',
    notes: 'Employees working 5 days/week earn 21 days. Part-time workers earn 1 day per 17 days worked or 1 hour per 17 hours worked.',
    formula: 'Months in current cycle ÷ 12 × 21 days',
    examples: [
      { tenure: '3 months', days: 5.3 },
      { tenure: '6 months', days: 10.5 },
      { tenure: '9 months', days: 15.8 },
      { tenure: '12 months', days: 21 },
    ],
  },
  {
    type: 'Sick Leave',
    section: 'BCEA Section 22',
    color: 'amber',
    entitlement: '30 days per 3-year sick leave cycle, pro-rated monthly',
    accrual: 'Months completed in cycle ÷ 36 × 30 days',
    waitingPeriod: 'No waiting period — accrues from day one',
    cycleLength: '36 months (3 years) from employment start date',
    notes: 'Sick leave accrues smoothly over the 3-year cycle — 10 days per year equivalent. This prevents employees from seeing all 30 days before they have earned them. The full 30-day BCEA entitlement is reached at the end of each 3-year cycle.',
    formula: '(months in current 3-year cycle ÷ 36) × 30 days',
    examples: [
      { tenure: '2 months', days: 1.7 },
      { tenure: '6 months', days: 5 },
      { tenure: '8 months', days: 6.7 },
      { tenure: '12 months', days: 10 },
      { tenure: '24 months', days: 20 },
      { tenure: '36 months', days: 30 },
    ],
  },
  {
    type: 'Family Responsibility',
    section: 'BCEA Section 27',
    color: 'green',
    entitlement: '3 days per annual leave cycle',
    accrual: 'Fixed — 3 days once available',
    waitingPeriod: '4 months of continuous employment required',
    cycleLength: '12 months (aligned with annual leave cycle)',
    notes: 'Only applies to employees working 4 or more days per week. Available for: birth of a child, illness or death of a child, spouse/life partner, parent, adoptive parent, grandparent, sibling, or grandchild.',
    formula: 'If ≥ 4 months employment: 3 days. Otherwise: 0 days.',
    examples: [
      { tenure: '3 months', days: 0 },
      { tenure: '4 months', days: 3 },
      { tenure: '12 months', days: 3 },
    ],
  },
];

const colorMap: Record<string, { bg: string; border: string; heading: string; text: string; badge: string }> = {
  blue: {
    bg: 'bg-status-info-muted',
    border: 'border-status-info/30',
    heading: 'text-status-info',
    text: 'text-status-info',
    badge: 'bg-status-info-muted text-status-info border-status-info/30',
  },
  amber: {
    bg: 'bg-status-warning-muted',
    border: 'border-status-warning/30',
    heading: 'text-status-warning',
    text: 'text-status-warning',
    badge: 'bg-status-warning-muted text-status-warning border-status-warning/30',
  },
  green: {
    bg: 'bg-status-success-muted',
    border: 'border-status-success/30',
    heading: 'text-status-success',
    text: 'text-status-success',
    badge: 'bg-status-success-muted text-status-success border-status-success/30',
  },
};

export default function LeaveRulesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: leaveRules = [] } = useQuery({
    queryKey: ['leaveRules'],
    queryFn: leaveRuleApi.getAll,
  });

  const { data: employeeTypes = [] } = useQuery({
    queryKey: ['employeeTypes'],
    queryFn: employeeTypeApi.getAll,
  });

  const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false);
  const [currentRule, setCurrentRule] = useState<Partial<LeaveRule>>({});
  const [isEditingRule, setIsEditingRule] = useState(false);

  const [isPhaseDialogOpen, setIsPhaseDialogOpen] = useState(false);
  const [currentPhaseRule, setCurrentPhaseRule] = useState<LeaveRule | null>(null);
  const [phases, setPhases] = useState<LeaveRulePhase[]>([]);
  const [loadingPhases, setLoadingPhases] = useState(false);

  const [expandedBCEA, setExpandedBCEA] = useState<string | null>(null);
  const [recalcResult, setRecalcResult] = useState<null | { updated: number; errors: string[]; details: { userId: string; name: string; annualLeave: number; sickLeave: number; familyResponsibility: number; monthsWorked: number }[] }>(null);
  const [isRecalcDialogOpen, setIsRecalcDialogOpen] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);

  const createRuleMutation = useMutation({
    mutationFn: leaveRuleApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaveRules'] });
      toast({ title: "Leave Rule Created", description: "Leave rule has been added successfully." });
      setIsRuleDialogOpen(false);
      setCurrentRule({});
      setIsEditingRule(false);
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => leaveRuleApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaveRules'] });
      toast({ title: "Leave Rule Updated", description: "Leave rule has been updated successfully." });
      setIsRuleDialogOpen(false);
      setCurrentRule({});
      setIsEditingRule(false);
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: leaveRuleApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaveRules'] });
      toast({ title: "Leave Rule Deleted", description: "Leave rule has been removed." });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const handleSaveRule = () => {
    if (!currentRule.name || !currentRule.leaveType) {
      toast({ variant: "destructive", title: "Error", description: "Rule name and leave type are required" });
      return;
    }
    if (isEditingRule && currentRule.id) {
      updateRuleMutation.mutate({
        id: currentRule.id,
        name: currentRule.name,
        leaveType: currentRule.leaveType,
        description: currentRule.description || null,
        employeeTypeId: currentRule.employeeTypeId || null,
        accrualType: currentRule.accrualType || 'fixed',
        accrualRate: currentRule.accrualRate || null,
        daysEarned: currentRule.daysEarned || '1',
        periodDaysWorked: currentRule.periodDaysWorked || null,
        maxAccrual: currentRule.maxAccrual || null,
        waitingPeriodDays: currentRule.waitingPeriodDays || null,
        cycleMonths: currentRule.cycleMonths || null,
        notes: currentRule.notes || null,
      });
    } else {
      createRuleMutation.mutate({
        name: currentRule.name,
        leaveType: currentRule.leaveType,
        description: currentRule.description || undefined,
        employeeTypeId: currentRule.employeeTypeId || undefined,
        accrualType: currentRule.accrualType || 'fixed',
        accrualRate: currentRule.accrualRate || undefined,
        daysEarned: currentRule.daysEarned || '1',
        periodDaysWorked: currentRule.periodDaysWorked || undefined,
        maxAccrual: currentRule.maxAccrual || undefined,
        waitingPeriodDays: currentRule.waitingPeriodDays || undefined,
        cycleMonths: currentRule.cycleMonths || undefined,
        notes: currentRule.notes || undefined,
      });
    }
  };

  const handleOpenEditRule = (rule: LeaveRule) => {
    setCurrentRule(rule);
    setIsEditingRule(true);
    setIsRuleDialogOpen(true);
  };

  const handleOpenCreateRule = () => {
    setCurrentRule({ accrualType: 'fixed' });
    setIsEditingRule(false);
    setIsRuleDialogOpen(true);
  };

  const handleDeleteRule = (id: number) => {
    if (confirm('Are you sure you want to delete this leave rule?')) {
      deleteRuleMutation.mutate(id);
    }
  };

  const handleOpenPhaseEditor = async (rule: LeaveRule) => {
    setCurrentPhaseRule(rule);
    setLoadingPhases(true);
    setIsPhaseDialogOpen(true);
    try {
      const rulePhases = await leaveRulePhaseApi.getByRuleId(rule.id);
      setPhases(rulePhases);
    } catch {
      toast({ title: "Error", description: "Failed to load phases", variant: "destructive" });
      setPhases([]);
    } finally {
      setLoadingPhases(false);
    }
  };

  const handleAddPhase = () => {
    const newPhase: Partial<LeaveRulePhase> = {
      phaseName: `Phase ${phases.length + 1}`,
      sequence: phases.length + 1,
      accrualType: 'per_days_worked',
      daysEarned: '1',
      periodDaysWorked: 26,
      startsAfterMonths: phases.length > 0 ? (phases[phases.length - 1].startsAfterMonths || 0) + 6 : 0,
      startsAfterDaysWorked: null,
      maxBalanceDays: null,
    };
    setPhases([...phases, newPhase as LeaveRulePhase]);
  };

  const handleUpdatePhase = (index: number, updates: Partial<LeaveRulePhase>) => {
    const newPhases = [...phases];
    newPhases[index] = { ...newPhases[index], ...updates };
    setPhases(newPhases);
  };

  const handleRemovePhase = (index: number) => {
    const newPhases = phases.filter((_, i) => i !== index);
    newPhases.forEach((phase, i) => { phase.sequence = i + 1; });
    setPhases(newPhases);
  };

  const handleSavePhases = async () => {
    if (!currentPhaseRule) return;
    try {
      await leaveRulePhaseApi.deleteAll(currentPhaseRule.id);
      for (const phase of phases) {
        await leaveRulePhaseApi.create(currentPhaseRule.id, {
          phaseName: phase.phaseName,
          sequence: phase.sequence,
          accrualType: phase.accrualType,
          daysEarned: phase.daysEarned,
          periodDaysWorked: phase.periodDaysWorked,
          startsAfterMonths: phase.startsAfterMonths,
          startsAfterDaysWorked: phase.startsAfterDaysWorked,
          maxBalanceDays: phase.maxBalanceDays,
          cycleMonths: phase.cycleMonths,
          notes: phase.notes,
        });
      }
      toast({ title: "Success", description: "Phases saved successfully" });
      setIsPhaseDialogOpen(false);
    } catch {
      toast({ title: "Error", description: "Failed to save phases", variant: "destructive" });
    }
  };

  const handleRecalculateSA = async () => {
    setIsRecalculating(true);
    try {
      const result = await leaveBalanceApi.recalculateSA();
      setRecalcResult(result);
      setIsRecalcDialogOpen(true);
      queryClient.invalidateQueries({ queryKey: ['leaveBalances'] });
      toast({ title: "Recalculation Complete", description: result.message });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message || "Recalculation failed" });
    } finally {
      setIsRecalculating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground">Leave Rules</h1>
          <p className="text-muted-foreground">SA BCEA-compliant leave calculations and accrual rules</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleRecalculateSA}
            disabled={isRecalculating}
            data-testid="button-recalculate-sa"
          >
            {isRecalculating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Recalculate All (SA BCEA)
          </Button>
          <Button onClick={handleOpenCreateRule} data-testid="button-create-rule">
            <Plus className="h-4 w-4 mr-2" /> Add Leave Rule
          </Button>
        </div>
      </div>

      {/* SA BCEA Law Reference */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">South African BCEA Leave Entitlements</CardTitle>
          </div>
          <CardDescription>
            Leave balances automatically accrue based on each employee's start date, per the Basic Conditions of Employment Act (BCEA). Balances are recalculated every time they are viewed — no manual intervention needed. Click a leave type to see the formula and examples. Use "Recalculate All" to force a bulk update now.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {SA_BCEA_RULES.map((rule) => {
            const c = colorMap[rule.color];
            const isOpen = expandedBCEA === rule.type;
            return (
              <div key={rule.type} className={`rounded-lg border ${c.border} ${c.bg}`}>
                <button
                  className="w-full flex items-center justify-between p-4 text-left"
                  onClick={() => setExpandedBCEA(isOpen ? null : rule.type)}
                  data-testid={`button-bcea-expand-${rule.type.replace(/\s+/g, '-').toLowerCase()}`}
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className={`font-semibold ${c.heading}`}>{rule.type}</p>
                      <p className={`text-xs ${c.text}`}>{rule.section} — {rule.entitlement}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-xs ${c.badge}`}>
                      {rule.waitingPeriod.split('—')[0].trim()}
                    </Badge>
                    {isOpen ? <ChevronDown className={`h-4 w-4 ${c.text}`} /> : <ChevronRight className={`h-4 w-4 ${c.text}`} />}
                  </div>
                </button>

                {isOpen && (
                  <div className={`px-4 pb-4 space-y-3 border-t ${c.border}`}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">
                      <div className="space-y-2">
                        <p className={`text-xs font-semibold uppercase tracking-wide ${c.text}`}>Calculation Formula</p>
                        <p className={`text-sm font-mono ${c.heading} bg-card rounded px-2 py-1 border ${c.border}`}>{rule.formula}</p>
                        <p className={`text-xs ${c.text} leading-relaxed`}>{rule.notes}</p>
                      </div>
                      <div className="space-y-2">
                        <p className={`text-xs font-semibold uppercase tracking-wide ${c.text}`}>Examples by Tenure</p>
                        <div className="bg-card rounded border overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className={`${c.bg}`}>
                                <th className={`text-left px-3 py-1.5 font-medium ${c.text}`}>Tenure</th>
                                <th className={`text-right px-3 py-1.5 font-medium ${c.text}`}>Days</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rule.examples.map((ex) => (
                                <tr key={ex.tenure} className={`border-t ${c.border}`}>
                                  <td className={`px-3 py-1.5 ${c.heading}`}>{ex.tenure}</td>
                                  <td className={`px-3 py-1.5 text-right font-semibold ${c.heading}`}>{ex.days}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                    <div className={`text-xs ${c.text} flex items-start gap-1.5`}>
                      <span className="font-semibold shrink-0">Cycle:</span>
                      <span>{rule.cycleLength}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Leave Accrual Rules Table */}
      <Card>
        <CardHeader>
          <CardTitle>Custom Leave Accrual Rules</CardTitle>
          <CardDescription>
            Optional rules that extend or override SA BCEA defaults for specific employee types. 
            BCEA minimums always apply — these rules can only be more generous.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Leave Type</TableHead>
                <TableHead>Employee Type</TableHead>
                <TableHead>Accrual Type</TableHead>
                <TableHead>Formula</TableHead>
                <TableHead>Max Accrual</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaveRules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    No custom rules configured. SA BCEA defaults apply to all employees.
                  </TableCell>
                </TableRow>
              ) : leaveRules.map((rule) => {
                const empType = employeeTypes.find(t => t.id === rule.employeeTypeId);
                const getFormulaDisplay = () => {
                  if (rule.accrualType === 'days_worked' && rule.daysEarned && rule.periodDaysWorked) {
                    return `${rule.daysEarned} day per ${rule.periodDaysWorked} days worked`;
                  }
                  if (rule.accrualType === 'tiered') return 'Multiple phases (click to manage)';
                  return rule.accrualRate || '-';
                };
                return (
                  <TableRow key={rule.id} data-testid={`row-rule-${rule.id}`}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell><Badge variant="outline">{rule.leaveType}</Badge></TableCell>
                    <TableCell>{empType?.name || 'All Types'}</TableCell>
                    <TableCell><Badge variant="secondary">{rule.accrualType || 'fixed'}</Badge></TableCell>
                    <TableCell className="text-sm">{getFormulaDisplay()}</TableCell>
                    <TableCell>{rule.maxAccrual ? `${rule.maxAccrual} days` : '-'}</TableCell>
                    <TableCell className="text-right space-x-1">
                      {rule.accrualType === 'tiered' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenPhaseEditor(rule)}
                          data-testid={`button-manage-phases-${rule.id}`}
                        >
                          <Settings className="h-3 w-3 mr-1" /> Phases
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => handleOpenEditRule(rule)} data-testid={`button-edit-rule-${rule.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteRule(rule.id)}
                        data-testid={`button-delete-rule-${rule.id}`}
                      >
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

      {/* Recalculation Results Dialog */}
      <Dialog open={isRecalcDialogOpen} onOpenChange={setIsRecalcDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-status-success" />
              SA BCEA Recalculation Complete
            </DialogTitle>
            <DialogDescription>
              Leave balances have been updated based on each employee's start date and SA BCEA entitlements.
              Existing "taken" days are unchanged.
            </DialogDescription>
          </DialogHeader>

          {recalcResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-status-success-muted rounded-lg border border-status-success/30">
                  <p className="text-2xl font-bold text-status-success">{recalcResult.updated}</p>
                  <p className="text-xs text-status-success">Employees Updated</p>
                </div>
                <div className="text-center p-3 bg-status-info-muted rounded-lg border border-status-info/30">
                  <p className="text-2xl font-bold text-status-info">{recalcResult.details.length}</p>
                  <p className="text-xs text-status-info">Records Processed</p>
                </div>
                <div className="text-center p-3 bg-destructive/10 rounded-lg border border-destructive/30">
                  <p className="text-2xl font-bold text-destructive">{recalcResult.errors.length}</p>
                  <p className="text-xs text-destructive">Errors</p>
                </div>
              </div>

              {recalcResult.errors.length > 0 && (
                <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/30">
                  <p className="text-sm font-semibold text-destructive flex items-center gap-1.5 mb-2">
                    <AlertTriangle className="h-4 w-4" /> Errors
                  </p>
                  {recalcResult.errors.map((e, i) => (
                    <p key={i} className="text-xs text-destructive">{e}</p>
                  ))}
                </div>
              )}

              <div>
                <p className="text-sm font-semibold mb-2">Updated Employee Balances</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Tenure</TableHead>
                      <TableHead className="text-center">Annual Leave</TableHead>
                      <TableHead className="text-center">Sick Leave</TableHead>
                      <TableHead className="text-center">Family Resp.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recalcResult.details.map((d) => (
                      <TableRow key={d.userId}>
                        <TableCell className="font-medium text-sm">{d.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {d.monthsWorked} month{d.monthsWorked !== 1 ? 's' : ''}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-status-info-muted text-status-info border-status-info/30">
                            {d.annualLeave} days
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-status-warning-muted text-status-warning border-status-warning/30">
                            {d.sickLeave} days
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-status-success-muted text-status-success border-status-success/30">
                            {d.familyResponsibility} days
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setIsRecalcDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave Rule Create/Edit Dialog */}
      <Dialog open={isRuleDialogOpen} onOpenChange={setIsRuleDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEditingRule ? 'Edit Leave Rule' : 'Add Custom Leave Rule'}</DialogTitle>
            <DialogDescription>
              Custom rules extend SA BCEA minimums for specific employee types or situations.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
            <div className="space-y-1">
              <Label htmlFor="ruleName">Name <span className="text-destructive">*</span></Label>
              <Input
                id="ruleName"
                value={currentRule.name || ''}
                onChange={(e) => setCurrentRule({ ...currentRule, name: e.target.value })}
                placeholder="e.g., Annual Leave Accrual"
                data-testid="input-rule-name"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="leaveType">Leave Type <span className="text-destructive">*</span></Label>
                <Select
                  value={currentRule.leaveType || ''}
                  onValueChange={(value) => setCurrentRule({ ...currentRule, leaveType: value })}
                >
                  <SelectTrigger id="leaveType" data-testid="select-rule-leave-type">
                    <SelectValue placeholder="Select leave type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Annual">Annual Leave</SelectItem>
                    <SelectItem value="Sick">Sick Leave</SelectItem>
                    <SelectItem value="Family Responsibility">Family Responsibility</SelectItem>
                    <SelectItem value="Study">Study Leave</SelectItem>
                    <SelectItem value="Unpaid">Unpaid Leave</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ruleEmpType">Employee Type</Label>
                <Select
                  value={currentRule.employeeTypeId?.toString() || 'all'}
                  onValueChange={(value) => setCurrentRule({ ...currentRule, employeeTypeId: value === 'all' ? undefined : parseInt(value) })}
                >
                  <SelectTrigger id="ruleEmpType" data-testid="select-rule-emp-type">
                    <SelectValue placeholder="Select employee type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employee Types</SelectItem>
                    {employeeTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id.toString()}>{type.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="accrualType">Accrual Type</Label>
              <Select
                value={currentRule.accrualType || 'fixed'}
                onValueChange={(value) => setCurrentRule({ ...currentRule, accrualType: value })}
              >
                <SelectTrigger id="accrualType" data-testid="select-accrual-type">
                  <SelectValue placeholder="Select accrual type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed (days per year)</SelectItem>
                  <SelectItem value="monthly">Monthly (days per month)</SelectItem>
                  <SelectItem value="days_worked">Days Worked (1 day per X days)</SelectItem>
                  <SelectItem value="cycle">Cycle Based (days per X months)</SelectItem>
                  <SelectItem value="tiered">Tiered (different rates based on tenure)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {currentRule.accrualType === 'days_worked' && (
              <div className="p-3 bg-status-info-muted rounded-lg border border-status-info/30">
                <p className="text-sm font-medium text-status-info mb-3">Earn X days for every Y days worked</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="daysEarned" className="text-sm">Days Earned</Label>
                    <Input
                      id="daysEarned"
                      value={currentRule.daysEarned || '1'}
                      onChange={(e) => setCurrentRule({ ...currentRule, daysEarned: e.target.value })}
                      placeholder="e.g., 1 or 1.6"
                      data-testid="input-days-earned"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="periodDaysWorked" className="text-sm">Per Days Worked</Label>
                    <Input
                      id="periodDaysWorked"
                      type="number"
                      value={currentRule.periodDaysWorked || 26}
                      onChange={(e) => setCurrentRule({ ...currentRule, periodDaysWorked: e.target.value ? parseInt(e.target.value) : undefined })}
                      placeholder="e.g., 26"
                      data-testid="input-period-days-worked"
                    />
                  </div>
                </div>
              </div>
            )}

            {currentRule.accrualType === 'tiered' && (
              <div className="p-3 bg-status-warning-muted rounded-lg border border-status-warning/30">
                <p className="text-sm font-medium text-status-warning mb-1">Tiered Accrual</p>
                <p className="text-xs text-status-warning">
                  Different accrual rates based on employment tenure. Save this rule first, then click "Phases" to configure each tier.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="accrualRate">Accrual Rate</Label>
                <Input
                  id="accrualRate"
                  value={currentRule.accrualRate || ''}
                  onChange={(e) => setCurrentRule({ ...currentRule, accrualRate: e.target.value })}
                  placeholder="e.g., 1.25 days/month"
                  data-testid="input-accrual-rate"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="maxAccrual">Max Accrual (days)</Label>
                <Input
                  id="maxAccrual"
                  type="number"
                  value={currentRule.maxAccrual || ''}
                  onChange={(e) => setCurrentRule({ ...currentRule, maxAccrual: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="e.g., 30"
                  data-testid="input-max-accrual"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="waitingPeriod">Waiting Period (days)</Label>
                <Input
                  id="waitingPeriod"
                  type="number"
                  value={currentRule.waitingPeriodDays || ''}
                  onChange={(e) => setCurrentRule({ ...currentRule, waitingPeriodDays: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="e.g., 180"
                  data-testid="input-waiting-period"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cycleMonths">Cycle Length (months)</Label>
                <Input
                  id="cycleMonths"
                  type="number"
                  value={currentRule.cycleMonths || ''}
                  onChange={(e) => setCurrentRule({ ...currentRule, cycleMonths: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="e.g., 36"
                  data-testid="input-cycle-months"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="ruleNotes">Notes</Label>
              <Textarea
                id="ruleNotes"
                value={currentRule.notes || ''}
                onChange={(e) => setCurrentRule({ ...currentRule, notes: e.target.value })}
                placeholder="Additional notes about this rule"
                data-testid="input-rule-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveRule} data-testid="button-save-rule">
              {isEditingRule ? 'Save Changes' : 'Create Leave Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave Rule Phase Editor Dialog */}
      <Dialog open={isPhaseDialogOpen} onOpenChange={setIsPhaseDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Tiered Phases</DialogTitle>
            <DialogDescription>
              Configure different accrual rates based on employment tenure for: {currentPhaseRule?.name}
            </DialogDescription>
          </DialogHeader>

          {loadingPhases ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {phases.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No phases configured yet. Add phases to define tiered accrual.</p>
                </div>
              ) : (
                phases.map((phase, index) => (
                  <Card key={index} className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <Input
                        value={phase.phaseName}
                        onChange={(e) => handleUpdatePhase(index, { phaseName: e.target.value })}
                        className="font-medium w-48"
                        placeholder="Phase name"
                        data-testid={`input-phase-name-${index}`}
                      />
                      <Button variant="ghost" size="icon" onClick={() => handleRemovePhase(index)} data-testid={`button-remove-phase-${index}`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Starts After (months)</Label>
                        <Input
                          type="number"
                          value={phase.startsAfterMonths ?? ''}
                          onChange={(e) => handleUpdatePhase(index, { startsAfterMonths: e.target.value ? parseInt(e.target.value) : null })}
                          placeholder="0"
                          data-testid={`input-phase-starts-months-${index}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Accrual Type</Label>
                        <Select
                          value={phase.accrualType}
                          onValueChange={(v) => handleUpdatePhase(index, { accrualType: v })}
                        >
                          <SelectTrigger data-testid={`select-phase-accrual-${index}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="per_days_worked">Per Days Worked</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="annual">Annual</SelectItem>
                            <SelectItem value="cycle">Cycle</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Days Earned</Label>
                        <Input
                          value={phase.daysEarned}
                          onChange={(e) => handleUpdatePhase(index, { daysEarned: e.target.value })}
                          placeholder="1"
                          data-testid={`input-phase-days-earned-${index}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Per Days Worked</Label>
                        <Input
                          type="number"
                          value={phase.periodDaysWorked ?? ''}
                          onChange={(e) => handleUpdatePhase(index, { periodDaysWorked: e.target.value ? parseInt(e.target.value) : null })}
                          placeholder="26"
                          data-testid={`input-phase-period-${index}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Max Balance (days)</Label>
                        <Input
                          type="number"
                          value={phase.maxBalanceDays ?? ''}
                          onChange={(e) => handleUpdatePhase(index, { maxBalanceDays: e.target.value ? parseInt(e.target.value) : null })}
                          placeholder="No limit"
                          data-testid={`input-phase-max-balance-${index}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Cycle Months</Label>
                        <Input
                          type="number"
                          value={phase.cycleMonths ?? ''}
                          onChange={(e) => handleUpdatePhase(index, { cycleMonths: e.target.value ? parseInt(e.target.value) : null })}
                          placeholder="e.g., 36"
                          data-testid={`input-phase-cycle-${index}`}
                        />
                      </div>
                    </div>
                    {phase.accrualType === 'per_days_worked' && phase.daysEarned && phase.periodDaysWorked && (
                      <p className="text-xs text-muted-foreground mt-2">
                        → Earns {phase.daysEarned} day(s) for every {phase.periodDaysWorked} days worked
                      </p>
                    )}
                  </Card>
                ))
              )}
              <Button variant="outline" onClick={handleAddPhase} className="w-full" data-testid="button-add-phase">
                <Plus className="h-4 w-4 mr-2" /> Add Phase
              </Button>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPhaseDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePhases} data-testid="button-save-phases">Save Phases</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
