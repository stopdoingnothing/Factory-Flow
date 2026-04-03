import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import Webcam from 'react-webcam';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { User, ScanFace, ArrowRight, AlertCircle, Sun, Move, Users, ZoomIn, ZoomOut, Loader2, CheckCircle2, ShieldCheck, Mail, Lock, Search } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { authApi, faceApi, settingsApi, userSearchApi, passwordResetApi, type FaceDescriptorUser, type EmployeeSearchResult } from '@/lib/api';
import { loadFaceModels, detectFaceWithFeedback, compareFaceDescriptors, isFaceMatch, jsonToDescriptor, type FaceDetectionStatus } from '@/lib/face-recognition';
import { useQuery } from '@tanstack/react-query';
import aeceLogo from '@assets/AECE_Logo_1765516911038.png';

export default function Login() {
  const [, setLocation] = useLocation();
  const { setUser } = useAuth();
  const webcamRef = useRef<Webcam>(null);

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

  type LoginMode = 'face' | 'id' | 'manager-approval';
  const [loginMode, setLoginMode] = useState<LoginMode>('id');

  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Face recognition — after a match is confirmed, hold the matched user here so
  // the always-visible password field can be submitted against the identified user.
  const [pendingFaceUserId, setPendingFaceUserId] = useState<string | null>(null);
  const [pendingFaceUserName, setPendingFaceUserName] = useState<string | null>(null);
  const [facePassword, setFacePassword] = useState('');
  const [facePasswordError, setFacePasswordError] = useState('');
  const [facePasswordLoading, setFacePasswordLoading] = useState(false);

  // Forgot password flow
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  // Manager-approval flow state
  const [approvalStep, setApprovalStep] = useState<1 | 2>(1);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeResults, setEmployeeResults] = useState<EmployeeSearchResult[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeSearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [managerEmail, setManagerEmail] = useState('');
  const [managerPassword, setManagerPassword] = useState('');
  const [approvalError, setApprovalError] = useState('');
  const [approvalLoading, setApprovalLoading] = useState(false);

  const resetApprovalFlow = () => {
    setEmployeeSearch('');
    setEmployeeResults([]);
    setSelectedEmployee(null);
    setManagerEmail('');
    setManagerPassword('');
    setApprovalError('');
    setApprovalStep(1);
  };

  const resetFaceFlow = () => {
    setPendingFaceUserId(null);
    setPendingFaceUserName(null);
    setFacePassword('');
    setFacePasswordError('');
    setFaceStatus('scanning');
    setFaceMessage('');
    setMatchPercentage(null);
    setMatchName(null);
    setRecognizedUser(null);
    setModelsReady(true);
  };

  const [modelsReady, setModelsReady] = useState(false);
  const [faceUsers, setFaceUsers] = useState<FaceDescriptorUser[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [recognizedUser, setRecognizedUser] = useState<string | null>(null);
  const [faceStatus, setFaceStatus] = useState<'loading' | 'scanning' | 'recognized' | 'not_found'>('loading');
  const [faceMessage, setFaceMessage] = useState<string>('');
  const [detectionStatus, setDetectionStatus] = useState<FaceDetectionStatus | null>(null);
  const [matchPercentage, setMatchPercentage] = useState<number | null>(null);
  const [matchName, setMatchName] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const recentDescriptors = useRef<Float32Array[]>([]);

  useEffect(() => {
    initFaceRecognition();
  }, []);

  const initFaceRecognition = async () => {
    setFaceStatus('loading');
    try {
      const [loaded, users] = await Promise.all([
        loadFaceModels(),
        faceApi.getAllFaceDescriptors(false),
      ]);
      setModelsReady(loaded);
      setFaceUsers(users);
      if (loaded) {
        setFaceStatus('scanning');
      }
    } catch (err) {
      console.error('Failed to initialize face recognition:', err);
      setLoginMode('id');
    }
  };

  const detectAndMatchFace = useCallback(async () => {
    if (!modelsReady || !webcamRef.current || detecting || faceUsers.length === 0) return;

    const video = webcamRef.current.video;
    if (!video || video.readyState !== 4) return;

    setDetecting(true);

    try {
      const result = await detectFaceWithFeedback(video);
      setDetectionStatus(result.status);
      setFaceMessage(result.message);

      if (result.status !== 'face_detected' || !result.descriptor) {
        recentDescriptors.current = [];
        setMatchPercentage(null);
        setMatchName(null);
        setDetecting(false);
        return;
      }

      recentDescriptors.current.push(result.descriptor);
      if (recentDescriptors.current.length > 5) {
        recentDescriptors.current.shift();
      }

      const avgDescriptor = new Float32Array(128);
      for (let i = 0; i < 128; i++) {
        let sum = 0;
        for (const desc of recentDescriptors.current) {
          sum += desc[i];
        }
        avgDescriptor[i] = sum / recentDescriptors.current.length;
      }

      const queryDescriptor = recentDescriptors.current.length >= 2 ? avgDescriptor : result.descriptor;

      const allMatches: { user: FaceDescriptorUser; distance: number }[] = [];

      for (const user of faceUsers) {
        const storedDescriptor = jsonToDescriptor(user.faceDescriptor);
        if (storedDescriptor) {
          const distance = compareFaceDescriptors(queryDescriptor, storedDescriptor);
          console.log(`Face match check: ${user.firstName} ${user.surname} - distance: ${distance.toFixed(3)}`);
          allMatches.push({ user, distance });
        }
      }

      allMatches.sort((a, b) => a.distance - b.distance);

      const bestMatch = allMatches[0] || null;
      const secondBestMatch = allMatches[1] || null;

      const MATCH_THRESHOLD = 0.7;
      const MIN_GAP = 0.1;

      let finalMatch = bestMatch;
      const secondMatch = allMatches.find(m => m !== finalMatch) || null;

      const hasClearMatch = finalMatch &&
        finalMatch.distance < MATCH_THRESHOLD &&
        (!secondMatch || (secondMatch.distance - finalMatch.distance) >= MIN_GAP);

      if (finalMatch && secondMatch) {
        console.log(`Best: ${finalMatch.user.firstName} (${finalMatch.distance.toFixed(3)}) | Second: ${secondMatch.user.firstName} (${secondMatch.distance.toFixed(3)}) | Gap: ${(secondMatch.distance - finalMatch.distance).toFixed(3)}`);
      }

      if (hasClearMatch) {
        const best = finalMatch;
        const maxDist = 1.2;
        const pct = Math.max(0, Math.min(100, ((maxDist - best.distance) / maxDist) * 100));
        setMatchPercentage(pct);
        setMatchName(`${best.user.firstName} ${best.user.surname}`);
        setFaceStatus('recognized');
        setFaceMessage(`Face recognised — enter your password to continue`);
        setRecognizedUser(`${best.user.firstName} ${best.user.surname}`);
        setModelsReady(false);
        // Pause scanning and prompt for password instead of auto-logging in
        setPendingFaceUserId(best.user.id);
        setPendingFaceUserName(`${best.user.firstName} ${best.user.surname}`);
        setFacePassword('');
        setFacePasswordError('');
        return;
      } else if (bestMatch) {
        const maxDistance = 1.2;
        const similarity = Math.max(0, Math.min(100, ((maxDistance - bestMatch.distance) / maxDistance) * 100));
        setMatchPercentage(similarity);
        setMatchName(`${bestMatch.user.firstName} ${bestMatch.user.surname}`);

        if (bestMatch.distance >= MATCH_THRESHOLD) {
          setFaceMessage(`Scanning... (${similarity.toFixed(0)}% match)`);
        } else if (secondBestMatch && (secondBestMatch.distance - bestMatch.distance) < MIN_GAP) {
          setFaceMessage(`Multiple possible matches - move closer`);
        } else {
          setFaceMessage(`Matching... (${similarity.toFixed(0)}% match)`);
        }
      } else {
        setMatchPercentage(null);
        setMatchName(null);
      }
    } catch (err) {
      console.error('Face detection error:', err);
      setFaceMessage('Detection error - please try again');
    } finally {
      setDetecting(false);
    }
  }, [modelsReady, detecting, faceUsers, setUser, setLocation]);

  useEffect(() => {
    const isScanning = modelsReady && faceStatus === 'scanning';
    if (!isScanning) return;
    const interval = setInterval(detectAndMatchFace, 1500);
    return () => clearInterval(interval);
  }, [modelsReady, faceStatus, detectAndMatchFace]);

  const handleEmployeeSearch = async (q: string) => {
    setEmployeeSearch(q);
    if (q.length < 2) { setEmployeeResults([]); return; }
    setSearchLoading(true);
    try {
      const results = await userSearchApi.searchByName(q);
      setEmployeeResults(results);
    } catch {
      setEmployeeResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleManagerApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    setApprovalError('');
    setApprovalLoading(true);
    try {
      const user = await authApi.managerApprovedLogin(selectedEmployee.id, managerEmail, managerPassword);
      setUser(user);
      setLocation('/dashboard');
    } catch (err: any) {
      setApprovalError(err.message || 'Authorization failed. Please check your credentials.');
    } finally {
      setApprovalLoading(false);
    }
  };

  const handleIdSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await authApi.loginWorker(id, password);
      setUser(user);
      setLocation('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Invalid ID or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFacePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingFaceUserId) return;
    setFacePasswordError('');
    setFacePasswordLoading(true);
    try {
      const user = await authApi.loginWorker(pendingFaceUserId, facePassword);
      setUser(user);
      setLocation('/dashboard');
    } catch (err: any) {
      setFacePasswordError(err.message || 'Invalid password. Please try again.');
    } finally {
      setFacePasswordLoading(false);
    }
  };

  const cancelFacePassword = () => resetFaceFlow();

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotMessage('');
    try {
      await passwordResetApi.requestReset(forgotEmail);
      setForgotMessage('If an account exists with that email, a reset link has been sent.');
    } catch {
      setForgotMessage('If an account exists with that email, a reset link has been sent.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-sky-100 relative">
      <Card className="w-full max-w-md z-10 shadow-2xl border-0 bg-white/95 backdrop-blur-xl animate-in zoom-in-95 duration-500">
        <CardHeader className="text-center pb-2">
          <img src={companyLogo} alt={companyName} className="h-14 mx-auto mb-4" />
          <CardTitle className="text-3xl font-heading tracking-wide text-gray-900">{companyName.toUpperCase()}</CardTitle>
          <CardDescription className="text-gray-600 text-base">Staff Portal</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {loginMode === 'manager-approval' ? (
              approvalStep === 1 ? (
                /* Step 1: Employee search */
                <div className="space-y-4">
                  <div className="text-center space-y-1">
                    <div className="flex items-center justify-center gap-2">
                      <ShieldCheck className="h-6 w-6 text-primary" />
                      <h3 className="text-lg font-semibold text-gray-900">Manager-Approved Login</h3>
                    </div>
                    <p className="text-sm text-slate-500">Search for the employee who needs to log in.</p>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                    <Input
                      type="text"
                      placeholder="Search by name..."
                      value={employeeSearch}
                      onChange={e => handleEmployeeSearch(e.target.value)}
                      className="pl-10 h-12 text-base bg-white text-gray-900 border-slate-200"
                      autoFocus
                    />
                  </div>
                  {searchLoading && <p className="text-sm text-slate-400 text-center">Searching...</p>}
                  {!searchLoading && employeeSearch.length >= 2 && employeeResults.length === 0 && (
                    <p className="text-sm text-slate-400 text-center">No employees found.</p>
                  )}
                  {employeeResults.length > 0 && (
                    <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                      {employeeResults.map(emp => (
                        <button
                          key={emp.id}
                          onClick={() => { setSelectedEmployee(emp); setApprovalStep(2); }}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                        >
                          {emp.photoUrl ? (
                            <img src={emp.photoUrl} alt="" className="h-9 w-9 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <div className="h-9 w-9 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                              <User className="h-5 w-5 text-slate-400" />
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-gray-900 text-sm">{emp.firstName} {emp.surname}</div>
                            {emp.department && <div className="text-xs text-slate-400">{emp.department}</div>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => { setLoginMode('face'); resetApprovalFlow(); }}
                      className="text-sm text-slate-500 hover:text-primary underline"
                    >
                      Back to face recognition
                    </button>
                  </div>
                </div>
              ) : (
                /* Step 2: Manager credentials */
                <form onSubmit={handleManagerApproval} className="space-y-4">
                  <div className="text-center space-y-1">
                    <div className="flex items-center justify-center gap-2">
                      <ShieldCheck className="h-6 w-6 text-primary" />
                      <h3 className="text-lg font-semibold text-gray-900">Authorize Login</h3>
                    </div>
                    <p className="text-sm text-slate-500">
                      Logging in as <span className="font-medium text-gray-700">{selectedEmployee?.firstName} {selectedEmployee?.surname}</span>
                    </p>
                    <p className="text-xs text-slate-400">A manager must enter their credentials to authorize this login.</p>
                  </div>
                  <div className="space-y-3">
                    <div className="relative">
                      <Mail className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                      <Input
                        type="email"
                        placeholder="Manager email"
                        value={managerEmail}
                        onChange={e => setManagerEmail(e.target.value)}
                        className="pl-10 h-12 text-base bg-white text-gray-900 border-slate-200"
                        autoFocus
                        required
                      />
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                      <Input
                        type="password"
                        placeholder="Manager password"
                        value={managerPassword}
                        onChange={e => setManagerPassword(e.target.value)}
                        className="pl-10 h-12 text-base bg-white text-gray-900 border-slate-200"
                        required
                      />
                    </div>
                  </div>
                  {approvalError && (
                    <p className="text-red-500 text-sm font-medium text-center">{approvalError}</p>
                  )}
                  <Button type="submit" className="w-full h-12 btn-industrial text-base" disabled={approvalLoading}>
                    {approvalLoading ? 'Authorizing...' : 'Authorize Login'} {!approvalLoading && <ArrowRight className="ml-2 h-5 w-5" />}
                  </Button>
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => { setApprovalStep(1); setManagerEmail(''); setManagerPassword(''); setApprovalError(''); }}
                      className="text-sm text-slate-500 hover:text-primary underline"
                    >
                      Back to employee search
                    </button>
                  </div>
                </form>
              )
            ) : loginMode === 'face' ? (
              <>
                <div className="relative rounded-xl overflow-hidden bg-slate-900 aspect-video">
                  {cameraError ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                      <AlertCircle className="h-10 w-10 text-red-400" />
                      <p className="text-white text-sm font-medium">{cameraError}</p>
                      <button
                        onClick={() => { setCameraError(null); resetFaceFlow(); setLoginMode('id'); }}
                        className="text-xs text-sky-300 underline"
                      >
                        Use ID login instead
                      </button>
                    </div>
                  ) : (
                  <Webcam
                    ref={webcamRef}
                    audio={false}
                    screenshotFormat="image/jpeg"
                    videoConstraints={{ facingMode: 'user', width: 1280, height: 720 }}
                    className="w-full h-full object-cover"
                    onUserMediaError={(err) => {
                      const msg = err instanceof Error ? err.message : String(err);
                      if (msg.includes('Permission') || msg.includes('permission') || msg.includes('NotAllowed')) {
                        setCameraError('Camera permission denied. Please allow camera access in your browser settings.');
                      } else if (msg.includes('NotFound') || msg.includes('DevicesNotFound')) {
                        setCameraError('No camera found on this device.');
                      } else if (msg.includes('NotReadable') || msg.includes('TrackStart')) {
                        setCameraError('Camera is already in use by another application.');
                      } else {
                        setCameraError('Camera could not be started. Please check your browser settings.');
                      }
                    }}
                  />
                  )}

                  {!cameraError && <div className="absolute inset-0 flex items-center justify-center">
                    <div className={`w-48 h-48 rounded-full border-4 ${
                      faceStatus === 'recognized' ? 'border-green-500' :
                      faceStatus === 'scanning' && detectionStatus === 'face_detected' ? 'border-green-500 animate-pulse' :
                      faceStatus === 'scanning' && detectionStatus && detectionStatus !== 'face_detected' ? 'border-amber-500' :
                      faceStatus === 'scanning' ? 'border-primary animate-pulse' :
                      'border-white/50'
                    } transition-colors`} />
                  </div>}

                  {!cameraError && matchPercentage !== null && faceStatus === 'scanning' && (
                    <div className="absolute top-3 right-3 bg-black/70 rounded-lg px-3 py-2 text-white text-center" data-testid="match-percentage-badge">
                      <div className={`text-2xl font-bold ${matchPercentage >= 42 ? 'text-green-400' : matchPercentage >= 25 ? 'text-amber-400' : 'text-red-400'}`}>
                        {matchPercentage.toFixed(0)}%
                      </div>
                      <div className="text-xs text-gray-300 truncate max-w-[120px]">{matchName || 'Closest match'}</div>
                    </div>
                  )}
                  {!cameraError && faceStatus === 'recognized' && matchPercentage !== null && (
                    <div className="absolute top-3 right-3 bg-green-600/90 rounded-lg px-3 py-2 text-white text-center" data-testid="match-percentage-success">
                      <div className="text-2xl font-bold">{matchPercentage.toFixed(0)}%</div>
                      <div className="text-xs truncate max-w-[120px]">{matchName || 'Matched'}</div>
                    </div>
                  )}

                  {!cameraError && <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                    <div className="flex items-center justify-center gap-2 text-white" data-testid="face-feedback">
                      {faceStatus === 'loading' && (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          <span>Loading face recognition...</span>
                        </>
                      )}
                      {faceStatus === 'scanning' && (
                        <>
                          {detectionStatus === 'no_face' && <AlertCircle className="h-5 w-5 text-amber-400" />}
                          {detectionStatus === 'poor_lighting' && <Sun className="h-5 w-5 text-amber-400" />}
                          {detectionStatus === 'face_too_small' && <ZoomIn className="h-5 w-5 text-amber-400" />}
                          {detectionStatus === 'face_too_large' && <ZoomOut className="h-5 w-5 text-amber-400" />}
                          {detectionStatus === 'face_not_centered' && <Move className="h-5 w-5 text-amber-400" />}
                          {detectionStatus === 'multiple_faces' && <Users className="h-5 w-5 text-amber-400" />}
                          {detectionStatus === 'face_detected' && <ScanFace className="h-5 w-5 animate-pulse text-green-400" />}
                          {!detectionStatus && <ScanFace className="h-5 w-5 animate-pulse" />}
                          <span className={detectionStatus && detectionStatus !== 'face_detected' ? 'text-amber-300' : ''}>
                            {faceMessage || 'Look at the camera to login'}
                          </span>
                        </>
                      )}
                      {faceStatus === 'recognized' && (
                        <>
                          <CheckCircle2 className="h-5 w-5 text-green-400" />
                          <span>{faceMessage || `Welcome, ${recognizedUser}!`}</span>
                        </>
                      )}
                    </div>
                  </div>}
                </div>

                {faceUsers.length === 0 && modelsReady && (
                  <p className="text-sm text-amber-600 text-center">
                    No registered faces found. Please use ID login.
                  </p>
                )}

                {/* Password field — always visible; submit enabled once face is recognised */}
                <form onSubmit={handleFacePasswordSubmit} className="space-y-3 pt-1">
                  {pendingFaceUserId ? (
                    <p className="text-sm text-center text-slate-600">
                      Identified as <span className="font-semibold text-gray-900">{pendingFaceUserName}</span> — enter your password to continue.
                    </p>
                  ) : (
                    <p className="text-sm text-center text-slate-400">
                      Face recognition will identify you — then enter your password to sign in.
                    </p>
                  )}
                  <div className="relative">
                    <Lock className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                    <Input
                      type="password"
                      placeholder="Enter your password"
                      value={facePassword}
                      onChange={(e) => setFacePassword(e.target.value)}
                      className="pl-10 h-12 text-base bg-white text-gray-900 border-slate-200"
                      data-testid="input-face-password"
                    />
                  </div>
                  {facePasswordError && (
                    <p className="text-red-500 text-sm font-medium text-center">{facePasswordError}</p>
                  )}
                  <Button
                    type="submit"
                    className="w-full h-12 btn-industrial text-base"
                    disabled={!pendingFaceUserId || facePasswordLoading}
                  >
                    {facePasswordLoading ? 'Signing In...' : pendingFaceUserId ? 'Sign In' : 'Waiting for face recognition…'} {!facePasswordLoading && pendingFaceUserId && <ArrowRight className="ml-2 h-5 w-5" />}
                  </Button>
                  {pendingFaceUserId && (
                    <div className="text-center">
                      <button type="button" onClick={cancelFacePassword} className="text-sm text-slate-500 hover:text-primary underline">
                        Not you? Scan again
                      </button>
                    </div>
                  )}
                </form>

                <div className="text-center">
                  <button
                    onClick={() => setLoginMode('id')}
                    className="text-sm text-slate-500 hover:text-primary underline"
                    data-testid="button-use-id"
                  >
                    Use Employee ID or National ID instead
                  </button>
                </div>
              </>
            ) : showForgotPassword ? (
              /* Forgot password form */
              <div className="space-y-4">
                <div className="text-center space-y-1">
                  <div className="flex items-center justify-center gap-2">
                    <Lock className="h-6 w-6 text-primary" />
                    <h3 className="text-lg font-semibold text-gray-900">Reset Password</h3>
                  </div>
                  <p className="text-sm text-slate-500">Enter your email address and we'll send you a reset link.</p>
                </div>
                {forgotMessage ? (
                  <div className="space-y-4">
                    <p className="text-sm text-center text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">{forgotMessage}</p>
                    <Button type="button" variant="outline" className="w-full" onClick={() => { setShowForgotPassword(false); setForgotMessage(''); setForgotEmail(''); }}>
                      Back to Login
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="relative">
                      <Mail className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                      <Input
                        type="email"
                        placeholder="Enter your email address"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        className="pl-10 h-12 text-base bg-white text-gray-900 border-slate-200"
                        autoFocus
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full h-12 btn-industrial text-base" disabled={forgotLoading}>
                      {forgotLoading ? 'Sending...' : 'Send Reset Link'} {!forgotLoading && <ArrowRight className="ml-2 h-5 w-5" />}
                    </Button>
                    <div className="text-center">
                      <button type="button" onClick={() => setShowForgotPassword(false)} className="text-sm text-slate-500 hover:text-primary underline">
                        Back to Login
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              /* loginMode === 'id' */
              <form onSubmit={handleIdSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 uppercase tracking-wider">Employee ID, National ID, or Email</label>
                  <div className="relative">
                    <User className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                    <Input
                      type="text"
                      placeholder="Employee ID, National ID, or Email"
                      value={id}
                      onChange={(e) => setId(e.target.value)}
                      className="pl-10 h-12 text-lg bg-white text-gray-900 border-slate-200 focus:ring-primary focus:border-primary"
                      data-testid="input-worker-id"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Use your employee ID, national ID, or email address</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700 uppercase tracking-wider">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                    <Input
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 h-12 text-lg bg-white text-gray-900 border-slate-200 focus:ring-primary focus:border-primary"
                      data-testid="input-worker-password"
                    />
                  </div>
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-xs text-slate-500 hover:text-primary underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                </div>

                {error && <p className="text-red-500 text-sm font-medium text-center animate-pulse" data-testid="text-error">{error}</p>}

                <Button type="submit" className="w-full h-12 btn-industrial text-lg mt-2" disabled={loading} data-testid="button-login">
                  {loading ? 'Signing In...' : 'Sign In'} {!loading && <ArrowRight className="ml-2 h-5 w-5" />}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      resetFaceFlow();
                      setLoginMode('face');
                    }}
                    className="text-sm text-slate-500 hover:text-primary underline"
                    data-testid="button-use-face"
                  >
                    Use Face Recognition instead
                  </button>
                </div>
              </form>
            )}
          </div>
        </CardContent>
        <div className="bg-slate-50 p-4 rounded-b-xl text-center border-t border-slate-100 space-y-2">
          <div className="text-xs text-slate-400">System v2.4.1 • Secure Connection</div>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => { setLoginMode('manager-approval'); resetApprovalFlow(); }}
              className="text-xs text-slate-500 hover:text-primary transition-colors"
              data-testid="button-manager-approval"
            >
              Manager Approval Login
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
