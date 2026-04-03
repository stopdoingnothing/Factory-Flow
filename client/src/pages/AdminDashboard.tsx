import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Settings, Camera, Building2, Loader2, CheckCircle2, Calendar, Clock, FileText, LayoutDashboard, LogOut, Network, MessageSquareWarning, CalendarDays, TrendingUp, Briefcase, Database } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NotificationBell } from '@/components/NotificationBell';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/lib/auth-context';
import WebcamCapture from '@/components/WebcamCapture';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { loadFaceModels, extractFaceDescriptorFromBase64, descriptorToJson } from '@/lib/face-recognition';
import { userApi, leaveRequestApi, grievanceApi } from '@/lib/api';
import type { LeaveRequest, Grievance } from '@shared/schema';

import DashboardSection from './admin/DashboardSection';
import PersonnelSection from './admin/PersonnelSection';
import LeaveRequestsSection from './admin/LeaveRequestsSection';
import { AttendanceSection } from './admin/AttendanceSection';
import LeaveRulesSection from './admin/LeaveRulesSection';
import { GrievancesSection } from './admin/GrievancesSection';
import LeaveCalendarSection from './admin/LeaveCalendarSection';
import OrgPositionsSection from './admin/OrgPositionsSection';
import CompaniesSection from './admin/CompaniesSection';
import SettingsSection from './admin/SettingsSection';
import DatabaseBackupSection from './admin/DatabaseBackupSection';
import { LeaveRequest as LeaveRequestForm } from './LeaveRequest';

