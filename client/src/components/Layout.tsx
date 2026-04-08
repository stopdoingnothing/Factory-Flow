import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard,
  CalendarPlus,
  Clock,
  LogOut,
  Menu,
  UserCircle,
  MessageSquareWarning,
  MessageSquarePlus,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAuth } from '@/lib/auth-context';
import { useQuery } from '@tanstack/react-query';
import { settingsApi } from '@/lib/api';
import aeceLogo from '@assets/AECE_Logo_1765516911038.png';
import FeedbackModal from '@/components/FeedbackModal';
import { flushPendingFeedback } from '@/lib/feedback';
import { ThemeToggle } from '@/components/ThemeToggle';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [location] = useLocation();
  const { user, logout, hasRole } = useAuth();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    flushPendingFeedback().catch(() => {});
  }, []);
  
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

  const workerNav = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/leave-request', label: 'Request Leave', icon: CalendarPlus },
    { href: '/attendance', label: 'Attendance', icon: Clock },
    { href: '/profile', label: 'My Profile', icon: UserCircle },
    { href: '/grievances', label: 'Grievances', icon: MessageSquareWarning },
  ];

  const hasManagerDashboard = hasRole('manager') || hasRole('hr') || hasRole('md') || hasRole('admin');
  const navItems = workerNav;
  
  const isAdminPage = location.startsWith('/admin');

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-16 bg-sidebar text-sidebar-foreground flex items-center justify-between px-4 shadow-md z-50">
        <div className="flex items-center gap-3">
          <img src={companyLogo} alt={companyName} className="h-8" />
          <span className="font-heading text-xl tracking-wider hidden md:block">
            {(hasRole('manager') || hasRole('admin') || hasRole('hr')) ? `${companyName.toUpperCase()} ADMIN` : companyName.toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {user && (
            <div className="hidden md:flex items-center gap-3 text-sm">
              <div className="text-right">
                <div className="font-medium">{user.firstName} {user.surname}</div>
                <div className="text-xs text-sidebar-foreground/60">{user.id}</div>
              </div>
              <div className="h-10 w-10 rounded-full overflow-hidden border-2 border-primary">
                <img src={user.photoUrl || 'https://github.com/shadcn.png'} alt="User" className="h-full w-full object-cover" />
              </div>
            </div>
          )}

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden text-sidebar-foreground">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] bg-sidebar text-sidebar-foreground border-r-sidebar-border">
              <div className="flex flex-col h-full py-6">
                <div className="flex items-center gap-2 mb-8 px-4">
                  <img src={companyLogo} alt={companyName} className="h-8" />
                  <span className="font-heading text-xl text-primary">{companyName.toUpperCase()}</span>
                </div>
                <nav className="space-y-2 flex-1">
                  {navItems.map((item) => (
                    <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${
                      location === item.href 
                        ? 'bg-primary text-primary-foreground font-medium' 
                        : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    }`}>
                      <item.icon className="h-5 w-5" />
                      {item.label}
                    </Link>
                  ))}
                </nav>
                
                <div className="mt-auto pt-6 border-t border-sidebar-border space-y-4">
                  <div className="flex items-center gap-3 px-4">
                     <div className="h-10 w-10 rounded-full overflow-hidden border border-sidebar-border">
                        <img src={user?.photoUrl || 'https://github.com/shadcn.png'} alt="User" className="h-full w-full object-cover" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{user?.firstName} {user?.surname}</div>
                        <div className="text-xs text-sidebar-foreground/50">ID: {user?.id}</div>
                      </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 px-4"
                    onClick={() => {
                      logout();
                      window.location.href = '/';
                    }}
                  >
                    <LogOut className="mr-2 h-5 w-5" />
                    Sign Out
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
          <ThemeToggle />
          <Button variant="outline" size="icon" onClick={() => setFeedbackOpen(true)} title="Report an issue or request a feature">
            <MessageSquarePlus className="h-4 w-4" />
            <span className="sr-only">Feedback</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {!isAdminPage && (
          <aside className="hidden md:flex w-64 flex-col bg-card border-r border-border shadow-sm z-40">
            <nav className="flex-1 p-4 space-y-2">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-4 py-3 rounded-md transition-all duration-200 ${
                  location === item.href
                    ? 'bg-primary/10 text-primary font-medium border-l-4 border-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}>
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              ))}
              {hasManagerDashboard && (
                <Link href="/admin/dashboard" className={`flex items-center gap-3 px-4 py-3 rounded-md transition-all duration-200 border-t border-border mt-2 pt-4 ${
                  location.startsWith('/admin')
                    ? 'bg-primary/10 text-primary font-medium border-l-4 border-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}>
                  <LogOut className="h-5 w-5 rotate-180" />
                  Management
                </Link>
              )}
            </nav>
            <div className="p-4 border-t border-border">
              <Button 
                variant="outline" 
                className="w-full justify-start text-muted-foreground hover:text-destructive hover:border-destructive"
                onClick={() => {
                  logout();
                  window.location.href = '/';
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </Button>
            </div>
          </aside>
        )}

        <main className={`flex-1 overflow-auto bg-background ${isAdminPage ? 'p-4 md:p-6' : 'p-4 md:p-8'}`}>
          <div className={`${isAdminPage ? 'max-w-full' : 'max-w-5xl mx-auto'} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
            {children}
          </div>
        </main>
      </div>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  );
};

export default Layout;
