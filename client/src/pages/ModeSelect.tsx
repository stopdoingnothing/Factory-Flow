import { useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, FileText, LogIn, LogOut, Settings, Camera, Grid3X3, Upload, Database, CheckCircle2, Loader2, AlertCircle, ShieldCheck, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { settingsApi } from '@/lib/api';
import aeceLogo from '@assets/AECE_Logo_1765516911038.png';

const api = (path: string, init?: RequestInit) =>
  fetch(path, { credentials: 'include', ...init });

interface BackupInfo {
  valid: boolean;
  version: string;
  exportedAt: string;
  counts: Record<string, number>;
}

type RestoreStep = 'checking' | 'login' | 'file' | 'confirm' | 'done';

function RestoreModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<RestoreStep>('checking');
  const [isBootstrap, setIsBootstrap] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [backupInfo, setBackupInfo] = useState<BackupInfo | null>(null);
  const [pendingBackup, setPendingBackup] = useState<any>(null);
  const [restoring, setRestoring] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // On mount: check whether the DB is empty (bootstrap mode) or needs login
  useState(() => {
    api('/api/backup/bootstrap-validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backup: { data: {} } }),
    }).then(res => res.json()).then(data => {
      if (data.error === 'Bootstrap restore is only available on an empty database') {
        // DB has users — need admin login
        setIsBootstrap(false);
        setStep('login');
      } else {
        // DB is empty — skip login
        setIsBootstrap(true);
        setStep('file');
      }
    }).catch(() => {
      setIsBootstrap(false);
      setStep('login');
    });
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      const res = await api('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      if (!Array.isArray(data.user?.roles) || !data.user.roles.includes('admin')) {
        await api('/api/auth/logout', { method: 'POST' });
        throw new Error('Only admin accounts can restore backups');
      }
      setStep('file');
    } catch (err: any) {
      setLoginError(err.message || 'Invalid credentials');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      const endpoint = isBootstrap ? '/api/backup/bootstrap-validate' : '/api/backup/validate';
      const res = await api(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backup }),
      });
      const info: BackupInfo = await res.json();
      if (!info.valid) throw new Error('Invalid backup file');
      setBackupInfo(info);
      setPendingBackup(backup);
      setStep('confirm');
    } catch {
      setLoginError('The selected file is not a valid backup.');
    }
    e.target.value = '';
  };

  const handleRestore = async () => {
    if (!pendingBackup) return;
    setRestoring(true);
    try {
      const endpoint = isBootstrap ? '/api/backup/bootstrap-import' : '/api/backup/import';
      const res = await api(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backup: pendingBackup }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Import failed');
      const total = Object.values(result.importedCounts as Record<string, number>).reduce((a, b) => a + b, 0);
      setResultMessage(`${total.toLocaleString()} records processed.`);
      setStep('done');
      if (!isBootstrap) await api('/api/auth/logout', { method: 'POST' });
    } catch (err: any) {
      setLoginError(err.message || 'Could not import the backup.');
      setStep('confirm');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <Database className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800">Restore from Backup</h2>
            <p className="text-xs text-slate-500">
              {isBootstrap ? 'No users found — restoring without login' : 'Admin credentials required'}
            </p>
          </div>
        </div>

        {step === 'checking' && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        )}

        {step === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="admin@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="••••••••"
              />
            </div>
            {loginError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {loginError}
              </div>
            )}
            <Button type="submit" disabled={loggingIn} className="w-full">
              {loggingIn ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {loggingIn ? 'Signing in…' : 'Continue'}
            </Button>
          </form>
        )}

        {step === 'file' && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-slate-200 rounded-lg p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-slate-400 hover:bg-slate-50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-slate-300" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-600">Click to select a backup file</p>
                <p className="text-xs text-slate-400">Only .json backup files from this system</p>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileSelect} />
            {loginError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {loginError}
              </div>
            )}
            <div className="flex items-start gap-2 text-xs text-slate-500">
              <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />
              Existing records are never overwritten — only missing records will be added.
            </div>
          </div>
        )}

        {step === 'confirm' && backupInfo && (
          <div className="space-y-4">
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
                      <Badge variant="secondary" className="text-xs h-4">{count.toLocaleString()}</Badge>
                    </div>
                  ))}
              </div>
            </div>
            {loginError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {loginError}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setBackupInfo(null); setPendingBackup(null); setLoginError(''); setStep('file'); }}>
                Back
              </Button>
              <Button onClick={handleRestore} disabled={restoring} className="flex-1">
                {restoring ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                {restoring ? 'Restoring…' : 'Restore Data'}
              </Button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-4 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-800">Restore Complete</p>
              <p className="text-sm text-slate-500 mt-1">{resultMessage}</p>
            </div>
            <Button onClick={onClose} className="w-full">Done</Button>
          </div>
        )}
      </div>
    </div>
  );
}

