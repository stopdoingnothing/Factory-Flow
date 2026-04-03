import { useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, FileText, LogIn, LogOut, Settings, Camera, Grid3X3 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { settingsApi } from '@/lib/api';
import aeceLogo from '@assets/AECE_Logo_1765516911038.png';

type AttendanceSubMode = 'clock-in' | 'clock-out';
type SelectionStep = 'mode' | 'attendance-type' | 'attendance-method';

export default function ModeSelect() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<SelectionStep>('mode');
  const [selectedSubMode, setSelectedSubMode] = useState<AttendanceSubMode>('clock-in');
  
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

        <div className="text-center mt-8">
          <button
            onClick={() => setLocation('/login')}
            className="text-slate-500 hover:text-slate-700 text-sm flex items-center gap-2 mx-auto"
            data-testid="button-admin-settings"
          >
            <Settings className="w-4 h-4" />
            Staff Login
          </button>
        </div>
      </div>
    </div>
  );
}
