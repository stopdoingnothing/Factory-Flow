import { useState, useRef, useCallback, useEffect } from 'react';
import { useLocation } from 'wouter';
import Webcam from 'react-webcam';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  LogIn, LogOut, CheckCircle2, XCircle, Loader2, ScanFace, 
  User, ArrowLeft, RefreshCw, Clock, Smartphone
} from 'lucide-react';
import { loadFaceModels, detectFaceWithFeedback, findMatchesForUser } from '@/lib/face-recognition';
import { userApi, attendanceApi, settingsApi, faceApi, type FaceDescriptorUser } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import InfringementReasonDialog from '@/components/InfringementReasonDialog';

const useWakeLock = () => {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const requestWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      } catch (err) {
        console.log('Wake Lock request failed:', err);
      }
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  }, []);

  useEffect(() => {
    requestWakeLock();
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      releaseWakeLock();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [requestWakeLock, releaseWakeLock]);
};

const useInstallPrompt = () => {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    
    window.addEventListener('beforeinstallprompt', handler);
    
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }
    
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const promptInstall = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setInstallPrompt(null);
    }
  };

  return { canInstall: !!installPrompt && !isInstalled, promptInstall, isInstalled };
};

type SubMode = 'clock-in' | 'clock-out';
type KioskStatus = 'ready' | 'scanning' | 'confirm-identity' | 'recording' | 'success' | 'error' | 'id-input';

interface RecognizedWorker {
  id: string;
  name: string;
  department: string;
}