type AttendanceSubMode = 'clock-in' | 'clock-out';
type SelectionStep = 'mode' | 'attendance-type' | 'attendance-method';

export default function ModeSelect() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<SelectionStep>('mode');
  const [selectedSubMode, setSelectedSubMode] = useState<AttendanceSubMode>('clock-in');
  const [showRestore, setShowRestore] = useState(false);
  
  const { data: companyNameSetting } = useQuery({
    queryKey: ['settings', 'company_name'],
    queryFn: () => settingsApi.get('company_name'),
  });
  
  const { data: companyLogoSetting } = useQuery({
    queryKey: ['settings', 'company_logo'],
    queryFn: () => settingsApi.get('company_logo'),
  });
  
  const companyName = companyNameSetting?.value || 'AECE Checkpoint';
  const companyLogo = companyLogoSetting?.value || aeceLogo;

  const handleSelectAttendanceType = (subMode: AttendanceSubMode) => {
    setSelectedSubMode(subMode);
    sessionStorage.setItem('attendanceSubMode', subMode);
    setStep('attendance-method');
  };

  const handleAttendanceMethod = (method: 'camera' | 'tiles') => {
    sessionStorage.setItem('appMode', 'attendance');
    if (method === 'camera') {
      setLocation('/attendance-kiosk');
    } else {
      setLocation('/attendance-tiles');
    }
  };

  const handleApplicationMode = () => {
    sessionStorage.setItem('appMode', 'application');
    setLocation('/login');
  };

  const goBack = () => {
    if (step === 'attendance-method') {
      setStep('attendance-type');
    } else if (step === 'attendance-type') {
      setStep('mode');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-200">
      <div className="w-full max-w-4xl px-4">
        <div className="text-center mb-8">
          <img src={companyLogo} alt={companyName} className="h-20 mx-auto mb-4" />
          <h1 className="font-oswald text-4xl font-bold text-slate-800 tracking-wider mb-2">
            {companyName.toUpperCase()}
          </h1>
          <p className="text-slate-600 text-lg">
            {step === 'mode' && 'Select Operating Mode'}
            {step === 'attendance-type' && 'Select Attendance Type'}
            {step === 'attendance-method' && `${selectedSubMode === 'clock-in' ? 'Clock In' : 'Clock Out'} - Select Method`}
          </p>
        </div>

        {step === 'mode' && (
          <div className="grid md:grid-cols-2 gap-6">
            <Card 
              className="cursor-pointer hover:scale-105 transition-transform duration-300 bg-white border border-slate-200 shadow-lg"
              onClick={() => setStep('attendance-type')}
              data-testid="card-attendance-mode"
            >
              <CardContent className="p-8 text-center">
                <div className="w-20 h-20 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
                  <Clock className="w-10 h-10 text-primary" />
                </div>
                <h2 className="font-oswald text-2xl font-bold text-gray-800 mb-2">
                  ATTENDANCE MODE
                </h2>
                <p className="text-gray-600">
                  Fast clock-in/clock-out for employees entering or leaving the facility
                </p>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:scale-105 transition-transform duration-300 bg-white border border-slate-200 shadow-lg"
              onClick={handleApplicationMode}
              data-testid="card-application-mode"
            >
              <CardContent className="p-8 text-center">
                <div className="w-20 h-20 mx-auto mb-4 bg-gray-500/10 rounded-full flex items-center justify-center">
                  <FileText className="w-10 h-10 text-gray-600" />
                </div>
                <h2 className="font-oswald text-2xl font-bold text-gray-800 mb-2">
                  APPLICATION MODE
                </h2>
                <p className="text-gray-600">
                  Access leave requests, dashboard, and other employee services
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {step === 'attendance-type' && (
          <div className="space-y-6">
            <button 
              onClick={goBack}
              className="text-slate-600 hover:text-slate-800 flex items-center gap-2 mb-4"
              data-testid="button-back"
            >
              ← Back to Mode Selection
            </button>
            
            <div className="grid md:grid-cols-2 gap-6">
              <Card 
                className="cursor-pointer hover:scale-105 transition-transform duration-300 bg-green-50 border-green-200 shadow-2xl"
                onClick={() => handleSelectAttendanceType('clock-in')}
                data-testid="card-clock-in"
              >
                <CardContent className="p-8 text-center">
                  <div className="w-20 h-20 mx-auto mb-4 bg-green-500/20 rounded-full flex items-center justify-center">
                    <LogIn className="w-10 h-10 text-green-600" />
                  </div>
                  <h2 className="font-oswald text-2xl font-bold text-green-800 mb-2">
                    CLOCK IN
                  </h2>
                  <p className="text-green-700">
                    Record employee arrivals at the start of shift
                  </p>
                </CardContent>
              </Card>

              <Card 
                className="cursor-pointer hover:scale-105 transition-transform duration-300 bg-red-50 border-red-200 shadow-2xl"
                onClick={() => handleSelectAttendanceType('clock-out')}
                data-testid="card-clock-out"
              >
                <CardContent className="p-8 text-center">
                  <div className="w-20 h-20 mx-auto mb-4 bg-red-500/20 rounded-full flex items-center justify-center">
                    <LogOut className="w-10 h-10 text-red-600" />
                  </div>
                  <h2 className="font-oswald text-2xl font-bold text-red-800 mb-2">
                    CLOCK OUT
                  </h2>
                  <p className="text-red-700">
                    Record employee departures at end of shift
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {step === 'attendance-method' && (
          <div className="space-y-6">
            <button 
              onClick={goBack}
              className="text-slate-600 hover:text-slate-800 flex items-center gap-2 mb-4"
              data-testid="button-back-method"
            >
              ← Back to Type Selection
            </button>
            
            <div className="grid md:grid-cols-2 gap-6">
              <Card 
                className="cursor-pointer hover:scale-105 transition-transform duration-300 bg-blue-50 border-blue-200 shadow-2xl"
                onClick={() => handleAttendanceMethod('camera')}
                data-testid="card-camera-mode"
              >
                <CardContent className="p-8 text-center">
                  <div className="w-20 h-20 mx-auto mb-4 bg-blue-500/20 rounded-full flex items-center justify-center">
                    <Camera className="w-10 h-10 text-blue-600" />
                  </div>
                  <h2 className="font-oswald text-2xl font-bold text-blue-800 mb-2">
                    CAMERA MODE
                  </h2>
                  <p className="text-blue-700">
                    Use facial recognition to identify employees automatically
                  </p>
                </CardContent>
              </Card>

              <Card 
                className="cursor-pointer hover:scale-105 transition-transform duration-300 bg-purple-50 border-purple-200 shadow-2xl"
                onClick={() => handleAttendanceMethod('tiles')}
                data-testid="card-tile-mode"
              >
                <CardContent className="p-8 text-center">
                  <div className="w-20 h-20 mx-auto mb-4 bg-purple-500/20 rounded-full flex items-center justify-center">
                    <Grid3X3 className="w-10 h-10 text-purple-600" />
                  </div>
                  <h2 className="font-oswald text-2xl font-bold text-purple-800 mb-2">
                    TILE MODE
                  </h2>
                  <p className="text-purple-700">
                    Tap employee tiles to quickly record attendance
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        <div className="text-center mt-8 flex items-center justify-center gap-6">
          <button
            onClick={() => setLocation('/login')}
            className="text-slate-500 hover:text-slate-700 text-sm flex items-center gap-2"
            data-testid="button-admin-settings"
          >
            <Settings className="w-4 h-4" />
            Staff Login
          </button>
          <button
            onClick={() => setShowRestore(true)}
            className="text-slate-400 hover:text-slate-600 text-sm flex items-center gap-2"
            data-testid="button-restore-backup"
          >
            <Database className="w-4 h-4" />
            Restore from Backup
          </button>
        </div>
      </div>

      {showRestore && <RestoreModal onClose={() => setShowRestore(false)} />}
    </div>
  );
}
