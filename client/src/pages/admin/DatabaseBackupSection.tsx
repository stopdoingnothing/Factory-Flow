import React, { useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
const api = (path: string, init?: RequestInit) =>
  fetch(path, { credentials: 'include', ...init });
import {
  Download, Upload, Database, Users, Building2, FileText, Calendar,
  Clock, Settings, AlertCircle, CheckCircle2, Loader2, ShieldCheck,
  Network, Briefcase, UserCheck, BookOpen, Bell, ScanFace,
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
  { icon: ScanFace,   label: 'Face Recognition Data' },
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
        'notifications', 'settings', 'faceDescriptors',
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
    try {
      const res = await api('/api/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backup: pendingBackup }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Import failed');
      const total = Object.values(result.importedCounts as Record<string, number>).reduce((a, b) => a + b, 0);
      toast({ title: 'Restore complete', description: `${total.toLocaleString()} records processed. Existing records were not overwritten.` });
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
        <h2 className="text-2xl font-bold text-slate-800">Database Backup</h2>
        <p className="text-slate-500 mt-1">Download a complete snapshot of all data, or restore from a previous backup.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Download ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="h-4 w-4" /> Download Backup
            </CardTitle>
            <p className="text-sm text-slate-500">
              Export the entire database as a single JSON file — suitable for reinstalling on a new server or migrating to a new environment.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">What's included</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {INCLUDED_TABLES.map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-2 text-sm text-slate-600">
                    <Icon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    {label}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 flex items-start gap-2 text-sm text-amber-700">
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
            <p className="text-sm text-slate-500">
              Upload a backup file to restore data. Existing records are kept — only records that don't already exist will be added.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {!backupInfo ? (
              <>
                <div
                  className="border-2 border-dashed border-slate-200 rounded-lg p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-slate-400 hover:bg-slate-50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Database className="h-8 w-8 text-slate-300" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-slate-600">Click to select a backup file</p>
                    <p className="text-xs text-slate-400">Only .json backup files from this system are accepted</p>
                  </div>
                </div>
                <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileSelect} />
                <div className="flex items-start gap-2 text-sm text-slate-500">
                  <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />
                  Existing records are never overwritten — only missing records from the backup will be added.
                </div>
              </>
            ) : (
              <>
                <div className="rounded-md border border-green-200 bg-green-50 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-green-700 font-medium text-sm">
                    <CheckCircle2 className="h-4 w-4" /> Valid backup file
                  </div>
                  <div className="text-xs text-slate-500 space-y-1">
                    <div>Version: <span className="font-mono">{backupInfo.version}</span></div>
                    <div>Exported: {new Date(backupInfo.exportedAt).toLocaleString()}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                    {Object.entries(backupInfo.counts)
                      .filter(([, v]) => v > 0)
                      .map(([key, count]) => (
                        <div key={key} className="flex justify-between text-xs">
                          <span className="text-slate-500 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