export default function AttendanceKiosk() {
  const [, setLocation] = useLocation();
  const webcamRef = useRef<Webcam>(null);
  
  useWakeLock();
  const { canInstall, promptInstall } = useInstallPrompt();
  
  const { data: companyNameSetting } = useQuery({
    queryKey: ['settings', 'company_name'],
    queryFn: () => settingsApi.get('company_name'),
  });
  
  const companyName = companyNameSetting?.value || 'AECE Checkpoint';
  
  const subMode = (sessionStorage.getItem('attendanceSubMode') || 'clock-in') as SubMode;
  const [status, setStatus] = useState<KioskStatus>('ready');
  const [modelsReady, setModelsReady] = useState(false);
  const [recognizedWorker, setRecognizedWorker] = useState<RecognizedWorker | null>(null);
  const [error, setError] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [workerId, setWorkerId] = useState('');
  const faceUserMap = useRef<Map<string, { meta: FaceDescriptorUser; descriptors: FaceDescriptorUser[] }>>(new Map());
  const [faceUserCount, setFaceUserCount] = useState(0);
  const recentDescriptors = useRef<Float32Array[]>([]);
  const [scanFeedback, setScanFeedback] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState('');
  const noMatchFrames = useRef(0);
  const capturedPhoto = useRef<string | null>(null);
  const [noMatchFallback, setNoMatchFallback] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [infringementData, setInfringementData] = useState<{ recordId: number; type: 'late_arrival' | 'early_departure'; employeeName: string } | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const init = async () => {
      await loadFaceModels();
      const flatUsers = await faceApi.getAllFaceDescriptors(true);

      const map = new Map<string, { meta: FaceDescriptorUser; descriptors: FaceDescriptorUser[] }>();
      for (const u of flatUsers) {
        if (!u.faceDescriptor) continue;
        if (!map.has(u.id)) map.set(u.id, { meta: u, descriptors: [] });
        map.get(u.id)!.descriptors.push(u);
      }
      faceUserMap.current = map;
      setFaceUserCount(map.size);
      setModelsReady(true);
      setStatus('scanning');
    };
    init();
  }, []);

  const recordAttendance = async (userId: string, method: 'face' | 'id') => {
    setStatus('recording');
    try {
      let photoUrl = capturedPhoto.current ?? null;
      if (!photoUrl && webcamRef.current) {
        photoUrl = webcamRef.current.getScreenshot();
      }
      capturedPhoto.current = null;
      
      const record = await attendanceApi.create({
        userId,
        type: subMode === 'clock-in' ? 'in' : 'out',
        photoUrl,
        method,
        context: 'attendance'
      });
      
      setStatus('success');
      setSuccessMessage(subMode === 'clock-in' ? 'Clocked In Successfully!' : 'Clocked Out Successfully!');
      
      if (record.isInfringement) {
        const workerName = recognizedWorker?.name || '';
        setInfringementData({
          recordId: record.id,
          type: record.isInfringement as 'late_arrival' | 'early_departure',
          employeeName: workerName,
        });
      } else {
        setTimeout(() => {
          resetKiosk();
        }, 3000);
      }
    } catch (err: any) {
      setStatus('error');
      setError(err.message || 'Failed to record attendance');
      setTimeout(() => {
        resetKiosk();
      }, 3000);
    }
  };

  const resetKiosk = () => {
    recentDescriptors.current = [];
    noMatchFrames.current = 0;
    capturedPhoto.current = null;
    setScanFeedback('');
    setNoMatchFallback(false);
    setStatus('scanning');
    setRecognizedWorker(null);
    setError('');
    setWorkerId('');
    setSuccessMessage('');
  };

  const detectAndMatchFace = useCallback(async () => {
    if (!modelsReady || detecting || status !== 'scanning') return;
    if (!webcamRef.current?.video || webcamRef.current.video.readyState !== 4) return;

    setDetecting(true);
    try {
      const video = webcamRef.current.video;
      const result = await detectFaceWithFeedback(video);
      setScanFeedback(result.message);

      if (result.status !== 'face_detected' || !result.descriptor) {
        recentDescriptors.current = [];
        return;
      }

      // Rolling 5-frame average
      recentDescriptors.current.push(result.descriptor);
      if (recentDescriptors.current.length > 5) recentDescriptors.current.shift();

      const avgDescriptor = new Float32Array(128);
      for (let i = 0; i < 128; i++) {
        let s = 0;
        for (const d of recentDescriptors.current) s += d[i];
        avgDescriptor[i] = s / recentDescriptors.current.length;
      }
      const queryDescriptor = recentDescriptors.current.length >= 2 ? avgDescriptor : result.descriptor;

      const MATCH_THRESHOLD = 0.6;
      const MIN_GAP = 0.1;

      // Per-user matching — find each user's best distance across all their descriptors
      const userMatches: { meta: FaceDescriptorUser; bestDistance: number }[] = [];
      for (const [, { meta, descriptors }] of faceUserMap.current) {
        const { bestDistance } = findMatchesForUser(queryDescriptor, descriptors, 1.0);
        if (bestDistance < Infinity) userMatches.push({ meta, bestDistance });
      }
      userMatches.sort((a, b) => a.bestDistance - b.bestDistance);

      const top = userMatches[0] ?? null;
      const second = userMatches[1] ?? null;

      const hasClearMatch =
        top !== null &&
        top.bestDistance < MATCH_THRESHOLD &&
        (!second || second.bestDistance - top.bestDistance >= MIN_GAP);

      if (hasClearMatch) {
        recentDescriptors.current = [];
        noMatchFrames.current = 0;
        setRecognizedWorker({
          id: top.meta.id,
          name: `${top.meta.firstName} ${top.meta.surname}`,
          department: '',
        });
        setStatus('confirm-identity');
      } else if (faceUserMap.current.size > 0) {
        // Face was clearly visible but didn't match anyone — count consecutive misses
        noMatchFrames.current += 1;
        const NO_MATCH_LIMIT = 3;
        if (noMatchFrames.current >= NO_MATCH_LIMIT) {
          noMatchFrames.current = 0;
          recentDescriptors.current = [];
          capturedPhoto.current = webcamRef.current?.getScreenshot() ?? null;
          setNoMatchFallback(true);
          setStatus('id-input');
        }
      }
    } catch (err) {
      console.error('Face detection error:', err);
    } finally {
      setDetecting(false);
    }
  }, [modelsReady, detecting, status]);

  useEffect(() => {
    if (status !== 'scanning' || !modelsReady) return;
    
    const interval = setInterval(detectAndMatchFace, 1500);
    return () => clearInterval(interval);
  }, [status, modelsReady, detectAndMatchFace]);

  const handleIdSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerId.trim()) return;

    try {
      const user = await userApi.kioskLookup(workerId.trim());
      setRecognizedWorker({
        id: user.id,
        name: `${user.firstName} ${user.surname}`,
        department: user.department || ''
      });
      recordAttendance(user.id, 'id');
    } catch (err: any) {
      setError(err.message || 'Employee not found');
    }
  };

  const handleConfirmIdentity = () => {
    if (recognizedWorker) {
      recordAttendance(recognizedWorker.id, 'face');
    }
  };

  const handleDenyIdentity = () => {
    setStatus('id-input');
    setRecognizedWorker(null);
  };

  const isClockIn = subMode === 'clock-in';

  return (
    <div className={`min-h-screen flex flex-col ${isClockIn ? 'bg-green-900' : 'bg-red-900'}`}>
      <div className={`p-3 sm:p-4 ${isClockIn ? 'bg-green-800' : 'bg-red-800'} flex items-center justify-between`}>
        <button 
          onClick={() => setLocation('/')}
          className="text-white/80 hover:text-white flex items-center gap-1 sm:gap-2 text-sm sm:text-base"
          data-testid="button-exit"
        >
          <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="hidden sm:inline">Exit</span>
        </button>
        
        <div className="flex items-center gap-2 sm:gap-3 text-white">
          {isClockIn ? <LogIn className="w-6 h-6 sm:w-8 sm:h-8" /> : <LogOut className="w-6 h-6 sm:w-8 sm:h-8" />}
          <span className="font-oswald text-xl sm:text-3xl font-bold tracking-wider">
            {isClockIn ? 'CLOCK IN' : 'CLOCK OUT'}
          </span>
        </div>
        
        <div className="flex items-center gap-1 sm:gap-2 text-white/80">
          <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="font-mono text-sm sm:text-lg" data-testid="text-time">
            {currentTime.toLocaleTimeString()}
          </span>
        </div>
      </div>

      {canInstall && (
        <div className="bg-blue-600 text-white px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" />
            <span className="text-sm">Install app for better experience</span>
          </div>
          <Button 
            size="sm" 
            variant="secondary" 
            onClick={promptInstall}
            data-testid="button-install-app"
          >
            Install
          </Button>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <Card className="w-full max-w-2xl bg-white/95 backdrop-blur shadow-2xl border-0">
          <CardContent className="p-4 sm:p-8">
            {status === 'confirm-identity' && recognizedWorker ? (
              <div className="space-y-6">
                <div className="text-center">
                  <ScanFace className="w-20 h-20 mx-auto text-blue-500 mb-4" />
                  <h2 className="font-oswald text-2xl sm:text-3xl font-bold text-slate-800 mb-2">
                    Is this you?
                  </h2>
                  <p className="text-3xl sm:text-4xl font-bold text-blue-600 mb-2">
                    {recognizedWorker.name}
                  </p>
                  {recognizedWorker.department && (
                    <p className="text-lg text-slate-500">{recognizedWorker.department}</p>
                  )}
                </div>
                
                <div className="flex gap-4">
                  <Button 
                    variant="outline"
                    className="flex-1 h-16 text-lg border-red-300 text-red-600 hover:bg-red-50"
                    onClick={handleDenyIdentity}
                    data-testid="button-not-me"
                  >
                    <XCircle className="w-6 h-6 mr-2" />
                    Not Me
                  </Button>
                  <Button 
                    className={`flex-1 h-16 text-lg ${isClockIn ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                    onClick={handleConfirmIdentity}
                    data-testid="button-confirm-identity"
                  >
                    <CheckCircle2 className="w-6 h-6 mr-2" />
                    Yes, {isClockIn ? 'Clock In' : 'Clock Out'}
                  </Button>
                </div>
                
                <p className="text-center text-sm text-slate-500">
                  If this is not you, click "Not Me" to enter your Employee ID instead
                </p>
              </div>
            ) : status === 'id-input' ? (
              <div className="space-y-6">
                <div className="text-center">
                  <User className="w-16 h-16 mx-auto text-slate-400 mb-4" />
                  <h2 className="font-oswald text-2xl font-bold text-slate-800">Enter Employee ID</h2>
                  {noMatchFallback && (
                    <p className="text-sm text-amber-600 mt-1">
                      Face not recognised — please enter your ID to clock {subMode === 'clock-in' ? 'in' : 'out'}
                    </p>
                  )}
                </div>
                
                <form onSubmit={handleIdSubmit} className="space-y-4">
                  <Input
                    type="text"
                    placeholder="Employee ID"
                    value={workerId}
                    onChange={(e) => setWorkerId(e.target.value)}
                    className="text-center text-2xl h-16"
                    autoFocus
                    data-testid="input-worker-id"
                  />
                  
                  {error && (
                    <p className="text-red-500 text-center" data-testid="text-error">{error}</p>
                  )}
                  
                  <div className="flex gap-4">
                    <Button 
                      type="button"
                      variant="outline"
                      className="flex-1 h-14"
                      onClick={() => {
                        setStatus('scanning');
                        setWorkerId('');
                        setError('');
                        setNoMatchFallback(false);
                        capturedPhoto.current = null;
                        noMatchFrames.current = 0;
                      }}
                      data-testid="button-use-face"
                    >
                      <ScanFace className="w-5 h-5 mr-2" />
                      Use Face
                    </Button>
                    <Button 
                      type="submit"
                      className={`flex-1 h-14 ${isClockIn ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                      data-testid="button-submit-id"
                    >
                      {isClockIn ? 'Clock In' : 'Clock Out'}
                    </Button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="relative rounded-xl overflow-hidden bg-slate-900 aspect-[4/3] sm:aspect-video">
                  <Webcam
                    ref={webcamRef}
                    audio={false}
                    screenshotFormat="image/jpeg"
                    videoConstraints={{ 
                      facingMode: 'user', 
                      width: { ideal: 640 }, 
                      height: { ideal: 480 },
                      aspectRatio: { ideal: 4/3 }
                    }}
                    className="w-full h-full object-cover"
                    onUserMediaError={(err) => {
                      console.error('Camera error:', err);
                      setError('Camera access denied. Please allow camera permissions.');
                    }}
                  />
                  
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className={`w-40 h-40 sm:w-56 sm:h-56 rounded-full border-4 ${
                      status === 'recording' ? (isClockIn ? 'border-green-500' : 'border-red-500') :
                      status === 'success' ? 'border-green-400' :
                      status === 'error' ? 'border-red-400' :
                      status === 'scanning' ? `${isClockIn ? 'border-green-400' : 'border-red-400'} animate-pulse` :
                      'border-white/50'
                    } transition-colors`} />
                  </div>

                  {status === 'success' && (
                    <div className="absolute inset-0 bg-green-500/90 flex flex-col items-center justify-center p-4">
                      <CheckCircle2 className="w-16 h-16 sm:w-24 sm:h-24 text-white mb-2 sm:mb-4" />
                      <p className="text-white text-xl sm:text-3xl font-bold text-center">{successMessage}</p>
                      {recognizedWorker && (
                        <p className="text-white/90 text-lg sm:text-xl mt-2">{recognizedWorker.name}</p>
                      )}
                    </div>
                  )}

                  {status === 'error' && (
                    <div className="absolute inset-0 bg-red-500/90 flex flex-col items-center justify-center p-4">
                      <XCircle className="w-16 h-16 sm:w-24 sm:h-24 text-white mb-2 sm:mb-4" />
                      <p className="text-white text-xl sm:text-2xl font-bold">Error</p>
                      <p className="text-white/90 text-base sm:text-lg mt-2 text-center">{error}</p>
                    </div>
                  )}
                  
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 sm:p-6">
                    <div className="flex items-center justify-center gap-2 sm:gap-3 text-white text-base sm:text-xl">
                      {status === 'ready' && (
                        <>
                          <Loader2 className="w-6 h-6 animate-spin" />
                          <span>Initializing...</span>
                        </>
                      )}
                      {status === 'scanning' && (
                        <>
                          <ScanFace className="w-6 h-6 animate-pulse" />
                          <span>
                            {faceUserCount === 0
                              ? 'No faces registered - Use ID instead'
                              : scanFeedback || 'Look at the camera'}
                          </span>
                        </>
                      )}
                      {status === 'recording' && (
                        <>
                          <Loader2 className="w-6 h-6 animate-spin" />
                          <span>Recording...</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 sm:gap-4">
                  <Button 
                    variant="outline"
                    className="flex-1 h-12 sm:h-14 text-sm sm:text-base"
                    onClick={() => setStatus('id-input')}
                    disabled={status === 'recording' || status === 'success'}
                    data-testid="button-use-id"
                  >
                    <User className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
                    <span className="hidden sm:inline">Use ID Instead</span>
                    <span className="sm:hidden">Use ID</span>
                  </Button>
                  <Button 
                    variant="outline"
                    className="flex-1 h-12 sm:h-14 text-sm sm:text-base"
                    onClick={resetKiosk}
                    disabled={status === 'recording'}
                    data-testid="button-reset"
                  >
                    <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
                    Reset
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className={`p-4 ${isClockIn ? 'bg-green-800' : 'bg-red-800'} text-center`}>
        <p className="text-white/60 text-sm">
          {companyName} • {isClockIn ? 'Morning Entry' : 'Evening Departure'}
        </p>
      </div>

      <InfringementReasonDialog
        open={!!infringementData}
        onClose={() => {
          setInfringementData(null);
          resetKiosk();
        }}
        recordId={infringementData?.recordId ?? 0}
        infringementType={infringementData?.type ?? 'late_arrival'}
        employeeName={infringementData?.employeeName}
      />
    </div>
  );
}
