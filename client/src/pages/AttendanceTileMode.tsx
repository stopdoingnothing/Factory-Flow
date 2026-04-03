import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import Webcam from 'react-webcam';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  LogIn, LogOut, CheckCircle2, XCircle, Loader2, 
  ArrowLeft, Clock, Search, User, Grid3X3, Camera
} from 'lucide-react';
import { userApi, attendanceApi, departmentApi } from '@/lib/api';
import defaultAvatarUrl from '@/assets/default-avatar.jpg';
import type { User as UserType, Department, AttendanceRecord } from '@shared/schema';
import InfringementReasonDialog from '@/components/InfringementReasonDialog';

type SubMode = 'clock-in' | 'clock-out';
type TileStatus = 'mode-select' | 'selecting' | 'confirm' | 'recording' | 'success' | 'error';

export default function AttendanceTileMode() {
  const [, setLocation] = useLocation();
  
  const [subMode, setSubMode] = useState<SubMode | null>(() => {
    const stored = sessionStorage.getItem('attendanceSubMode');
    return stored ? (stored as SubMode) : null;
  });
  const [status, setStatus] = useState<TileStatus>(() => {
    const stored = sessionStorage.getItem('attendanceSubMode');
    return stored ? 'selecting' : 'mode-select';
  });

  const selectMode = (mode: SubMode) => {
    setSubMode(mode);
    sessionStorage.setItem('attendanceSubMode', mode);
    setStatus('selecting');
  };

  const toggleSubMode = () => {
    const newMode = subMode === 'clock-in' ? 'clock-out' : 'clock-in';
    setSubMode(newMode);
    sessionStorage.setItem('attendanceSubMode', newMode);
  };
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [users, setUsers] = useState<UserType[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [infringementData, setInfringementData] = useState<{ recordId: number; type: 'late_arrival' | 'early_departure'; employeeName: string } | null>(null);
  const [webcamReady, setWebcamReady] = useState(false);
  const webcamRef = useRef<Webcam>(null);

  const capturePhoto = useCallback((): string | null => {
    if (webcamRef.current && webcamReady) {
      try {
        const imageSrc = webcamRef.current.getScreenshot({ width: 640, height: 480 });
        return imageSrc;
      } catch (e) {
        console.warn('Webcam capture failed:', e);
        return null;
      }
    }
    return null;
  }, [webcamReady]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadAttendance = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const records = await attendanceApi.getAll(today, today);
      setAttendanceRecords(records);
    } catch (err) {
      console.error('Failed to load attendance:', err);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const [usersData, deptsData, attendanceData] = await Promise.all([
          userApi.getAllForKiosk(),
          departmentApi.getAll(),
          attendanceApi.getAll(today, today)
        ]);
        setUsers(usersData);
        setDepartments(deptsData);
        setAttendanceRecords(attendanceData);
      } catch (err) {
        console.error('Failed to load users:', err);
        setError('Failed to load employee data');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Calculate who is currently clocked in
  const clockedInUserIds = useMemo(() => {
    if (attendanceRecords.length === 0) return new Set<string>();
    
    const now = new Date();
    const userLastAction = new Map<string, { type: string; timestamp: Date }>();
    
    const sortedRecords = [...attendanceRecords].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    sortedRecords.forEach(record => {
      const recordTime = new Date(record.timestamp);
      if (recordTime <= now) {
        userLastAction.set(record.userId, { type: record.type, timestamp: recordTime });
      }
    });
    
    const clockedIn = new Set<string>();
    userLastAction.forEach((action, odewUserId) => {
      if (action.type === 'in') {
        clockedIn.add(odewUserId);
      }
    });
    
    return clockedIn;
  }, [attendanceRecords]);

  const filteredUsers = useMemo(() => {
    let result = users;
    
    if (selectedDepartment !== 'all') {
      result = result.filter(u => u.department === selectedDepartment);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(u => 
        u.firstName.toLowerCase().includes(query) ||
        u.surname.toLowerCase().includes(query) ||
        u.id.toLowerCase().includes(query) ||
        (u.nickname && u.nickname.toLowerCase().includes(query))
      );
    }
    
    return result.sort((a, b) => a.firstName.localeCompare(b.firstName));
  }, [users, searchQuery, selectedDepartment]);

  const handleTileClick = (user: UserType) => {
    setSelectedUser(user);
    setStatus('confirm');
    setError('');
  };

  const handleConfirmAttendance = async () => {
    if (!selectedUser) return;
    
    setStatus('recording');
    try {
      const now = new Date();
      
      const capturedPhoto = capturePhoto();

      const record = await attendanceApi.create({
        userId: selectedUser.id,
        type: subMode === 'clock-in' ? 'in' : 'out',
        photoUrl: capturedPhoto || selectedUser.photoUrl || null,
        method: 'tile',
        context: 'attendance'
      });
      
      const timeStr = now.toLocaleTimeString('en-ZA', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
      
      setSuccessMessage(
        subMode === 'clock-in' 
          ? `${selectedUser.firstName} clocked in at ${timeStr}`
          : `${selectedUser.firstName} clocked out at ${timeStr}`
      );
      setStatus('success');
      
      loadAttendance();
      
      if (record.isInfringement) {
        setInfringementData({
          recordId: record.id,
          type: record.isInfringement as 'late_arrival' | 'early_departure',
          employeeName: `${selectedUser.firstName} ${selectedUser.surname}`,
        });
      } else {
        setTimeout(() => {
          setStatus('selecting');
          setSelectedUser(null);
          setSuccessMessage('');
        }, 3000);
      }
      
    } catch (err) {
      console.error('Failed to record attendance:', err);
      setError('Failed to record attendance. Please try again.');
      setStatus('error');
    }
  };

  const handleCancel = () => {
    setStatus('selecting');
    setSelectedUser(null);
    setError('');
  };

  const getDepartmentName = (deptName: string | null) => {
    if (!deptName) return 'No Department';
    return deptName;
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-ZA', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-ZA', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-white text-lg">Loading employees...</p>
        </div>
      </div>
    );
  }

  if (status === 'mode-select') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <Grid3X3 className="h-16 w-16 text-primary mx-auto mb-4" />
            <h1 className="text-3xl sm:text-4xl font-heading font-bold text-white mb-2">
              Tile Mode Attendance
            </h1>
            <p className="text-slate-400 text-lg">Select what you want to record</p>
          </div>
          
          <div className="grid sm:grid-cols-2 gap-6">
            <Card 
              className="cursor-pointer hover:scale-105 transition-transform duration-300 bg-green-900/30 border-green-500/50 hover:border-green-400"
              onClick={() => selectMode('clock-in')}
              data-testid="card-select-clock-in"
            >
              <CardContent className="p-8 text-center">
                <div className="w-20 h-20 mx-auto mb-4 bg-green-500/20 rounded-full flex items-center justify-center">
                  <LogIn className="w-10 h-10 text-green-400" />
                </div>
                <h2 className="text-2xl font-bold text-green-300 mb-2">
                  CLOCK IN
                </h2>
                <p className="text-green-400/70">
                  Record employee arrivals
                </p>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:scale-105 transition-transform duration-300 bg-orange-900/30 border-orange-500/50 hover:border-orange-400"
              onClick={() => selectMode('clock-out')}
              data-testid="card-select-clock-out"
            >
              <CardContent className="p-8 text-center">
                <div className="w-20 h-20 mx-auto mb-4 bg-orange-500/20 rounded-full flex items-center justify-center">
                  <LogOut className="w-10 h-10 text-orange-400" />
                </div>
                <h2 className="text-2xl font-bold text-orange-300 mb-2">
                  CLOCK OUT
                </h2>
                <p className="text-orange-400/70">
                  Record employee departures
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="text-center mt-8">
            <Button
              variant="ghost"
              onClick={() => setLocation('/')}
              className="text-slate-400 hover:text-white"
              data-testid="button-back-home"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 sm:p-6">
      <Webcam
        ref={webcamRef}
        audio={false}
        screenshotFormat="image/jpeg"
        screenshotQuality={0.6}
        videoConstraints={{ width: 640, height: 480, facingMode: 'user' }}
        onUserMedia={() => setWebcamReady(true)}
        onUserMediaError={() => setWebcamReady(false)}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none', overflow: 'hidden' }}
      />
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => setLocation('/')}
              className="text-white hover:bg-white/10"
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className={`text-2xl sm:text-3xl font-heading font-bold ${
                subMode === 'clock-in' ? 'text-green-400' : 'text-orange-400'
              }`}>
                {subMode === 'clock-in' ? 'Clock In' : 'Clock Out'} - Tile Mode
              </h1>
              <p className="text-slate-400 text-sm">Tap your tile to record attendance</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-end">
            <Button
              onClick={toggleSubMode}
              className={`${
                subMode === 'clock-in' 
                  ? 'bg-orange-600 hover:bg-orange-700' 
                  : 'bg-green-600 hover:bg-green-700'
              }`}
              data-testid="button-toggle-mode"
            >
              {subMode === 'clock-in' ? (
                <>
                  <LogOut className="h-4 w-4 mr-2" />
                  Switch to Clock Out
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4 mr-2" />
                  Switch to Clock In
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (subMode) {
                  sessionStorage.setItem('attendanceSubMode', subMode);
                }
                setLocation('/attendance-kiosk');
              }}
              className="border-white/20 text-white hover:bg-white/10"
              data-testid="button-camera-mode"
            >
              <Camera className="h-4 w-4 mr-2" />
              Camera Mode
            </Button>
            <div className="text-right hidden sm:block">
              <div className="text-3xl font-mono text-white font-bold flex items-center gap-2">
                <Clock className="h-6 w-6" />
                {formatTime(currentTime)}
              </div>
              <div className="text-slate-400 text-sm">{formatDate(currentTime)}</div>
            </div>
          </div>
        </div>

        {status === 'selecting' && (
          <>
            <div className={`mb-6 p-4 rounded-xl text-center text-xl font-bold ${
              subMode === 'clock-in' 
                ? 'bg-green-600/30 border-2 border-green-500 text-green-300' 
                : 'bg-orange-600/30 border-2 border-orange-500 text-orange-300'
            }`}>
              {subMode === 'clock-in' ? (
                <span className="flex items-center justify-center gap-3">
                  <LogIn className="h-6 w-6" />
                  CLOCK IN MODE - Tap employee to record arrival
                </span>
              ) : (
                <span className="flex items-center justify-center gap-3">
                  <LogOut className="h-6 w-6" />
                  CLOCK OUT MODE - Tap employee to record departure
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search by name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-slate-400 h-12"
                  data-testid="input-search"
                />
              </div>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="h-12 px-4 rounded-lg bg-white/10 border border-white/20 text-white min-w-[200px]"
                data-testid="select-department"
              >
                <option value="all" className="bg-slate-800">All Departments</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.name} className="bg-slate-800">
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4 text-slate-400">
              <Grid3X3 className="inline h-4 w-4 mr-2" />
              Showing {filteredUsers.length} employee{filteredUsers.length !== 1 ? 's' : ''}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {filteredUsers.map((user) => {
                const isClockedIn = clockedInUserIds.has(user.id);
                return (
                  <button
                    key={user.id}
                    onClick={() => handleTileClick(user)}
                    className={`group relative rounded-xl p-3 sm:p-4 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 text-left border-2 ${
                      isClockedIn 
                        ? 'bg-green-900/40 border-green-500 hover:bg-green-800/50 hover:border-green-400' 
                        : 'bg-red-900/40 border-red-500 hover:bg-red-800/50 hover:border-red-400'
                    }`}
                    data-testid={`tile-user-${user.id}`}
                  >
                    <div className={`aspect-square mb-3 rounded-lg overflow-hidden flex items-center justify-center ${
                      isClockedIn ? 'bg-green-800/50' : 'bg-red-800/50'
                    }`}>
                      <img 
                        src={user.photoUrl || defaultAvatarUrl} 
                        alt={`${user.firstName} ${user.surname}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-white text-sm sm:text-base truncate group-hover:text-primary transition-colors">
                        {user.firstName} {user.surname}
                      </p>
                      {user.nickname && (
                        <p className="text-xs text-slate-300 truncate">"{user.nickname}"</p>
                      )}
                      <p className="text-xs text-slate-400 truncate">
                        {getDepartmentName(user.department)}
                      </p>
                    </div>
                    <div className={`absolute top-2 right-2 w-3 h-3 rounded-full ${
                      isClockedIn ? 'bg-green-400' : 'bg-red-400'
                    }`} />
                  </button>
                );
              })}
            </div>

            {filteredUsers.length === 0 && (
              <div className="text-center py-12">
                <User className="h-16 w-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400 text-lg">No employees found</p>
                <p className="text-slate-500 text-sm">Try adjusting your search or filter</p>
              </div>
            )}
          </>
        )}

        {status === 'confirm' && selectedUser && (
          <div className="flex items-center justify-center min-h-[60vh]">
            <Card className="w-full max-w-md bg-white/10 border-white/20 backdrop-blur-sm">
              <CardContent className="p-6 sm:p-8 text-center">
                <div className="w-32 h-32 sm:w-40 sm:h-40 mx-auto mb-6 rounded-full overflow-hidden bg-slate-700 border-4 border-white/20">
                  <img 
                    src={selectedUser.photoUrl || defaultAvatarUrl} 
                    alt={`${selectedUser.firstName} ${selectedUser.surname}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                  {selectedUser.firstName} {selectedUser.surname}
                </h2>
                {selectedUser.nickname && (
                  <p className="text-slate-400 mb-2">"{selectedUser.nickname}"</p>
                )}
                <p className="text-slate-400 mb-6">
                  {getDepartmentName(selectedUser.department)}
                </p>

                <div className={`text-lg font-semibold mb-6 ${
                  subMode === 'clock-in' ? 'text-green-400' : 'text-orange-400'
                }`}>
                  {subMode === 'clock-in' ? (
                    <span className="flex items-center justify-center gap-2">
                      <LogIn className="h-5 w-5" />
                      Clock In at {formatTime(currentTime)}?
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <LogOut className="h-5 w-5" />
                      Clock Out at {formatTime(currentTime)}?
                    </span>
                  )}
                </div>

                <div className="flex gap-4">
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    className="flex-1 h-14 text-lg border-white/20 text-white hover:bg-white/10"
                    data-testid="button-cancel"
                  >
                    <XCircle className="h-5 w-5 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfirmAttendance}
                    className={`flex-1 h-14 text-lg ${
                      subMode === 'clock-in' 
                        ? 'bg-green-600 hover:bg-green-700' 
                        : 'bg-orange-600 hover:bg-orange-700'
                    }`}
                    data-testid="button-confirm"
                  >
                    <CheckCircle2 className="h-5 w-5 mr-2" />
                    Confirm
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {status === 'recording' && (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto mb-4" />
              <p className="text-white text-xl">Recording attendance...</p>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="flex items-center justify-center min-h-[60vh]">
            <Card className={`w-full max-w-md border-2 ${
              subMode === 'clock-in' ? 'bg-green-900/50 border-green-500' : 'bg-orange-900/50 border-orange-500'
            }`}>
              <CardContent className="p-8 text-center">
                <CheckCircle2 className={`h-20 w-20 mx-auto mb-4 ${
                  subMode === 'clock-in' ? 'text-green-400' : 'text-orange-400'
                }`} />
                <h2 className="text-2xl font-bold text-white mb-2">
                  {subMode === 'clock-in' ? 'Clocked In!' : 'Clocked Out!'}
                </h2>
                <p className="text-slate-300">{successMessage}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {status === 'error' && (
          <div className="flex items-center justify-center min-h-[60vh]">
            <Card className="w-full max-w-md bg-red-900/50 border-2 border-red-500">
              <CardContent className="p-8 text-center">
                <XCircle className="h-20 w-20 text-red-400 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">Error</h2>
                <p className="text-slate-300 mb-6">{error}</p>
                <Button
                  onClick={handleCancel}
                  variant="outline"
                  className="border-white/20 text-white hover:bg-white/10"
                  data-testid="button-try-again"
                >
                  Try Again
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <InfringementReasonDialog
        open={!!infringementData}
        onClose={() => {
          setInfringementData(null);
          setStatus('selecting');
          setSelectedUser(null);
          setSuccessMessage('');
        }}
        recordId={infringementData?.recordId ?? 0}
        infringementType={infringementData?.type ?? 'late_arrival'}
        employeeName={infringementData?.employeeName}
      />
    </div>
  );
}
