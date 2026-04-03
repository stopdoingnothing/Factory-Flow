import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { settingsApi } from "@/lib/api";
import NotFound from "@/pages/not-found";
import ModeSelect from "@/pages/ModeSelect";
import Login from "@/pages/Login";
import AttendanceKiosk from "@/pages/AttendanceKiosk";
import AttendanceTileMode from "@/pages/AttendanceTileMode";
import AdminDashboard from "@/pages/AdminDashboard";
import MaintainerDashboard from "@/pages/MaintainerDashboard";
import ResetPassword from "@/pages/ResetPassword";
import OrgChart from "@/pages/OrgChart";
import AttendanceReports from "@/pages/AttendanceReports";

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function BrandingProvider({ children }: { children: React.ReactNode }) {
  const { data: primaryColorSetting } = useQuery({
    queryKey: ['settings', 'primary_color'],
    queryFn: () => settingsApi.get('primary_color'),
  });
  
  const { data: accentColorSetting } = useQuery({
    queryKey: ['settings', 'accent_color'],
    queryFn: () => settingsApi.get('accent_color'),
  });
  
  useEffect(() => {
    const root = document.documentElement;
    if (primaryColorSetting?.value) {
      root.style.setProperty('--primary', hexToHsl(primaryColorSetting.value));
    }
    if (accentColorSetting?.value) {
      root.style.setProperty('--accent', hexToHsl(accentColorSetting.value));
    }
  }, [primaryColorSetting, accentColorSetting]);
  
  return <>{children}</>;
}

// Guards a route by role. Unauthenticated → /login.
// Authenticated but missing the role → best landing page for their actual roles.
function RoleRoute({ roles, component: Component }: { roles: string[]; component: React.ComponentType }) {
  const { user, loading, hasRole } = useAuth();
  const [, setLocation] = useLocation();
  const canAccess = roles.some(r => hasRole(r));
  useEffect(() => {
    if (loading) return;
    if (!user) { setLocation('/login'); return; }
    if (!canAccess) {
      setLocation('/dashboard');
    }
  }, [loading, user, canAccess, setLocation]);
  if (loading || !canAccess) return null;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/" component={ModeSelect} />
      <Route path="/login" component={Login} />
      <Route path="/attendance-kiosk" component={AttendanceKiosk} />
      <Route path="/attendance-tiles" component={AttendanceTileMode} />
      <Route path="/attendance-tile" component={AttendanceTileMode} />
      <Route path="/reset-password" component={ResetPassword} />
      {/* Main app — single dashboard for all authenticated users */}
      <Route path="/dashboard">{() => <RoleRoute roles={['employee','manager','hr','md','admin']} component={AdminDashboard} />}</Route>
      <Route path="/org-chart">{() => <RoleRoute roles={['manager','hr','admin']} component={OrgChart} />}</Route>
      <Route path="/reports">{() => <RoleRoute roles={['manager','hr','admin']} component={AttendanceReports} />}</Route>
      <Route path="/maintainer/dashboard">{() => <RoleRoute roles={['admin']} component={MaintainerDashboard} />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrandingProvider>
        <ThemeProvider>
          <AuthProvider>
            <TooltipProvider>
              <Toaster />
              <Router />
            </TooltipProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrandingProvider>
    </QueryClientProvider>
  );
}

export default App;