type ActiveSection = 'dashboard' | 'employees' | 'leave-requests' | 'attendance' | 'departments' | 'employee-types' | 'leave-rules' | 'grievances' | 'holidays' | 'leave-calendar' | 'positions' | 'companies' | 'settings' | 'backup' | 'apply-leave' | 'employee-grievances';

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, setUser, logout } = useAuth();
  const queryClient = useQueryClient();

  const [activeSection, setActiveSection] = useState<ActiveSection>('dashboard');

  const { data: leaveRequests = [] } = useQuery({
    queryKey: ['leave-requests'],
    queryFn: () => leaveRequestApi.getAll(),
  });

  const { data: grievances = [] } = useQuery({
    queryKey: ['grievances'],
    queryFn: () => grievanceApi.getAll(),
  });

  const pendingCounts = {
    total: leaveRequests.filter((r: LeaveRequest) => ['pending_manager', 'pending_hr', 'pending_md', 'pending'].includes(r.status)).length,
  };

  const openGrievanceCount = grievances.filter((g: Grievance) => g.status === 'submitted' || g.status === 'in_review').length;

  const [showPhotoSetup, setShowPhotoSetup] = useState(false);
  const [adminPhotoCapturing, setAdminPhotoCapturing] = useState(false);
  const [adminExtractingFace, setAdminExtractingFace] = useState(false);
  const [adminPhotoUrl, setAdminPhotoUrl] = useState<string | null>(null);
  const [adminFaceDescriptor, setAdminFaceDescriptor] = useState<string | null>(null);

  useEffect(() => {
    const skipped = localStorage.getItem(`photoSetupSkipped_${user?.id}`);
    if (user && user.role === 'manager' && !user.faceDescriptor && !user.photoUrl && !skipped) {
      setShowPhotoSetup(true);
    }
  }, [user]);

  const handleAdminPhotoCapture = async (photoData: string) => {
    setAdminPhotoUrl(photoData);
    setAdminExtractingFace(true);

    try {
      await loadFaceModels();
      const descriptor = await extractFaceDescriptorFromBase64(photoData);

      if (descriptor) {
        const descriptorJson = descriptorToJson(descriptor);
        setAdminFaceDescriptor(descriptorJson);
        toast({ title: "Face Detected", description: "Your face has been captured successfully." });
      } else {
        toast({ variant: "destructive", title: "No Face Detected", description: "Please try again with better lighting." });
        setAdminPhotoUrl(null);
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to process face. Please try again." });
      setAdminPhotoUrl(null);
    } finally {
      setAdminExtractingFace(false);
      setAdminPhotoCapturing(false);
    }
  };

  const handleSaveAdminPhoto = async () => {
    if (!user || !adminPhotoUrl) return;

    try {
      const updatedUser = await userApi.update(user.id, {
        photoUrl: adminPhotoUrl,
        faceDescriptor: adminFaceDescriptor,
      });

      setUser(updatedUser);
      setShowPhotoSetup(false);
      setAdminPhotoUrl(null);
      setAdminFaceDescriptor(null);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: "Photo Saved", description: "Your profile photo has been updated." });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to save photo." });
    }
  };

  return (
    <Layout>
      <AlertDialog open={showPhotoSetup}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Set Up Your Profile Photo
            </AlertDialogTitle>
            <AlertDialogDescription>
              Welcome! To enable facial recognition for quick login, please capture your photo now.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 mt-4">
            {adminPhotoCapturing ? (
              <div className="space-y-4">
                <WebcamCapture onCapture={handleAdminPhotoCapture} />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setAdminPhotoCapturing(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : adminPhotoUrl ? (
              <div className="space-y-4">
                <div className="relative">
                  <img
                    src={adminPhotoUrl}
                    alt="Captured photo"
                    className="w-full h-48 object-cover rounded-lg"
                  />
                  {adminExtractingFace && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                      <div className="text-white flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Detecting face...
                      </div>
                    </div>
                  )}
                  {adminFaceDescriptor && (
                    <div className="absolute bottom-2 right-2 bg-green-500 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Face detected
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setAdminPhotoUrl(null);
                      setAdminFaceDescriptor(null);
                      setAdminPhotoCapturing(true);
                    }}
                  >
                    Retake
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleSaveAdminPhoto}
                    disabled={!adminFaceDescriptor}
                  >
                    Save Photo
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-100 rounded-lg p-8 text-center">
                  <Camera className="h-16 w-16 mx-auto text-slate-400 mb-4" />
                  <p className="text-slate-600">No photo captured yet</p>
                </div>
                <Button
                  className="w-full"
                  onClick={() => setAdminPhotoCapturing(true)}
                  data-testid="button-capture-admin-photo"
                >
                  <Camera className="mr-2 h-4 w-4" />
                  Capture Photo
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-slate-500"
                  onClick={() => { localStorage.setItem(`photoSetupSkipped_${user?.id}`, '1'); setShowPhotoSetup(false); }}
                >
                  Skip for now
                </Button>
              </div>
            )}
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex gap-6">
        <div className="w-64 shrink-0">
          <div className="sticky top-4 space-y-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-heading font-bold text-gray-900 dark:text-gray-100">AECE Checkpoint</h2>
              <div className="flex items-center gap-2">
                {user && <NotificationBell userId={user.id} />}
                <ThemeToggle />
              </div>
            </div>
            <nav className="space-y-1">
              <button
                onClick={() => setActiveSection('dashboard')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  activeSection === 'dashboard' ? 'bg-primary text-white' : 'hover:bg-slate-100 text-slate-700'
                }`}
                data-testid="nav-dashboard"
              >
                <LayoutDashboard className="h-4 w-4" /> Dashboard
              </button>
              <button
                onClick={() => setActiveSection('employees')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  activeSection === 'employees' ? 'bg-primary text-white' : 'hover:bg-slate-100 text-slate-700'
                }`}
                data-testid="nav-employees"
              >
                <Users className="h-4 w-4" /> Personnel
              </button>
              <button
                onClick={() => setLocation('/admin/org-chart')}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors hover:bg-slate-100 text-slate-700"
                data-testid="nav-org-chart"
              >
                <Network className="h-4 w-4" /> Organization Chart
              </button>
              <button
                onClick={() => setActiveSection('positions')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  activeSection === 'positions' ? 'bg-primary text-white' : 'hover:bg-slate-100 text-slate-700'
                }`}
                data-testid="nav-positions"
              >
                <Network className="h-4 w-4" /> Organisation Setup
              </button>
              <button
                onClick={() => setActiveSection('leave-requests')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  activeSection === 'leave-requests' ? 'bg-primary text-white' : 'hover:bg-slate-100 text-slate-700'
                }`}
                data-testid="nav-leave-requests"
              >
                <FileText className="h-4 w-4" /> Leave Requests
                {pendingCounts.total > 0 && (
                  <Badge className="ml-auto bg-blue-500 text-white text-xs">
                    {pendingCounts.total}
                  </Badge>
                )}
              </button>
              <button
                onClick={() => setActiveSection('attendance')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  activeSection === 'attendance' ? 'bg-primary text-white' : 'hover:bg-slate-100 text-slate-700'
                }`}
                data-testid="nav-attendance"
              >
                <Clock className="h-4 w-4" /> Attendance
              </button>
              <button
                onClick={() => setLocation('/admin/reports')}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors hover:bg-slate-100 text-slate-700"
                data-testid="nav-reports"
              >
                <TrendingUp className="h-4 w-4" /> Attendance Reports
              </button>
              <button
                onClick={() => setActiveSection('companies')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  activeSection === 'companies' ? 'bg-primary text-white' : 'hover:bg-slate-100 text-slate-700'
                }`}
                data-testid="nav-companies"
              >
                <Building2 className="h-4 w-4" /> Companies
              </button>
              <button
                onClick={() => setActiveSection('leave-rules')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  activeSection === 'leave-rules' ? 'bg-primary text-white' : 'hover:bg-slate-100 text-slate-700'
                }`}
                data-testid="nav-leave-rules"
              >
                <Calendar className="h-4 w-4" /> Leave Rules
              </button>
              <button
                onClick={() => setActiveSection('leave-calendar')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  activeSection === 'leave-calendar' ? 'bg-primary text-white' : 'hover:bg-slate-100 text-slate-700'
                }`}
                data-testid="nav-leave-calendar-inline"
              >
                <CalendarDays className="h-4 w-4" /> Leave Calendar
              </button>
              <button
                onClick={() => setActiveSection('settings')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  activeSection === 'settings' ? 'bg-primary text-white' : 'hover:bg-slate-100 text-slate-700'
                }`}
                data-testid="nav-settings"
              >
                <Settings className="h-4 w-4" /> Settings
              </button>
              <button
                onClick={() => setActiveSection('backup')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  activeSection === 'backup' ? 'bg-primary text-white' : 'hover:bg-slate-100 text-slate-700'
                }`}
                data-testid="nav-backup"
              >
                <Database className="h-4 w-4" /> Database Backup
              </button>

              <div className="pt-3 mt-3 border-t">
                <p className="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Briefcase className="h-3 w-3" /> Employee Tools
                </p>
                <button
                  onClick={() => setActiveSection('apply-leave')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                    activeSection === 'apply-leave' ? 'bg-primary text-white' : 'hover:bg-slate-100 text-slate-700'
                  }`}
                  data-testid="nav-apply-leave"
                >
                  <Calendar className="h-4 w-4" /> Apply for Leave
                </button>
                <button
                  onClick={() => setActiveSection('employee-grievances')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                    activeSection === 'employee-grievances' ? 'bg-primary text-white' : 'hover:bg-slate-100 text-slate-700'
                  }`}
                  data-testid="nav-grievances"
                >
                  <MessageSquareWarning className="h-4 w-4" /> Grievances
                  {openGrievanceCount > 0 && (
                    <Badge className="ml-auto bg-red-500 text-white text-xs">
                      {openGrievanceCount}
                    </Badge>
                  )}
                </button>
              </div>

              <div className="pt-2 mt-1 border-t">
                <button
                  onClick={() => {
                    logout();
                    setLocation('/');
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors hover:bg-red-50 text-red-600"
                  data-testid="nav-logout"
                >
                  <LogOut className="h-4 w-4" /> Logout
                </button>
              </div>
            </nav>
          </div>
        </div>

        <div className="flex-1 space-y-6">
          {activeSection === 'dashboard' && (
            <DashboardSection setActiveSection={setActiveSection} />
          )}
          {activeSection === 'employees' && (
            <PersonnelSection />
          )}
          {activeSection === 'leave-requests' && (
            <LeaveRequestsSection />
          )}
          {activeSection === 'attendance' && (
            <AttendanceSection />
          )}
          {activeSection === 'departments' && (
            <DepartmentsSection />
          )}
          {activeSection === 'employee-types' && (
            <EmployeeTypesSection />
          )}
          {activeSection === 'leave-rules' && (
            <LeaveRulesSection />
          )}
          {activeSection === 'grievances' && (
            <GrievancesSection />
          )}
          {activeSection === 'leave-calendar' && (
            <LeaveCalendarSection />
          )}
          {activeSection === 'positions' && (
            <OrgPositionsSection />
          )}
          {activeSection === 'companies' && (
            <CompaniesSection />
          )}
          {activeSection === 'settings' && (
            <SettingsSection />
          )}
          {activeSection === 'backup' && (
            <DatabaseBackupSection />
          )}
          {activeSection === 'apply-leave' && (
            <LeaveRequestForm />
          )}
          {activeSection === 'employee-grievances' && (
            <GrievancesSection />
          )}
        </div>
      </div>
    </Layout>
  );
}
