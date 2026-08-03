import React, { useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import type { ImportResponse } from '@shared/backup';
const api = (path: string, init?: RequestInit) =>
  fetch(path, { credentials: 'include', ...init });
import {
  Download, Upload, Database, Users, Building2, FileText, Calendar,
  Clock, Settings, AlertCircle, CheckCircle2, Loader2, ShieldCheck,
  Network, Briefcase, UserCheck, BookOpen, Bell,
} from 'lucide-react';

const INCLUDED_TABLES = [
  { icon: Users,      label: 'Employees & Managers' },
  { icon: Building2,  label: 'Departments' },
  { icon: UserCheck,  label: 'User Groups' },
  { icon: Briefcase,  label: 'Employee Types' },
  { icon: Building2,  label: 'Companies' },
  { icon: Network,    label: 'Org Positions' },
  { icon: Calendar,   label: 'Leave Balances' },
  { icon: FileText,   label: 'Leave Requests' },
  { icon: BookOpen,   label: 'Leave Rules & Phases' },
  { icon: Clock,      label: 'Attendance Records' },
  { icon: FileText,   label: 'Contract History' },
  { icon: AlertCircle,label: 'Grievances' },
  { icon: Calendar,   label: 'Public Holidays' },
  { icon: Bell,       label: 'Notifications' },
  { icon: Settings,   label: 'System Settings' },
];

interface BackupInfo {
  valid: boolean;
  version: string;
  exportedAt: string;
  counts: Record<string, number>;
}

export default function DatabaseBackupSection() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [backupInfo, setBackupInfo] = useState<BackupInfo | null>(null);
  const [pendingBackup, setPendingBackup] = useState<any>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await api('/api/backup/export');
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aece-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'Backup downloaded', description: 'Full database snapshot saved to your downloads folder.' });
    } catch {
      toast({ title: 'Download failed', description: 'Could not export the database. Check server logs.', variant: 'destructive' });
    } finally {
      setDownloading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      if (!backup || !backup.data) throw new Error('Invalid backup file');

      const countKeys = [
        'departments', 'userGroups', 'employeeTypes', 'companies', 'orgPositions',
        'users', 'leaveBalances', 'leaveRequests', 'leaveRules', 'leaveRulePhases',
        'attendanceRecords', 'contractHistory', 'grievances', 'publicHolidays',
        'notifications', 'settings',
      ] as const;
      const counts: Record<string, number> = {};
      for (const k of countKeys) counts[k] = backup.data[k]?.length || 0;

      setBackupInfo({
        valid: true,
        version: backup.version || 'unknown',
        exportedAt: backup.exportedAt || 'unknown',
        counts,
      });
      setPendingBackup(backup);
    } catch {
      toast({ title: 'Invalid file', description: 'The selected file is not a valid backup.', variant: 'destructive' });
      setBackupInfo(null);
      setPendingBackup(null);
    }
    e.target.value = '';
  };

  const handleRestore = async () => {
    if (!pendingBackup) return;
    setRestoring(true);
    setResult(null);
    try {
      const res = await api('/api/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backup: pendingBackup }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Import failed');
      const imported: ImportResponse = body;
      setResult(imported);

      // Report rows the database accepted, not the length of the input arrays — the old version
      // reported the file's own counts and so always looked like a clean restore.
      const { totalInserted, totalSkipped, totalFailed } = imported.report;
      if (totalFailed > 0) {
        toast({
          title: 'Restore incomplete',
          description: `${totalInserted.toLocaleString()} records restored, ${totalFailed.toLocaleString()} rejected. See the details below.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Restore complete',
          description: `${totalInserted.toLocaleString()} records restored, ${totalSkipped.toLocaleString()} already present and left unchanged.`,
        });
      }
      setBackupInfo(null);
      setPendingBackup(null);
    } catch (err: any) {
      toast({ title: 'Restore failed', description: err.message || 'Could not import the backup.', variant: 'destructive' });
    } finally {
      setRestoring(false);
    }
  };

  const formatCount = (n: number) => n.toLocaleString();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Database Backup</h2>
        <p className="text-muted-foreground mt-1">Download a complete snapshot of all data, or restore from a previous backup.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Download ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="h-4 w-4" /> Download Backup
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Export the entire database as a single JSON file — suitable for reinstalling on a new server or migrating to a new environment.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">What's included</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {INCLUDED_TABLES.map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-2 text-sm text-foreground">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {label}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md bg-status-warning-muted border border-status-warning/30 px-3 py-2 flex items-start gap-2 text-sm text-status-warning">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              Photos and face recognition data are included. Files may be large if many employees have photos.
            </div>

            <Button onClick={handleDownload} disabled={downloading} className="w-full">
              {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              {downloading ? 'Preparing download…' : 'Download Backup'}
            </Button>
          </CardContent>
        </Card>

        {/* ── Restore ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-4 w-4" /> Restore from Backup
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Upload a backup file to restore data. Existing records are kept — only records that don't already exist will be added.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {!backupInfo ? (
              <>
                <div
                  className="border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-muted-foreground hover:bg-muted/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Database className="h-8 w-8 text-muted-foreground/40" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">Click to select a backup file</p>
                    <p className="text-xs text-muted-foreground">Only .json backup files from this system are accepted</p>
                  </div>
                </div>
                <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileSelect} />
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                  Existing records are never overwritten — only missing records from the backup will be added.
                </div>
              </>
            ) : (
              <>
                <div className="rounded-md border border-status-success/30 bg-status-success-muted p-3 space-y-2">
                  <div className="flex items-center gap-2 text-status-success font-medium text-sm">
                    <CheckCircle2 className="h-4 w-4" /> Valid backup file
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>Version: <span className="font-mono">{backupInfo.version}</span></div>
                    <div>Exported: {new Date(backupInfo.exportedAt).toLocaleString()}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                    {Object.entries(backupInfo.counts)
                      .filter(([, v]) => v > 0)
                      .map(([key, count]) => (
                        <div key={key} className="flex justify-between text-xs">
                          <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                          <Badge variant="secondary" className="text-xs h-4">{formatCount(count)}</Badge>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { setBackupInfo(null); setPendingBackup(null); }}>
                    Cancel
                  </Button>
                  <Button onClick={handleRestore} disabled={restoring} className="flex-1">
                    {restoring ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    {restoring ? 'Restoring…' : 'Restore Data'}
                  </Button>
                </div>
              </>
            )}

            {/* Outcome of the last restore. The toast disappears; this stays, because a partial
                restore needs to be actionable rather than glimpsed. */}
            {result && (
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">Last restore</span>
                  <span className="text-muted-foreground">
                    {formatCount(result.report.totalInserted)} restored
                    {result.report.totalSkipped > 0 &&
                      ` · ${formatCount(result.report.totalSkipped)} already present`}
                    {result.report.totalFailed > 0 &&
                      ` · ${formatCount(result.report.totalFailed)} rejected`}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {Object.entries(result.report.tables).map(([key, t]) => (
                    <div key={key} className="flex justify-between text-xs">
                      <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                      <Badge
                        variant={t.failed > 0 ? 'destructive' : 'secondary'}
                        className="text-xs h-4"
                      >
                        {t.inserted === t.attempted
                          ? formatCount(t.inserted)
                          : `${formatCount(t.inserted)}/${formatCount(t.attempted)}`}
                      </Badge>
                    </div>
                  ))}
                </div>

                {result.report.totalFailed > 0 && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 space-y-2 max-h-48 overflow-y-auto">
                    <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
                      Records not restored
                    </p>
                    {Object.entries(result.report.tables)
                      .filter(([, t]) => t.failed > 0)
                      .map(([key, t]) => (
                        <div key={key} className="text-xs text-destructive">
                          <span className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                          : {formatCount(t.failed)} of {formatCount(t.attempted)} failed
                          {t.errors[0] && (
                            <div className="opacity-80 mt-0.5 break-words font-mono">{t.errors[0]}</div>
                          )}
                        </div>
                      ))}
                  </div>
                )}

                {result.report.warnings.length > 0 && (
                  <div className="rounded-md border border-status-warning/30 bg-status-warning-muted p-3 space-y-1 max-h-48 overflow-y-auto">
                    <p className="text-xs font-semibold uppercase tracking-wider text-status-warning">
                      Data adjusted
                    </p>
                    {result.report.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-status-warning">{w}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
