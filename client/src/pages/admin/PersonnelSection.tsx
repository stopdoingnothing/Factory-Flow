import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Switch } from "@/components/ui/switch";
import { userApi, departmentApi, userGroupApi, leaveBalanceApi, leaveRuleApi, employeeTypeApi, contractHistoryApi, faceDescriptorApi, orgPositionApi, companyApi } from '@/lib/api';
import type { User, Department, UserGroup, LeaveBalance, EmployeeType, OrgPosition } from '@shared/schema';
import { Plus, Pencil, Trash2, Mail, Camera, Loader2, CheckCircle2, UserCog, Shield, Check, X, Search, UserX, Network, ChevronDown, ChevronRight, ArrowUp, ArrowDown, ChevronsUpDown, FileText, ClipboardList, AlertTriangle } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox";
import jsPDF from 'jspdf';
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/lib/auth-context';
import WebcamCapture from '@/components/WebcamCapture';
import MultiAngleFaceCapture from '@/components/MultiAngleFaceCapture';
import { loadFaceModels, extractFaceDescriptorFromBase64, descriptorToJson } from '@/lib/face-recognition';
import { formatDateForDisplay, getEmploymentDuration, generatePassword, isValidDateFormat, parseDateFromDisplay, formatLeaveDays } from './utils';

export default function PersonnelSection() {
  const { toast } = useToast();
  const { user, hasRole } = useAuth();
  const isAdminUser = hasRole('admin') || hasRole('hr');
  const queryClient = useQueryClient();

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: userApi.getAll,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: departmentApi.getAll,
  });

  const { data: userGroups = [] } = useQuery({
    queryKey: ['userGroups'],
    queryFn: userGroupApi.getAll,
  });

  const { data: employeeTypes = [] } = useQuery({
    queryKey: ['employeeTypes'],
    queryFn: employeeTypeApi.getAll,
  });

  const { data: leaveBalances = [] } = useQuery({
    queryKey: ['leave-balances'],
    queryFn: () => leaveBalanceApi.getAll(),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: activatableTypes = [] } = useQuery<{ leaveType: string; defaultDays: number; source: 'statutory' | 'custom'; description: string }[]>({
    queryKey: ['activatable-leave-types'],
    queryFn: () => leaveRuleApi.getActivatableTypes(),
  });

  const { data: orgPositions = [] } = useQuery<OrgPosition[]>({
    queryKey: ['org-positions'],
    queryFn: () => orgPositionApi.getAll(),
  });

  const { data: companies = [] } = useQuery<any[]>({
    queryKey: ['companies'],
    queryFn: companyApi.getAll,
  });

  // Employee Search State
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeDepartmentFilter, setEmployeeDepartmentFilter] = useState<string>('');
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState<'all' | 'active' | 'terminated'>('active');

  type SortField = 'id' | 'name' | 'department' | 'tenure' | 'leave' | 'role';
  type SortDir = 'asc' | 'desc';
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortField(null); setSortDir('asc'); }
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronsUpDown className="inline h-3 w-3 ml-1 opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="inline h-3 w-3 ml-1" />
      : <ArrowDown className="inline h-3 w-3 ml-1" />;
  };
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());
  const toggleEmployeeExpanded = (id: string) => {
    setExpandedEmployees(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // User Management State
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<Partial<User>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [originalId, setOriginalId] = useState<string>('');
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  const [isMultiAngleCapture, setIsMultiAngleCapture] = useState(false);
  const [extractingFace, setExtractingFace] = useState(false);
  const [faceExtracted, setFaceExtracted] = useState(false);
  const [pendingMultiAnglePhotos, setPendingMultiAnglePhotos] = useState<Array<{ angle: string; image: string; descriptor: string | null }>>([]);

  // Admin User Creation State
  const [isAdminDialogOpen, setIsAdminDialogOpen] = useState(false);
  const [adminData, setAdminData] = useState<{
    firstName: string;
    surname: string;
    email: string;
    password: string;
    userGroupId?: number;
  }>({ firstName: '', surname: '', email: '', password: '' });

  // Employee Balance View State
  const [isBalanceDialogOpen, setIsBalanceDialogOpen] = useState(false);
  const [selectedEmployeeForBalance, setSelectedEmployeeForBalance] = useState<User | null>(null);

  // Contract Management State
  const [isContractDialogOpen, setIsContractDialogOpen] = useState(false);
  const [contractActionUser, setContractActionUser] = useState<User | null>(null);
  const [contractAction, setContractAction] = useState<'extend' | 'convert'>('extend');
  const [contractNewEndDate, setContractNewEndDate] = useState('');
  const [contractNewTypeId, setContractNewTypeId] = useState<number | null>(null);
  const [contractReason, setContractReason] = useState('');

  // Termination State
  const [isTerminationDialogOpen, setIsTerminationDialogOpen] = useState(false);
  const [terminationUser, setTerminationUser] = useState<User | null>(null);
  const [terminationDate, setTerminationDate] = useState('');

  const saveAdditionalFaceDescriptors = async (userId: string) => {
    if (pendingMultiAnglePhotos.length === 0) return;
    
    for (const photo of pendingMultiAnglePhotos) {
      if (photo.descriptor) {
        try {
          await faceDescriptorApi.create({
            userId,
            descriptor: photo.descriptor,
            label: photo.angle,
            photoData: photo.image,
          });
        } catch (err) {
          console.error(`Failed to save ${photo.angle} descriptor:`, err);
        }
      }
    }
    setPendingMultiAnglePhotos([]);
  };

  const createUserMutation = useMutation({
    mutationFn: userApi.create,
    onSuccess: async (createdUser) => {
      if (createdUser?.id && pendingMultiAnglePhotos.length > 0) {
        await saveAdditionalFaceDescriptors(createdUser.id);
      }
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: "User Created", description: "User has been added successfully." });
      setIsUserDialogOpen(false);
      setCurrentUser({});
      setIsEditing(false);
      setIsCapturingPhoto(false);
    },
    onError: (error: any) => {
      console.error('Create user error:', error);
      toast({ variant: "destructive", title: "Error Creating User", description: error.message || "Failed to create user. Please try again." });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => userApi.update(id, data),
    onSuccess: async (_, variables) => {
      if (variables?.id && pendingMultiAnglePhotos.length > 0) {
        await saveAdditionalFaceDescriptors(variables.id);
      }
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: "User Updated", description: "User has been updated successfully." });
      setIsUserDialogOpen(false);
      setCurrentUser({});
      setIsEditing(false);
      setIsCapturingPhoto(false);
    },
    onError: (error: any) => {
      console.error('Update user error:', error);
      toast({ variant: "destructive", title: "Error Updating User", description: error.message || "Failed to update user. Please try again." });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: userApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: "User Deleted", description: "User has been removed from the system." });
    },
  });

  const updateLeaveBalanceMutation = useMutation({
    mutationFn: ({ id, total }: { id: number; total: number }) => leaveBalanceApi.update(id, { total }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
    },
  });

  const createLeaveBalanceMutation = useMutation({
    mutationFn: (data: { userId: string; leaveType: string; total: number }) => leaveBalanceApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
      toast({ title: "Leave Activated", description: "Leave type has been activated for this employee." });
    },
  });

  const handleSaveUser = async () => {
    if (!currentUser.firstName || !currentUser.surname || !currentUser.id) {
      toast({ variant: "destructive", title: "Error", description: "First name, surname, and ID are required" });
      return;
    }

    if (!currentUser.role) {
      toast({ variant: "destructive", title: "Error", description: "Role is required" });
      return;
    }

    const role = currentUser.role;

    if (role === 'worker' && !currentUser.department) {
      toast({ variant: "destructive", title: "Error", description: "Department is required for employees" });
      return;
    }

    if (!currentUser.managerId) {
      toast({ variant: "destructive", title: "Error", description: "A line manager (Reports To) is required" });
      return;
    }

    if (!currentUser.startDate) {
      toast({ variant: "destructive", title: "Error", description: "Start date is required" });
      return;
    }

    if (currentUser.userGroupId && !currentUser.email) {
      toast({ variant: "destructive", title: "Error", description: "Email is required for admin users" });
      return;
    }

    if (currentUser.userGroupId && !isEditing && !currentUser.password) {
      toast({ variant: "destructive", title: "Error", description: "Password is required for new admin users" });
      return;
    }

    if (isAdminUser && ((currentUser as any).roles || []).length === 0) {
      toast({ variant: "destructive", title: "Error", description: "At least one role must be assigned" });
      return;
    }

    const userData = { 
      ...currentUser, 
      role,
      photoUrl: currentUser.photoUrl || 'https://github.com/shadcn.png',
      employeeTypeId: currentUser.employeeTypeId || null,
      nationalId: currentUser.nationalId || null,
      taxNumber: currentUser.taxNumber || null,
      nextOfKin: currentUser.nextOfKin || null,
      emergencyNumber: currentUser.emergencyNumber || null,
      startDate: currentUser.startDate || null,
      userGroupId: currentUser.userGroupId || null,
      managerId: currentUser.managerId || null,
      orgPositionId: currentUser.orgPositionId || null,
      reportsToPositionId: null,
      exclude: currentUser.exclude || false,
      excludeFromLeave: (currentUser as any).excludeFromLeave || false,
      attendanceRequired: currentUser.attendanceRequired !== false,
      nickname: currentUser.nickname || null,
      terminationDate: currentUser.terminationDate || null,
      contractEndDate: currentUser.contractEndDate || null,
      adminRole: null,
      companyId: currentUser.companyId || null,
    };

    if (isEditing) {
      const idChanged = currentUser.id && currentUser.id !== originalId;
      if (idChanged) {
        // Block save if the new ID is already used by another employee
        const isDuplicate = users.some((u: User) => u.id === currentUser.id);
        if (isDuplicate) {
          toast({ variant: "destructive", title: "Duplicate ID", description: `Employee ID "${currentUser.id}" is already in use. Choose a different ID.` });
          return;
        }
        // ID has been changed — rename first, then update other fields
        try {
          await userApi.changeId(originalId, currentUser.id!);
          // After rename, update the other fields using the new ID
          updateUserMutation.mutate({ ...userData, id: currentUser.id });
        } catch (err: any) {
          toast({ variant: "destructive", title: "ID Change Failed", description: err.message || "Could not change the Employee ID." });
        }
      } else {
        updateUserMutation.mutate(userData);
      }
    } else {
      createUserMutation.mutate(userData);
    }
  };

  const handlePhotoCapture = async (imageSrc: string) => {
    setCurrentUser({ ...currentUser, photoUrl: imageSrc });
    setIsCapturingPhoto(false);
    setExtractingFace(true);
    setFaceExtracted(false);
    
    try {
      await loadFaceModels();
      const descriptor = await extractFaceDescriptorFromBase64(imageSrc);
      
      if (descriptor) {
        const faceDescriptor = descriptorToJson(descriptor);
        setCurrentUser(prev => ({ ...prev, photoUrl: imageSrc, faceDescriptor }));
        setFaceExtracted(true);
        toast({ title: "Face Detected", description: "Identity verified for recognition." });
      } else {
        toast({ variant: "destructive", title: "No Face Detected", description: "Please ensure your face is clearly visible." });
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to process face." });
    } finally {
      setExtractingFace(false);
    }
  };

  const handleMultiAngleCaptureComplete = async (
    photos: Array<{ angle: string; image: string; descriptor: string | null }>,
    primaryPhoto: string,
    primaryDescriptor: string
  ) => {
    setCurrentUser(prev => ({ 
      ...prev, 
      photoUrl: primaryPhoto, 
      faceDescriptor: primaryDescriptor 
    }));
    setIsMultiAngleCapture(false);
    setFaceExtracted(true);
    
    const additionalPhotos = photos.filter(p => p.descriptor && p.angle !== 'center');
    setPendingMultiAnglePhotos(additionalPhotos);
    
    const capturedCount = photos.filter(p => p.descriptor).length;
    toast({ 
      title: "Face Registration Complete", 
      description: `Captured ${capturedCount} face angles for improved recognition accuracy.` 
    });
  };

  const handleDeleteUser = (id: string) => {
    if (confirm('Are you sure you want to delete this user?')) {
      deleteUserMutation.mutate(id);
    }
  };

  const handleResendCredentials = async (id: string) => {
    try {
      const result = await userApi.resendCredentials(id);
      toast({ title: "Email Sent", description: result.message });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to send credentials email" });
    }
  };

  const handleOpenEdit = (user: User) => {
    setCurrentUser(user);
    setOriginalId(user.id);
    setIsEditing(true);
    setIsUserDialogOpen(true);
    setFaceExtracted(!!user.faceDescriptor);
    setExtractingFace(false);
    setIsCapturingPhoto(false);
  };

  const handleOpenCreate = () => {
    const aecePrefixRegex = /^AECE(\d+)$/i;
    let maxNum = 0;
    users.forEach(u => {
      const match = u.id.match(aecePrefixRegex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    const nextNum = maxNum + 1;
    const nextId = `AECE${String(nextNum).padStart(4, '0')}`;

    setCurrentUser({ id: nextId, role: 'worker' });
    setIsEditing(false);
    setIsUserDialogOpen(true);
    setFaceExtracted(false);
    setExtractingFace(false);
    setIsCapturingPhoto(false);
  };

  const handleContractAction = async () => {
    if (!contractActionUser || !user) return;
    
    try {
      const previousType = employeeTypes.find(t => t.id === contractActionUser.employeeTypeId);
      const newType = contractNewTypeId ? employeeTypes.find(t => t.id === contractNewTypeId) : null;
      
      if (contractAction === 'extend') {
        if (!contractNewEndDate) {
          toast({ variant: "destructive", title: "Error", description: "New end date is required for contract extension" });
          return;
        }
        
        await userApi.update(contractActionUser.id, { contractEndDate: contractNewEndDate });
        
        await contractHistoryApi.create(contractActionUser.id, {
          action: 'extended',
          previousEmployeeTypeId: contractActionUser.employeeTypeId,
          newEmployeeTypeId: contractActionUser.employeeTypeId,
          previousEndDate: contractActionUser.contractEndDate,
          newEndDate: contractNewEndDate,
          reason: contractReason || 'Contract extended',
          performedBy: user.id,
        });
        
        toast({ title: "Success", description: "Contract extended successfully" });
      } else {
        if (!contractNewTypeId) {
          toast({ variant: "destructive", title: "Error", description: "Please select a new employee type" });
          return;
        }
        
        const isNewTypePermanent = newType?.isPermanent === 'yes';
        const updateData: Partial<User> = { 
          employeeTypeId: contractNewTypeId,
          contractEndDate: isNewTypePermanent ? null : (contractNewEndDate || null),
        };
        
        await userApi.update(contractActionUser.id, updateData);
        
        await contractHistoryApi.create(contractActionUser.id, {
          action: 'converted',
          previousEmployeeTypeId: contractActionUser.employeeTypeId,
          newEmployeeTypeId: contractNewTypeId,
          previousEndDate: contractActionUser.contractEndDate,
          newEndDate: isNewTypePermanent ? null : contractNewEndDate,
          reason: contractReason || `Converted to ${newType?.name}`,
          performedBy: user.id,
        });
        
        toast({ title: "Success", description: `Personnel converted to ${newType?.name}` });
      }
      
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsContractDialogOpen(false);
      setContractActionUser(null);
    } catch (error) {
      console.error('Contract action error:', error);
      toast({ variant: "destructive", title: "Error", description: "Failed to update contract" });
    }
  };

  const handleSaveAdmin = () => {
    if (!adminData.firstName || !adminData.surname || !adminData.email || !adminData.password) {
      toast({ variant: "destructive", title: "Error", description: "First name, surname, email and password are required" });
      return;
    }

    createUserMutation.mutate({
      id: `ADM${Date.now()}`,
      firstName: adminData.firstName,
      surname: adminData.surname,
      email: adminData.email,
      password: adminData.password,
      role: 'manager',
      roles: ['employee', 'manager', 'admin'],
      userGroupId: adminData.userGroupId,
    }, {
      onSuccess: () => {
        setIsAdminDialogOpen(false);
        setAdminData({ firstName: '', surname: '', email: '', password: '' });
        toast({ title: "Admin Created", description: `Admin user created. Login credentials have been sent to ${adminData.email}` });
      }
    });
  };

  const handleOpenCreateAdmin = () => {
    setAdminData({
      firstName: '',
      surname: '',
      email: '',
      password: generatePassword(),
      userGroupId: undefined,
    });
    setIsAdminDialogOpen(true);
  };

  const filteredUsers = users
    .filter(u => {
      // Non-admin managers see only their direct reports (position-based takes precedence)
      if (!isAdminUser) {
        if ((u as any).reportsToPositionId != null) {
          return (user as any)?.orgPositionId != null && (u as any).reportsToPositionId === (user as any).orgPositionId;
        }
        return u.managerId === user?.id;
      }
      return true;
    })
    .filter(u => {
      if (employeeStatusFilter === 'active') return !u.terminationDate && !(u as any).excludeFromLeave;
      if (employeeStatusFilter === 'terminated') return !!u.terminationDate;
      return true;
    })
    .filter(u => {
      if (!employeeDepartmentFilter) return true;
      return u.department?.toString() === employeeDepartmentFilter;
    })
    .filter(u => {
      if (!employeeSearch) return true;
      const search = employeeSearch.toLowerCase();
      return (
        u.firstName.toLowerCase().includes(search) ||
        u.surname.toLowerCase().includes(search) ||
        u.id.toLowerCase().includes(search) ||
        (u.email && u.email.toLowerCase().includes(search)) ||
        (u.mobile && u.mobile.toLowerCase().includes(search))
      );
    })
    .sort((a, b) => {
      if (!sortField) return 0;
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortField) {
        case 'id':
          return dir * a.id.localeCompare(b.id);
        case 'name':
          return dir * `${a.surname} ${a.firstName}`.localeCompare(`${b.surname} ${b.firstName}`);
        case 'department':
          return dir * (a.department || '').localeCompare(b.department || '');
        case 'tenure': {
          const aDate = a.startDate ? new Date(a.startDate).getTime() : 0;
          const bDate = b.startDate ? new Date(b.startDate).getTime() : 0;
          return dir * (aDate - bDate);
        }
        case 'leave': {
          const aBalance = leaveBalances.filter((lb: LeaveBalance) => lb.userId === a.id).reduce((s: number, lb: LeaveBalance) => s + ((lb.total ?? 0) - (lb.taken ?? 0) - (lb.pending ?? 0)), 0);
          const bBalance = leaveBalances.filter((lb: LeaveBalance) => lb.userId === b.id).reduce((s: number, lb: LeaveBalance) => s + ((lb.total ?? 0) - (lb.taken ?? 0) - (lb.pending ?? 0)), 0);
          return dir * (aBalance - bBalance);
        }
        case 'role':
          return dir * (a.role || '').localeCompare(b.role || '');
        default:
          return 0;
      }
    });

  const handleExportPdf = () => {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    // Landscape A4: 297 x 210mm
    const pageWidth = pdf.internal.pageSize.getWidth();   // 297
    const pageHeight = pdf.internal.pageSize.getHeight(); // 210
    const margin = 12;
    const usableWidth = pageWidth - margin * 2;           // 273
    const now = new Date();
    const generatedStr = now.toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });

    const filterParts: string[] = [];
    if (employeeStatusFilter !== 'all') filterParts.push(`Status: ${employeeStatusFilter}`);
    if (employeeDepartmentFilter) filterParts.push(`Department: ${employeeDepartmentFilter}`);
    if (employeeSearch) filterParts.push(`Search: "${employeeSearch}"`);
    const filterStr = filterParts.length > 0 ? filterParts.join(' | ') : 'All employees';

    // ── Title banner ──────────────────────────────────────────────────────────
    pdf.setFillColor(30, 41, 59);
    pdf.rect(0, 0, pageWidth, 22, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(15);
    pdf.setFont('helvetica', 'bold');
    pdf.text('AECE Checkpoint  —  Employee List', margin, 10);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Generated: ${generatedStr}   |   Filter: ${filterStr}   |   Total: ${filteredUsers.length} employee(s)`, margin, 17);
    pdf.setTextColor(0, 0, 0);

    // ── Column x-positions (landscape 273mm usable) ───────────────────────────
    // Row 1: EMP ID | Name | Department | Role | Start Date | Tenure | Leave
    const col = {
      id:     margin,           // ~18mm wide
      name:   margin + 20,      // ~52mm wide
      dept:   margin + 72,      // ~45mm wide
      role:   margin + 117,     // ~22mm wide
      start:  margin + 139,     // ~28mm wide
      tenure: margin + 167,     // ~30mm wide
      leave:  margin + 197,     // ~25mm wide  → ends ~222 (fits in 285)
    };
    // Row 2: National ID | Tax No | Mobile | Emergency Contact | Contact No
    const col2 = {
      natId:  margin + 4,       // value at +12
      tax:    margin + 62,      // value at +75
      mobile: margin + 120,     // value at +133
      emerg:  margin + 170,     // value at +189
      contNo: margin + 230,     // value at +243
    };

    let y = 30;
    let pageNum = 1;

    const trunc = (str: string, max: number) =>
      str.length > max ? str.substring(0, max - 1) + '...' : str;

    const drawHeader = () => {
      pdf.setFillColor(51, 65, 85);
      pdf.rect(margin, y - 5, usableWidth, 7, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.text('EMP ID',      col.id,     y);
      pdf.text('FULL NAME',   col.name,   y);
      pdf.text('DEPARTMENT',  col.dept,   y);
      pdf.text('ROLE',        col.role,   y);
      pdf.text('START DATE',  col.start,  y);
      pdf.text('TENURE',      col.tenure, y);
      pdf.text('LEAVE',       col.leave,  y);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont('helvetica', 'normal');
      y += 4;
    };

    const addFooter = () => {
      pdf.setFontSize(7);
      pdf.setTextColor(150, 150, 150);
      pdf.text('AECE Checkpoint — Confidential', margin, pageHeight - 5);
      pdf.text(`Page ${pageNum}`, pageWidth - margin - 10, pageHeight - 5);
      pdf.setTextColor(0, 0, 0);
    };

    drawHeader();

    filteredUsers.forEach((emp, idx) => {
      const rowHeight = 16;
      if (y + rowHeight > pageHeight - 10) {
        addFooter();
        pdf.addPage();
        pageNum++;
        y = 18;
        drawHeader();
      }

      // Alternating stripe
      pdf.setFillColor(idx % 2 === 0 ? 248 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 252 : 255);
      pdf.rect(margin, y - 1, usableWidth, rowHeight, 'F');
      pdf.setDrawColor(226, 232, 240);
      pdf.line(margin, y - 1, margin + usableWidth, y - 1);

      const empBalances = leaveBalances.filter((b: LeaveBalance) => b.userId === emp.id);
      const annualBal = empBalances.find((b: LeaveBalance) => b.leaveType === 'Annual Leave');
      const totalAvailable = annualBal
        ? Math.round(((annualBal.total ?? 0) + (annualBal.carryOverDays ?? 0) - (annualBal.taken ?? 0) - (annualBal.pending ?? 0)) * 10) / 10
        : 0;

      // ── Row 1: primary info ────────────────────────────────────────────────
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(30, 41, 59);
      pdf.text(emp.id, col.id, y + 4);

      pdf.setTextColor(0, 0, 0);
      pdf.text(trunc(`${emp.firstName} ${emp.surname}`, 28), col.name, y + 4);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.text(trunc(emp.department || '-', 25), col.dept, y + 4);
      pdf.text(trunc(emp.role === 'worker' ? 'Employee' : (emp.role || '-'), 12), col.role, y + 4);
      pdf.text(emp.startDate ? formatDateForDisplay(emp.startDate) : '-', col.start, y + 4);
      pdf.text(getEmploymentDuration(emp.startDate), col.tenure, y + 4);
      pdf.setTextColor(empBalances.length > 0 && totalAvailable <= 0 ? 185 : 0, 0, 0);
      pdf.text(empBalances.length > 0 ? `${totalAvailable} days` : '-', col.leave, y + 4);
      pdf.setTextColor(0, 0, 0);

      // ── Row 2: secondary info (all on one line) ───────────────────────────
      pdf.setFontSize(7);
      pdf.setTextColor(90, 90, 90);

      pdf.setFont('helvetica', 'bold');
      pdf.text('ID No:', col2.natId, y + 10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(trunc(emp.nationalId || '-', 17), col2.natId + 12, y + 10);

      pdf.setFont('helvetica', 'bold');
      pdf.text('Tax No:', col2.tax, y + 10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(trunc(emp.taxNumber || '-', 14), col2.tax + 13, y + 10);

      pdf.setFont('helvetica', 'bold');
      pdf.text('Mobile:', col2.mobile, y + 10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(trunc(emp.mobile || '-', 13), col2.mobile + 13, y + 10);

      pdf.setFont('helvetica', 'bold');
      pdf.text('Emergency:', col2.emerg, y + 10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(trunc(emp.nextOfKin || '-', 18), col2.emerg + 18, y + 10);

      pdf.setFont('helvetica', 'bold');
      pdf.text('Contact No:', col2.contNo, y + 10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(trunc(emp.emergencyNumber || '-', 12), col2.contNo + 19, y + 10);

      pdf.setTextColor(0, 0, 0);
      y += rowHeight;
    });

    addFooter();

    const date = now.toISOString().split('T')[0];
    pdf.save(`employee-list-${date}.pdf`);
    toast({ title: 'PDF Exported', description: `${filteredUsers.length} employee(s) exported.` });
  };

  const handleExportMissingInfoPdf = () => {
    const FIELDS: { key: keyof typeof users[0]; label: string }[] = [
      { key: 'nationalId',      label: 'National ID Number' },
      { key: 'taxNumber',       label: 'Tax Number' },
      { key: 'mobile',          label: 'Mobile Number' },
      { key: 'email',           label: 'Email Address' },
      { key: 'homeAddress',     label: 'Physical Address' },
      { key: 'nextOfKin',       label: 'Next of Kin (name & relationship)' },
      { key: 'emergencyNumber', label: 'Emergency Contact Number' },
      { key: 'photoUrl',        label: 'Photograph' },
    ];

    const activeEmployees = users.filter((u: any) => !u.terminationDate && !u.excludeFromLeave);
    const employeesWithMissing = activeEmployees
      .map((emp: any) => ({
        emp,
        missing: FIELDS.filter(f => !emp[f.key] || String(emp[f.key]).trim() === ''),
      }))
      .filter(({ missing }) => missing.length > 0)
      .sort((a: any, b: any) =>
        `${a.emp.firstName} ${a.emp.surname}`.localeCompare(`${b.emp.firstName} ${b.emp.surname}`)
      );

    if (employeesWithMissing.length === 0) {
      toast({ title: 'No Missing Information', description: 'All active employees have complete records.' });
      return;
    }

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth  = pdf.internal.pageSize.getWidth();   // 210
    const pageHeight = pdf.internal.pageSize.getHeight();  // 297
    const margin = 14;
    const usableWidth = pageWidth - margin * 2;            // 182
    const now = new Date();
    const generatedStr = now.toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + '  ' + now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
    let pageNum = 1;

    const addFooter = () => {
      pdf.setFontSize(7);
      pdf.setTextColor(160, 160, 160);
      pdf.text('AEC Electronics (Pty) Ltd  —  CONFIDENTIAL', margin, pageHeight - 6);
      pdf.text(`Page ${pageNum}`, pageWidth - margin - 14, pageHeight - 6);
      pdf.setTextColor(0, 0, 0);
    };

    const newPage = () => {
      addFooter();
      pdf.addPage();
      pageNum++;
      return 28;
    };

    // ── Cover / summary page ───────────────────────────────────────────────────
    pdf.setFillColor(30, 41, 59);
    pdf.rect(0, 0, pageWidth, 28, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Missing Information Report', margin, 12);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`AEC Electronics (Pty) Ltd   |   Generated: ${generatedStr}`, margin, 20);
    pdf.setTextColor(0, 0, 0);

    // Summary stats box
    let y = 38;
    pdf.setFillColor(241, 245, 249);
    pdf.roundedRect(margin, y, usableWidth, 22, 2, 2, 'F');
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${employeesWithMissing.length} employee(s) have incomplete records`, margin + 4, y + 8);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    const fieldCounts = FIELDS.map(f => ({
      label: f.label,
      count: employeesWithMissing.filter(({ missing }) => missing.some(m => m.key === f.key)).length,
    })).filter(fc => fc.count > 0);
    const summaryText = fieldCounts.map(fc => `${fc.label}: ${fc.count}`).join('   |   ');
    pdf.text(summaryText, margin + 4, y + 16, { maxWidth: usableWidth - 8 });
    y += 30;

    // Instructions box
    pdf.setDrawColor(202, 138, 4);
    pdf.setFillColor(254, 252, 232);
    pdf.roundedRect(margin, y, usableWidth, 14, 2, 2, 'FD');
    pdf.setFontSize(8);
    pdf.setTextColor(120, 80, 0);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Instructions:', margin + 4, y + 6);
    pdf.setFont('helvetica', 'normal');
    pdf.text(
      'Print this form, complete the missing fields by hand, and return to HR for capture. Only fields with missing data are shown.',
      margin + 26, y + 6, { maxWidth: usableWidth - 30 }
    );
    pdf.setTextColor(0, 0, 0);
    y += 22;

    // Summary table — overview of missing fields per employee
    pdf.setFillColor(51, 65, 85);
    pdf.rect(margin, y, usableWidth, 7, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'bold');
    pdf.text('EMPLOYEE', margin + 2, y + 5);
    pdf.text('EMP ID', margin + 62, y + 5);
    pdf.text('MISSING FIELDS', margin + 86, y + 5);
    pdf.setTextColor(0, 0, 0);
    y += 7;

    employeesWithMissing.forEach(({ emp, missing }, idx) => {
      const rowH = 7;
      if (y + rowH > pageHeight - 14) { y = newPage(); }
      pdf.setFillColor(idx % 2 === 0 ? 248 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 252 : 255);
      pdf.rect(margin, y, usableWidth, rowH, 'F');
      pdf.setDrawColor(226, 232, 240);
      pdf.line(margin, y + rowH, margin + usableWidth, y + rowH);
      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(30, 41, 59);
      pdf.text(`${emp.firstName} ${emp.surname}`, margin + 2, y + 5, { maxWidth: 58 });
      pdf.setTextColor(100, 100, 100);
      pdf.text(emp.id, margin + 62, y + 5);
      pdf.setTextColor(0, 0, 0);
      pdf.text(missing.map((m: any) => m.label).join(', '), margin + 86, y + 5, { maxWidth: usableWidth - 88 });
      y += rowH;
    });

    // ── Employee fill-in blocks (one per employee) ─────────────────────────────
    employeesWithMissing.forEach(({ emp, missing }) => {
      const FIELD_ROW_H = 14;
      const blockH = 10 + missing.length * FIELD_ROW_H + 6;

      if (y + blockH + 10 > pageHeight - 14) { y = newPage(); }

      // Employee header bar
      pdf.setFillColor(30, 41, 59);
      pdf.rect(margin, y, usableWidth, 9, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${emp.firstName} ${emp.surname}`, margin + 4, y + 6.5);
      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`ID: ${emp.id}`, margin + usableWidth - 40, y + 6.5);
      if (emp.department) pdf.text(`Dept: ${emp.department}`, margin + usableWidth - 100, y + 6.5);
      pdf.setTextColor(0, 0, 0);
      y += 10;

      // Outer box for the block
      pdf.setDrawColor(200, 210, 220);
      pdf.rect(margin, y, usableWidth, missing.length * FIELD_ROW_H + 4, 'D');

      missing.forEach((field: any, fi: number) => {
        const fy = y + 4 + fi * FIELD_ROW_H;

        if (fy + FIELD_ROW_H > pageHeight - 14) {
          // shouldn't happen since we pre-checked, but safety guard
          return;
        }

        // Label
        pdf.setFontSize(7.5);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(70, 70, 70);
        pdf.text(`${field.label}:`, margin + 4, fy + 5);

        // Checkbox (4×4mm empty square for ticking when captured)
        const cbSize = 4;
        const cbX = margin + usableWidth - 4 - cbSize;
        const cbY = fy + 2.5;
        pdf.setDrawColor(100, 110, 120);
        pdf.setLineWidth(0.5);
        pdf.rect(cbX, cbY, cbSize, cbSize, 'D');
        pdf.setLineWidth(0.2);
        pdf.setFontSize(5.5);
        pdf.setTextColor(140, 140, 140);
        pdf.text('captured', cbX - 8.5, cbY + 3.3);
        pdf.setTextColor(70, 70, 70);

        // Fill-in line (starts after label column, ends before checkbox)
        const lineX1 = margin + 68;
        const lineX2 = cbX - 3;
        const lineY  = fy + 8;
        pdf.setDrawColor(120, 130, 140);
        pdf.setLineWidth(0.4);
        pdf.line(lineX1, lineY, lineX2, lineY);
        pdf.setLineWidth(0.2);

        // Light separator between fields (not after last)
        if (fi < missing.length - 1) {
          pdf.setDrawColor(230, 235, 240);
          pdf.line(margin + 1, fy + FIELD_ROW_H, margin + usableWidth - 1, fy + FIELD_ROW_H);
        }
      });

      y += missing.length * FIELD_ROW_H + 4 + 8; // block + gap between employees
    });

    addFooter();
    const date = now.toISOString().split('T')[0];
    pdf.save(`missing-information-report-${date}.pdf`);
    toast({ title: 'Report Exported', description: `${employeesWithMissing.length} employee(s) with missing information.` });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-heading font-bold text-gray-900">{isAdminUser ? 'Personnel' : 'My Team'}</h1>
        <p className="text-muted-foreground">{isAdminUser ? 'Manage personnel access, IDs, and leave balances' : 'View your direct reports'}</p>
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{isAdminUser ? 'Personnel' : 'My Team'}</CardTitle>
              <CardDescription>{isAdminUser ? 'Manage personnel access, IDs, and leave balances' : 'Your direct reports'}</CardDescription>
            </div>
            {isAdminUser && (
              <div className="flex gap-2">
                <Button onClick={handleOpenCreateAdmin} variant="outline" className="btn-industrial">
                  <Shield className="mr-2 h-4 w-4" /> Add Admin
                </Button>
                <Button variant="outline" onClick={handleExportPdf} data-testid="button-export-pdf">
                  <FileText className="mr-2 h-4 w-4" /> Export PDF
                </Button>
                <Button variant="outline" onClick={handleExportMissingInfoPdf} data-testid="button-missing-info-report">
                  <ClipboardList className="mr-2 h-4 w-4" /> Missing Information
                </Button>
                <Button onClick={handleOpenCreate} className="btn-industrial bg-primary text-white">
                  <Plus className="mr-2 h-4 w-4" /> Add Person
                </Button>
              </div>
            )}
          </div>
          <div className="flex gap-4 mt-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, ID, email, or mobile..."
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  className="pl-8 max-w-sm"
                  data-testid="employee-search"
                />
              </div>
            </div>
            <SearchableSelect
              value={employeeDepartmentFilter || 'all'}
              onValueChange={(v) => setEmployeeDepartmentFilter(v === 'all' ? '' : v)}
              options={[
                { value: 'all', label: 'All Departments' },
                ...departments.map((d: Department) => ({ value: d.name, label: d.name })),
              ]}
              placeholder="Department"
              className="w-40"
            />
            <Select value={employeeStatusFilter} onValueChange={(v: 'all' | 'active' | 'terminated') => setEmployeeStatusFilter(v)}>
              <SelectTrigger className="w-32" data-testid="employee-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {/* #24: In-app missing-info summary (mirrors what the PDF report shows) */}
          {(() => {
            const FIELDS: { key: string; label: string }[] = [
              { key: 'nationalId',      label: 'National ID' },
              { key: 'taxNumber',       label: 'Tax Number' },
              { key: 'mobile',          label: 'Mobile' },
              { key: 'email',           label: 'Email' },
              { key: 'homeAddress',     label: 'Address' },
              { key: 'nextOfKin',       label: 'Next of Kin' },
              { key: 'emergencyNumber', label: 'Emergency Contact' },
              { key: 'photoUrl',        label: 'Photo' },
            ];
            const activeEmployees = users.filter((u: any) => !u.terminationDate && !u.excludeFromLeave);
            const withMissing = activeEmployees
              .map((emp: any) => ({ emp, missing: FIELDS.filter(f => !emp[f.key] || String(emp[f.key]).trim() === '').map(f => f.label) }))
              .filter(({ missing }) => missing.length > 0)
              .sort((a: any, b: any) => `${a.emp.firstName} ${a.emp.surname}`.localeCompare(`${b.emp.firstName} ${b.emp.surname}`));
            if (withMissing.length === 0) return null;
            return (
              <div className="mb-4 border border-amber-200 rounded-lg bg-amber-50 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                  <span className="text-sm font-semibold text-amber-800">{withMissing.length} employee(s) have incomplete records</span>
                  <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs text-amber-700" onClick={handleExportMissingInfoPdf}>
                    Export PDF
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {withMissing.map(({ emp, missing }: any) => (
                    <div key={emp.id} className="flex items-center gap-1 bg-white border border-amber-200 rounded px-2 py-0.5 text-xs" title={`Missing: ${missing.join(', ')}`}>
                      <span className="font-medium">{emp.firstName} {emp.surname}</span>
                      <span className="text-amber-600">· {missing.length} field{missing.length > 1 ? 's' : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead className="cursor-pointer select-none hover:bg-slate-50" onClick={() => handleSort('id')} data-testid="sort-id">
                  ID Number <SortIcon field="id" />
                </TableHead>
                <TableHead className="cursor-pointer select-none hover:bg-slate-50" onClick={() => handleSort('name')} data-testid="sort-name">
                  Name <SortIcon field="name" />
                </TableHead>
                <TableHead className="cursor-pointer select-none hover:bg-slate-50" onClick={() => handleSort('department')} data-testid="sort-department">
                  Department <SortIcon field="department" />
                </TableHead>
                <TableHead>Company</TableHead>
                <TableHead className="cursor-pointer select-none hover:bg-slate-50" onClick={() => handleSort('tenure')} data-testid="sort-tenure">
                  Tenure <SortIcon field="tenure" />
                </TableHead>
                <TableHead className="cursor-pointer select-none hover:bg-slate-50" onClick={() => handleSort('leave')} data-testid="sort-leave">
                  Leave Balance <SortIcon field="leave" />
                </TableHead>
                <TableHead className="cursor-pointer select-none hover:bg-slate-50" onClick={() => handleSort('role')} data-testid="sort-role">
                  Role <SortIcon field="role" />
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((emp) => {
                const empBalances = leaveBalances.filter((b: LeaveBalance) => b.userId === emp.id);
                const annualBalance = empBalances.find((b: LeaveBalance) => b.leaveType === 'Annual Leave');
                const totalAvailable = annualBalance
                  ? Math.round(((annualBalance.total ?? 0) + (annualBalance.carryOverDays ?? 0) - (annualBalance.taken ?? 0) - (annualBalance.pending ?? 0)) * 10) / 10
                  : 0;
                const isExpanded = expandedEmployees.has(emp.id);
                return (
                  <React.Fragment key={emp.id}>
                    <TableRow className="cursor-pointer hover:bg-slate-50" onClick={() => toggleEmployeeExpanded(emp.id)}>
                      <TableCell className="w-8">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                        )}
                      </TableCell>
                      <TableCell className="font-mono font-medium">{emp.id}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full overflow-hidden bg-slate-100">
                            <img src={emp.photoUrl || 'https://github.com/shadcn.png'} alt={`${emp.firstName} ${emp.surname}`} className="h-full w-full object-cover" />
                          </div>
                          {emp.firstName} {emp.surname}
                        </div>
                      </TableCell>
                      <TableCell>{emp.department || '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {emp.companyId ? (companies.find((c: any) => c.id === emp.companyId)?.name ?? '-') : '-'}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm" title={emp.startDate ? `Started: ${formatDateForDisplay(emp.startDate)}` : 'Start date not set'}>
                          {getEmploymentDuration(emp.startDate)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {annualBalance ? (
                          <Badge variant={totalAvailable > 5 ? 'default' : totalAvailable > 0 ? 'secondary' : 'destructive'}>
                            {totalAvailable} days annual leave
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">Not set</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={emp.role === 'manager' ? 'default' : 'secondary'}>
                          {emp.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {isAdminUser && (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(emp)} title="Edit" data-testid={`button-edit-${emp.id}`}>
                              <Pencil className="h-4 w-4 text-slate-500" />
                            </Button>
                            {!emp.terminationDate ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setTerminationUser(emp);
                                  setTerminationDate(new Date().toISOString().split('T')[0]);
                                  setIsTerminationDialogOpen(true);
                                }}
                                title="Terminate"
                                data-testid={`button-terminate-${emp.id}`}
                              >
                                <UserX className="h-4 w-4 text-amber-600" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  updateUserMutation.mutate({ ...emp, terminationDate: null });
                                  toast({ title: "Personnel Reactivated", description: `${emp.firstName} is now active again.` });
                                }}
                                title="Reactivate"
                                data-testid={`button-reactivate-${emp.id}`}
                              >
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(emp.id)} title="Delete" data-testid={`button-delete-${emp.id}`}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${emp.id}-expanded`} className="bg-slate-50">
                        <TableCell colSpan={8} className="py-4">
                          <div className="pl-8 space-y-4">
                            <div className="flex flex-wrap gap-8 p-3 bg-white rounded-lg border mb-4">
                              <div>
                                <p className="text-xs text-muted-foreground">Start Date</p>
                                <p className="font-medium">{emp.startDate ? formatDateForDisplay(emp.startDate) : 'Not set'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Employment Duration</p>
                                <p className="font-medium">{getEmploymentDuration(emp.startDate)}</p>
                              </div>
                              {emp.employeeTypeId && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Employee Type</p>
                                  <p className="font-medium">{employeeTypes.find(t => t.id === emp.employeeTypeId)?.name || '-'}</p>
                                </div>
                              )}
                              {(emp.managerId || emp.reportsToPositionId) && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Reports To</p>
                                  <p className="font-medium">
                                    {(() => {
                                      if (emp.managerId) {
                                        const manager = users.find(u => u.id === emp.managerId);
                                        return manager ? `${manager.firstName} ${manager.surname}` : '-';
                                      }
                                      // legacy: resolve position to the person holding it
                                      const holder = users.find(u => u.orgPositionId === emp.reportsToPositionId);
                                      return holder ? `${holder.firstName} ${holder.surname}` : '-';
                                    })()}
                                  </p>
                                </div>
                              )}
                              {emp.terminationDate && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Termination Date</p>
                                  <p className="font-medium text-red-600">{formatDateForDisplay(emp.terminationDate)}</p>
                                </div>
                              )}
                              {(() => {
                                const empType = employeeTypes.find(t => t.id === emp.employeeTypeId);
                                if (empType && empType.isPermanent === 'no') {
                                  const isExpired = emp.contractEndDate && new Date(emp.contractEndDate) < new Date();
                                  return (
                                    <>
                                      <div>
                                        <p className="text-xs text-muted-foreground">Contract End Date</p>
                                        <p className={`font-medium ${isExpired ? 'text-red-600' : ''}`}>
                                          {emp.contractEndDate ? formatDateForDisplay(emp.contractEndDate) : 'Not set'}
                                          {isExpired && <span className="ml-2 text-red-600 text-xs">(Expired)</span>}
                                        </p>
                                      </div>
                                      <div className="flex items-end">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setContractActionUser(emp);
                                            setContractAction('extend');
                                            setContractNewEndDate('');
                                            setContractNewTypeId(null);
                                            setContractReason('');
                                            setIsContractDialogOpen(true);
                                          }}
                                          data-testid={`button-manage-contract-${emp.id}`}
                                        >
                                          Extend / Convert
                                        </Button>
                                      </div>
                                    </>
                                  );
                                }
                                return null;
                              })()}
                            </div>

                            <p className="text-sm font-medium text-slate-700">Leave Balance Details</p>
                            <div className="grid grid-cols-4 gap-4">
                              {['Annual Leave', 'Sick Leave', 'Family Responsibility', 'Study Leave'].map(leaveType => {
                                const balance = empBalances.find((b: LeaveBalance) => b.leaveType === leaveType);
                                const available = balance ? (balance.total ?? 0) - (balance.taken ?? 0) - (balance.pending ?? 0) : 0;
                                return (
                                  <div key={leaveType} className="p-3 bg-white rounded-lg border">
                                    <p className="text-xs text-muted-foreground mb-1">{leaveType}</p>
                                    {balance ? (
                                      <>
                                        <div className="flex items-center gap-2 mb-2">
                                          <Badge variant={available > 0 ? 'default' : 'destructive'} className="text-lg">
                                            {formatLeaveDays(available)}
                                          </Badge>
                                          <span className="text-xs text-muted-foreground">available</span>
                                        </div>
                                        <div className="text-xs text-muted-foreground space-y-1">
                                          <div className="flex justify-between">
                                            <span>Total:</span>
                                            <Input
                                              type="number"
                                              value={balance.total}
                                              onChange={(e) => {
                                                const newTotal = parseInt(e.target.value) || 0;
                                                updateLeaveBalanceMutation.mutate({ id: balance.id, total: newTotal });
                                              }}
                                              className="w-16 h-6 text-xs text-right"
                                              min={0}
                                            />
                                          </div>
                                          <div className="flex justify-between"><span>Taken:</span><span>{formatLeaveDays(balance.taken)}</span></div>
                                          <div className="flex justify-between"><span>Pending:</span><span>{formatLeaveDays(balance.pending)}</span></div>
                                          {balance.carryOverDays > 0 && (() => {
                                            const expiry = (balance as any).carryOverExpiry as string | null;
                                            const today = new Date().toISOString().split('T')[0];
                                            const expiringSoon = expiry && expiry > today && new Date(expiry).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000;
                                            return (
                                              <div className="space-y-0.5">
                                                <div className="flex justify-between text-blue-600 font-medium">
                                                  <span>Carried over:</span><span>+{formatLeaveDays(balance.carryOverDays)}</span>
                                                </div>
                                                {expiry && (
                                                  <div className={`text-xs ${expiringSoon ? 'text-orange-600 font-medium' : 'text-muted-foreground'}`}>
                                                    {expiringSoon ? '⚠ Expires: ' : 'Use by: '}{new Date(expiry).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      </>
                                    ) : (
                                      <div className="space-y-2">
                                        <p className="text-xs text-muted-foreground">Not allocated</p>
                                        <Button 
                                          size="sm" 
                                          variant="outline"
                                          className="w-full text-xs"
                                          onClick={() => createLeaveBalanceMutation.mutate({ 
                                            userId: emp.id, 
                                            leaveType, 
                                            total: leaveType === 'Annual Leave' ? 21 : leaveType === 'Sick Leave' ? 30 : 3 
                                          })}
                                        >
                                          <Plus className="h-3 w-3 mr-1" /> Allocate
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
              {filteredUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No personnel found matching your criteria.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {users.filter(u => !u.terminationDate && (u as any).excludeFromLeave).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserX className="h-5 w-5 text-slate-500" />
              Excluded from Leave
            </CardTitle>
            <CardDescription>
              {users.filter(u => !u.terminationDate && (u as any).excludeFromLeave).length} employee{users.filter(u => !u.terminationDate && (u as any).excludeFromLeave).length !== 1 ? 's' : ''} excluded from leave tracking
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Number</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.filter(u => !u.terminationDate && (u as any).excludeFromLeave).map((emp) => (
                  <TableRow key={emp.id} className="bg-slate-50/50">
                    <TableCell className="font-mono font-medium text-muted-foreground">{emp.id}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full overflow-hidden bg-slate-100">
                          <img src={emp.photoUrl || 'https://github.com/shadcn.png'} alt={`${emp.firstName} ${emp.surname}`} className="h-full w-full object-cover" />
                        </div>
                        <span className="text-slate-600">{emp.firstName} {emp.surname}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{emp.department || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {emp.startDate ? formatDateForDisplay(emp.startDate) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(emp)} title="Edit" data-testid={`button-edit-excluded-${emp.id}`}>
                        <Pencil className="h-4 w-4 text-slate-400" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(emp.id)} title="Delete" data-testid={`button-delete-excluded-${emp.id}`}>
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Personnel Overview</CardTitle>
          <CardDescription>High-level summary of personnel status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="grid grid-cols-2 gap-4 col-span-2">
              {['Annual Leave', 'Sick Leave', 'Family Responsibility'].map(leaveType => {
                const typeBalances = leaveBalances.filter((b: LeaveBalance) => b.leaveType === leaveType);
                const totalDays = typeBalances.reduce((sum: number, b: LeaveBalance) => sum + (b.total ?? 0), 0);
                const takenDays = typeBalances.reduce((sum: number, b: LeaveBalance) => sum + (b.taken ?? 0), 0);
                const pendingDays = typeBalances.reduce((sum: number, b: LeaveBalance) => sum + (b.pending ?? 0), 0);
                const available = Math.round(totalDays - takenDays - pendingDays);
                return (
                  <div key={leaveType} className="p-4 bg-slate-50 rounded-lg border">
                    <p className="text-sm text-muted-foreground">{leaveType}</p>
                    <p className="text-2xl font-bold">{formatLeaveDays(available)}</p>
                    <p className="text-xs text-muted-foreground">Available ({formatLeaveDays(Math.round(takenDays))} taken, {formatLeaveDays(Math.round(pendingDays))} pending)</p>
                  </div>
                );
              })}
            </div>
            
            <div>
              <p className="text-sm font-medium mb-2 text-amber-600">Low Leave Balance Alerts</p>
              <div className="space-y-2">
                {users.filter(u => u.role === 'worker').map(emp => {
                  const empBalances = leaveBalances.filter((b: LeaveBalance) => b.userId === emp.id);
                  const lowBalances = empBalances.filter((b: LeaveBalance) => ((b.total ?? 0) - (b.taken ?? 0) - (b.pending ?? 0)) <= 2 && (b.total ?? 0) > 0);
                  if (lowBalances.length === 0) return null;
                  return (
                    <div key={emp.id} className="flex items-center justify-between p-2 bg-amber-50 rounded border border-amber-200">
                      <span className="font-medium text-sm">{emp.firstName} {emp.surname}</span>
                      <div className="flex gap-2">
                        {lowBalances.map((b: LeaveBalance) => (
                          <Badge key={b.id} variant="outline" className="border-amber-400 text-amber-700 text-[10px]">
                            {b.leaveType}: {formatLeaveDays(Math.round((b.total ?? 0) - (b.taken ?? 0) - (b.pending ?? 0)))} left
                          </Badge>
                        ))}
                      </div>
                    </div>
                  );
                }).filter(Boolean)}
                {users.filter(u => u.role === 'worker').every(emp => {
                  const empBalances = leaveBalances.filter((b: LeaveBalance) => b.userId === emp.id);
                  return empBalances.every((b: LeaveBalance) => ((b.total ?? 0) - (b.taken ?? 0) - (b.pending ?? 0)) > 2 || (b.total ?? 0) === 0);
                }) && (
                  <p className="text-sm text-muted-foreground">No personnel with low leave balances.</p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {users.filter(u => u.terminationDate).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserX className="h-5 w-5 text-amber-600" />
              Terminated Personnel
            </CardTitle>
            <CardDescription>
              {users.filter(u => u.terminationDate).length} former employee{users.filter(u => u.terminationDate).length !== 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Number</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Termination Date</TableHead>
                  <TableHead>Employment Period</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.filter(u => u.terminationDate).map((emp) => (
                  <TableRow key={emp.id} className="bg-slate-50/50">
                    <TableCell className="font-mono font-medium text-muted-foreground">{emp.id}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full overflow-hidden bg-slate-100 opacity-60">
                          <img src={emp.photoUrl || 'https://github.com/shadcn.png'} alt={`${emp.firstName} ${emp.surname}`} className="h-full w-full object-cover grayscale" />
                        </div>
                        <span className="text-muted-foreground">{emp.firstName} {emp.surname}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{emp.department}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-amber-400 text-amber-700">
                        {emp.terminationDate ? formatDateForDisplay(emp.terminationDate) : '-'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {emp.startDate && emp.terminationDate ? (
                        (() => {
                          const start = new Date(emp.startDate);
                          const end = new Date(emp.terminationDate);
                          const years = end.getFullYear() - start.getFullYear();
                          const months = end.getMonth() - start.getMonth();
                          const totalMonths = years * 12 + months;
                          if (totalMonths >= 12) {
                            const y = Math.floor(totalMonths / 12);
                            const m = totalMonths % 12;
                            return m > 0 ? `${y}y ${m}m` : `${y} year${y > 1 ? 's' : ''}`;
                          }
                          return `${totalMonths} month${totalMonths !== 1 ? 's' : ''}`;
                        })()
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(emp)} title="View Details" data-testid={`button-edit-terminated-${emp.id}`}>
                        <Pencil className="h-4 w-4 text-slate-400" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(emp.id)} title="Delete Permanently" data-testid={`button-delete-terminated-${emp.id}`}>
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* User Dialog */}
      <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Employee' : 'Add New Employee'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto overflow-x-hidden pr-2">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="firstName" className="text-right">First Name</Label>
              <Input 
                id="firstName" 
                value={currentUser.firstName || ''} 
                onChange={(e) => setCurrentUser({...currentUser, firstName: e.target.value})}
                className="col-span-3"
                data-testid="input-first-name"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="surname" className="text-right">Surname</Label>
              <Input 
                id="surname" 
                value={currentUser.surname || ''} 
                onChange={(e) => setCurrentUser({...currentUser, surname: e.target.value})}
                className="col-span-3"
                data-testid="input-surname"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="nickname" className="text-right">Nickname</Label>
              <Input 
                id="nickname" 
                value={currentUser.nickname || ''} 
                onChange={(e) => setCurrentUser({...currentUser, nickname: e.target.value})}
                className="col-span-3"
                placeholder="Optional"
                data-testid="input-nickname"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="userId" className="text-right">Employee ID</Label>
              <div className="col-span-3 space-y-1">
                {(() => {
                  const idChanged = isEditing && currentUser.id && currentUser.id !== originalId;
                  const isDuplicate = idChanged && users.some((u: User) => u.id === currentUser.id);
                  return (
                    <>
                      <Input 
                        id="userId" 
                        value={currentUser.id || ''} 
                        onChange={(e) => setCurrentUser({...currentUser, id: e.target.value.toUpperCase()})}
                        placeholder="e.g. AECE0001"
                        data-testid="input-user-id"
                        className={isDuplicate ? 'border-red-500 focus-visible:ring-red-500' : ''}
                      />
                      {isDuplicate && (
                        <p className="text-xs text-red-600">✕ Employee ID <strong>{currentUser.id}</strong> is already in use. Choose a different ID.</p>
                      )}
                      {idChanged && !isDuplicate && (
                        <p className="text-xs text-amber-600">⚠ ID will change from <strong>{originalId}</strong> to <strong>{currentUser.id}</strong>. All linked records will be updated.</p>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">Email</Label>
              <Input 
                id="email" 
                type="email"
                value={currentUser.email || ''} 
                onChange={(e) => setCurrentUser({...currentUser, email: e.target.value})}
                className="col-span-3"
                placeholder="Optional"
                data-testid="input-email"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="password" className="text-right">Password</Label>
              <Input 
                id="password" 
                type="password"
                value={currentUser.password || ''} 
                onChange={(e) => setCurrentUser({...currentUser, password: e.target.value})}
                className="col-span-3"
                placeholder={isEditing ? "Leave blank to keep current password" : (currentUser.userGroupId ? "Required for admin login" : "Optional")}
                data-testid="input-password"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="mobile" className="text-right">Mobile</Label>
              <Input 
                id="mobile" 
                value={currentUser.mobile || ''} 
                onChange={(e) => setCurrentUser({...currentUser, mobile: e.target.value})}
                className="col-span-3"
                placeholder="Optional"
                data-testid="input-mobile"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="homeAddress" className="text-right">Home Address</Label>
              <Input 
                id="homeAddress" 
                value={currentUser.homeAddress || ''} 
                onChange={(e) => setCurrentUser({...currentUser, homeAddress: e.target.value})}
                className="col-span-3"
                placeholder="Optional"
                data-testid="input-home-address"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="gender" className="text-right">Gender</Label>
              <div className="col-span-3">
                <Select 
                  value={currentUser.gender || ''} 
                  onValueChange={(value) => setCurrentUser({...currentUser, gender: value})}
                >
                  <SelectTrigger data-testid="select-gender">
                    <SelectValue placeholder="Select gender (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="religion" className="text-right">Religion</Label>
              <div className="col-span-3">
                <Select
                  value={currentUser.religion || ''}
                  onValueChange={(value) => setCurrentUser({...currentUser, religion: value || null})}
                >
                  <SelectTrigger data-testid="select-religion">
                    <SelectValue placeholder="Not specified" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unspecified">Not specified</SelectItem>
                    <SelectItem value="christian">Christian</SelectItem>
                    <SelectItem value="muslim">Muslim</SelectItem>
                    <SelectItem value="jewish">Jewish</SelectItem>
                    <SelectItem value="hindu">Hindu</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Used to determine which religious public holidays apply to this employee.</p>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="dept" className="text-right">Department</Label>
              <div className="col-span-3">
                <SearchableSelect
                  value={currentUser.department || ''}
                  onValueChange={(value) => {
                    const updates: any = { department: value };
                    if (currentUser.orgPositionId) {
                      const currentPos = orgPositions.find(p => p.id === currentUser.orgPositionId);
                      if (currentPos && currentPos.department !== value) {
                        updates.orgPositionId = undefined;
                      }
                    }
                    setCurrentUser({...currentUser, ...updates});
                  }}
                  options={departments.map(dept => ({ value: dept.name, label: dept.name }))}
                  placeholder="Select a department"
                />
                {departments.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">No departments found. Please add them in the Departments section.</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="orgPosition" className="text-right">Position</Label>
              <div className="col-span-3">
                <SearchableSelect
                  value={currentUser.orgPositionId?.toString() || ''}
                  onValueChange={(value) => setCurrentUser({...currentUser, orgPositionId: value ? parseInt(value) : undefined})}
                  options={orgPositions
                    .filter(p => p.department === currentUser.department)
                    .map(pos => ({ value: pos.id.toString(), label: pos.title }))}
                  placeholder={currentUser.department ? "Select a position" : "Select department first"}
                  disabled={!currentUser.department}
                />
              </div>
            </div>
            {isAdminUser && (
              <div className="grid grid-cols-4 items-start gap-4">
                <Label className="text-right pt-2">Roles</Label>
                <div className="col-span-3 space-y-2">
                  {([
                    { value: 'employee', label: 'Employee', description: 'Dashboard, leave, attendance, profile, grievances' },
                    { value: 'manager', label: 'Manager', description: 'My team view, leave recommendation' },
                    { value: 'hr', label: 'HR', description: 'Personnel management, final leave approvals, grievances admin' },
                    { value: 'admin', label: 'Admin', description: 'Settings, backup, companies, leave rules, system config' },
                  ] as const).map(({ value, label, description }) => {
                    const currentRoles: string[] = (currentUser as any).roles || [];
                    const checked = currentRoles.includes(value);
                    return (
                      <div key={value} className="flex items-start gap-3 p-2 rounded-md hover:bg-slate-50">
                        <Checkbox
                          id={`role-${value}`}
                          checked={checked}
                          onCheckedChange={(c) => {
                            const next = c
                              ? [...currentRoles, value]
                              : currentRoles.filter((r: string) => r !== value);
                            setCurrentUser({ ...currentUser, roles: next } as any);
                          }}
                          data-testid={`checkbox-role-${value}`}
                        />
                        <div>
                          <label htmlFor={`role-${value}`} className="text-sm font-medium cursor-pointer">{label}</label>
                          <p className="text-xs text-muted-foreground">{description}</p>
                        </div>
                      </div>
                    );
                  })}
                  {((currentUser as any).roles || []).length === 0 && (
                    <p className="text-xs text-amber-600">At least one role must be assigned.</p>
                  )}
                </div>
              </div>
            )}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="managerId" className="text-right">Reports To</Label>
              <div className="col-span-3">
                <SearchableSelect
                  value={currentUser.managerId || 'none'}
                  onValueChange={(value) => setCurrentUser({...currentUser, managerId: value === 'none' ? undefined : value, reportsToPositionId: undefined})}
                  options={[
                    { value: 'none', label: 'No Manager' },
                    ...users
                      .filter(u => u.id !== currentUser.id)
                      .sort((a, b) => `${a.firstName} ${a.surname}`.localeCompare(`${b.firstName} ${b.surname}`))
                      .map(u => ({ value: u.id, label: `${u.firstName} ${u.surname}${u.department ? ` (${u.department})` : ''}` })),
                  ]}
                  placeholder="Select a line manager"
                  searchPlaceholder="Search employees..."
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="employeeType" className="text-right">Employment Type</Label>
              <div className="col-span-3">
                <SearchableSelect
                  value={currentUser.employeeTypeId?.toString() || ''}
                  onValueChange={(value) => {
                    const typeId = parseInt(value);
                    const type = employeeTypes.find(t => t.id === typeId);
                    setCurrentUser({
                      ...currentUser,
                      employeeTypeId: typeId,
                      contractEndDate: type?.isPermanent === 'yes' ? null : currentUser.contractEndDate
                    });
                  }}
                  options={employeeTypes.map(type => ({ value: type.id.toString(), label: type.name }))}
                  placeholder="Select type"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="company" className="text-right">Company</Label>
              <div className="col-span-3">
                <SearchableSelect
                  value={currentUser.companyId?.toString() || 'none'}
                  onValueChange={(value) => setCurrentUser({ ...currentUser, companyId: value === 'none' ? undefined : parseInt(value) })}
                  options={[
                    { value: 'none', label: '— No company —' },
                    ...companies.map((c: any) => ({ value: c.id.toString(), label: c.name })),
                  ]}
                  placeholder="Select company (optional)"
                />
                <p className="text-xs text-muted-foreground mt-1">Payroll company this employee belongs to.</p>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="startDate" className="text-right">Start Date</Label>
              <Input 
                id="startDate" 
                type="date"
                value={currentUser.startDate ? currentUser.startDate.split('T')[0] : ''}
                onChange={(e) => setCurrentUser({...currentUser, startDate: e.target.value})}
                className="col-span-3"
                data-testid="input-start-date"
              />
            </div>
            {currentUser.employeeTypeId && employeeTypes.find(t => t.id === currentUser.employeeTypeId)?.isPermanent === 'no' && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="contractEndDate" className="text-right">Contract End Date</Label>
                <Input 
                  id="contractEndDate" 
                  type="date"
                  value={currentUser.contractEndDate ? currentUser.contractEndDate.split('T')[0] : ''}
                  onChange={(e) => setCurrentUser({...currentUser, contractEndDate: e.target.value})}
                  className="col-span-3 border-amber-300 bg-amber-50"
                  data-testid="input-contract-end-date"
                />
              </div>
            )}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="nationalId" className="text-right">National ID</Label>
              <Input 
                id="nationalId" 
                value={currentUser.nationalId || ''} 
                onChange={(e) => setCurrentUser({...currentUser, nationalId: e.target.value})}
                className="col-span-3"
                placeholder="Optional"
                data-testid="input-national-id"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="taxNumber" className="text-right">Tax Number</Label>
              <Input 
                id="taxNumber" 
                value={currentUser.taxNumber || ''} 
                onChange={(e) => setCurrentUser({...currentUser, taxNumber: e.target.value})}
                className="col-span-3"
                placeholder="Optional"
                data-testid="input-tax-number"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="nextOfKin" className="text-right">Next of Kin</Label>
              <Input 
                id="nextOfKin" 
                value={currentUser.nextOfKin || ''} 
                onChange={(e) => setCurrentUser({...currentUser, nextOfKin: e.target.value})}
                className="col-span-3"
                placeholder="Name and relationship"
                data-testid="input-next-of-kin"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="emergencyNumber" className="text-right">Emergency Contact</Label>
              <Input 
                id="emergencyNumber" 
                value={currentUser.emergencyNumber || ''} 
                onChange={(e) => setCurrentUser({...currentUser, emergencyNumber: e.target.value})}
                className="col-span-3"
                placeholder="Emergency phone number"
                data-testid="input-emergency-number"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="exclude" className="text-right">Exclude</Label>
              <div className="col-span-3 flex items-center gap-3">
                <Switch
                  id="exclude"
                  checked={currentUser.exclude || false}
                  onCheckedChange={(checked) => setCurrentUser({...currentUser, exclude: checked})}
                  data-testid="switch-exclude"
                />
                <p className="text-xs text-muted-foreground">
                  Exclude from org chart and attendance (for test/dummy users).
                </p>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="excludeFromLeave" className="text-right">Exclude from Leave</Label>
              <div className="col-span-3 flex items-center gap-3">
                <Switch
                  id="excludeFromLeave"
                  checked={(currentUser as any).excludeFromLeave || false}
                  onCheckedChange={(checked) => setCurrentUser({...currentUser, excludeFromLeave: checked} as any)}
                  data-testid="switch-exclude-from-leave"
                />
                <p className="text-xs text-muted-foreground">
                  Disable leave management for this person (external contractors, system accounts).
                </p>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="attendanceRequired" className="text-right">Attendance Required</Label>
              <div className="col-span-3 flex items-center gap-3">
                <Switch
                  id="attendanceRequired"
                  checked={currentUser.attendanceRequired !== false}
                  onCheckedChange={(checked) => setCurrentUser({...currentUser, attendanceRequired: checked})}
                  data-testid="switch-attendance-required"
                />
                <p className="text-xs text-muted-foreground">
                  Whether this employee needs to clock in/out. Disable for contractors, consultants, or off-site employees.
                </p>
              </div>
            </div>
            {isEditing && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="terminationDate" className="text-right">Termination Date</Label>
                <div className="col-span-3">
                  <Input 
                    id="terminationDate" 
                    type="date"
                    value={currentUser.terminationDate ? currentUser.terminationDate.split('T')[0] : ''}
                    onChange={(e) => setCurrentUser({...currentUser, terminationDate: e.target.value})}
                    data-testid="input-termination-date"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Leave blank for active personnel.
                  </p>
                </div>
              </div>
            )}
            <div className="grid grid-cols-4 items-center gap-4 border-t pt-4">
              <Label className="text-right">Profile Photo</Label>
              <div className="col-span-3">
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden bg-slate-50">
                    {currentUser.photoUrl ? (
                      <div className="relative group w-full h-full">
                        <img src={currentUser.photoUrl} alt="Preview" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-white hover:text-white"
                            onClick={() => setCurrentUser({...currentUser, photoUrl: undefined, faceDescriptor: undefined})}
                          >
                            <Trash2 className="h-5 w-5" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Camera className="h-8 w-8 text-slate-300" />
                    )}
                  </div>
                  
                  {isCapturingPhoto ? (
                    <div className="flex-1">
                      <WebcamCapture onCapture={handlePhotoCapture} label="Capture Photo" />
                      <Button variant="ghost" size="sm" className="mt-2" onClick={() => setIsCapturingPhoto(false)}>Cancel</Button>
                    </div>
                  ) : isMultiAngleCapture ? (
                    <div className="flex-1">
                      <MultiAngleFaceCapture 
                        onComplete={handleMultiAngleCaptureComplete}
                        onCancel={() => setIsMultiAngleCapture(false)}
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full flex items-center justify-start gap-2 h-auto py-2"
                        onClick={() => setIsMultiAngleCapture(true)}
                        disabled={extractingFace}
                      >
                        <Shield className="h-4 w-4 text-blue-600" />
                        <div className="text-left">
                          <div className="font-medium">Secure Face Registration</div>
                          <div className="text-xs text-muted-foreground">Captures multiple angles for better recognition</div>
                        </div>
                      </Button>
                      <Button 
                        variant="ghost" 
                        className="w-full text-sm text-muted-foreground"
                        onClick={() => setIsCapturingPhoto(true)}
                      >
                        Quick single photo capture
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveUser}>{isEditing ? 'Save Changes' : 'Create User'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin Dialog */}
      <Dialog open={isAdminDialogOpen} onOpenChange={setIsAdminDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Create Admin User
            </DialogTitle>
            <DialogDescription>
              Create a user with administrative access to the system.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="adminFirstName" className="text-right">First Name</Label>
              <Input 
                id="adminFirstName"
                value={adminData.firstName}
                onChange={(e) => setAdminData({...adminData, firstName: e.target.value})}
                className="col-span-3"
                data-testid="input-admin-first-name"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="adminSurname" className="text-right">Surname</Label>
              <Input 
                id="adminSurname"
                value={adminData.surname}
                onChange={(e) => setAdminData({...adminData, surname: e.target.value})}
                className="col-span-3"
                data-testid="input-admin-surname"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="adminEmail" className="text-right">Email</Label>
              <Input 
                id="adminEmail"
                type="email"
                value={adminData.email}
                onChange={(e) => setAdminData({...adminData, email: e.target.value})}
                className="col-span-3"
                data-testid="input-admin-email"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="adminPassword" className="text-right">Password</Label>
              <div className="col-span-3 flex gap-2">
                <Input 
                  id="adminPassword"
                  value={adminData.password}
                  onChange={(e) => setAdminData({...adminData, password: e.target.value})}
                  className="flex-1 font-mono"
                  data-testid="input-admin-password"
                />
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setAdminData({...adminData, password: generatePassword()})}
                >
                  Generate
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="adminGroup" className="text-right">User Group</Label>
              <div className="col-span-3">
                <Select 
                  value={adminData.userGroupId?.toString() || ''} 
                  onValueChange={(value) => setAdminData({...adminData, userGroupId: value ? parseInt(value) : undefined})}
                >
                  <SelectTrigger data-testid="select-admin-group">
                    <SelectValue placeholder="Select a group (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {userGroups.map((group) => (
                      <SelectItem key={group.id} value={group.id.toString()}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
              <Mail className="inline h-4 w-4 mr-2" />
              Login credentials will be emailed to the admin after creation.
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveAdmin} data-testid="button-save-admin">
              Create Admin User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Balance Dialog */}
      <Dialog open={isBalanceDialogOpen} onOpenChange={setIsBalanceDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Leave Balances — {selectedEmployeeForBalance?.firstName} {selectedEmployeeForBalance?.surname}
            </DialogTitle>
          </DialogHeader>
          {selectedEmployeeForBalance && (() => {
            const employeeBalances = leaveBalances.filter((b: LeaveBalance) => b.userId === selectedEmployeeForBalance.id);
            const activatedTypes = new Set(employeeBalances.map((b: LeaveBalance) => b.leaveType));
            const notActivated = activatableTypes.filter(t => !activatedTypes.has(t.leaveType));

            return (
              <div className="space-y-6">
                {/* Active balances */}
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-3">Active Leave Types</p>
                  {employeeBalances.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center py-4">No leave balances set for this employee.</p>
                  ) : (
                    <div className="space-y-3">
                      {employeeBalances.map((balance: LeaveBalance) => {
                        const available = (balance.total ?? 0) - (balance.taken ?? 0) - (balance.pending ?? 0);
                        return (
                          <div key={balance.id} className="p-4 bg-slate-50 rounded-lg border">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium capitalize">{balance.leaveType.replace('_', ' ')}</span>
                              <Badge variant={available > 0 ? 'default' : 'destructive'}>
                                {formatLeaveDays(available)} available
                              </Badge>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-sm">
                              <div className="text-center p-2 bg-white rounded">
                                <p className="text-muted-foreground text-xs">Total</p>
                                <p className="font-semibold">{formatLeaveDays(balance.total)}</p>
                              </div>
                              <div className="text-center p-2 bg-white rounded">
                                <p className="text-muted-foreground text-xs">Taken</p>
                                <p className="font-semibold text-amber-600">{formatLeaveDays(balance.taken)}</p>
                              </div>
                              <div className="text-center p-2 bg-white rounded">
                                <p className="text-muted-foreground text-xs">Pending</p>
                                <p className="font-semibold text-blue-600">{formatLeaveDays(balance.pending)}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Restricted types available to activate */}
                {notActivated.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-slate-700 mb-1">Activate Restricted Leave</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      The following leave types require HR/Admin activation per employee.
                    </p>
                    <div className="space-y-2">
                      {notActivated.map(t => (
                        <div key={t.leaveType} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <div>
                            <p className="text-sm font-medium">{t.leaveType}</p>
                            <p className="text-xs text-muted-foreground">{t.description}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-amber-400 text-amber-700 hover:bg-amber-100"
                            disabled={createLeaveBalanceMutation.isPending}
                            onClick={() =>
                              createLeaveBalanceMutation.mutate({
                                userId: selectedEmployeeForBalance.id,
                                leaveType: t.leaveType,
                                total: t.defaultDays,
                              })
                            }
                          >
                            Activate
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Contract Dialog */}
      <Dialog open={isContractDialogOpen} onOpenChange={setIsContractDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Manage Contract - {contractActionUser?.firstName} {contractActionUser?.surname}
            </DialogTitle>
            <DialogDescription>
              Extend the current contract or convert to a different employment type.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Current Type</Label>
              <p className="col-span-3 font-medium">
                {employeeTypes.find(t => t.id === contractActionUser?.employeeTypeId)?.name || 'Not set'}
              </p>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Current End Date</Label>
              <p className="col-span-3 font-medium">
                {contractActionUser?.contractEndDate ? formatDateForDisplay(contractActionUser.contractEndDate) : 'Permanent'}
              </p>
            </div>
            
            <div className="border-t pt-4">
              <Label className="mb-2 block">Action to take</Label>
              <div className="flex gap-4">
                <Button 
                  variant={contractAction === 'extend' ? 'default' : 'outline'}
                  onClick={() => setContractAction('extend')}
                  className="flex-1"
                >
                  Extend Contract
                </Button>
                <Button 
                  variant={contractAction === 'convert' ? 'default' : 'outline'}
                  onClick={() => setContractAction('convert')}
                  className="flex-1"
                >
                  Convert Type
                </Button>
              </div>
            </div>

            {contractAction === 'extend' ? (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="newEndDate" className="text-right">New End Date</Label>
                <Input 
                  id="newEndDate" 
                  type="date"
                  value={contractNewEndDate ? contractNewEndDate.split('T')[0] : ''}
                  onChange={(e) => setContractNewEndDate(e.target.value)}
                  className="col-span-3"
                  data-testid="input-contract-new-end-date"
                />
              </div>
            ) : (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="newType" className="text-right">New Type</Label>
                <div className="col-span-3">
                  <Select 
                    value={contractNewTypeId?.toString() || ''} 
                    onValueChange={(v) => {
                      const typeId = parseInt(v);
                      setContractNewTypeId(typeId);
                      const type = employeeTypes.find(t => t.id === typeId);
                      if (type?.isPermanent === 'yes') setContractNewEndDate('');
                    }}
                  >
                    <SelectTrigger data-testid="select-contract-new-type">
                      <SelectValue placeholder="Select new type" />
                    </SelectTrigger>
                    <SelectContent>
                      {employeeTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id.toString()}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {contractAction === 'convert' && contractNewTypeId && employeeTypes.find(t => t.id === contractNewTypeId)?.isPermanent === 'no' && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="convertEndDate" className="text-right">New End Date</Label>
                <Input 
                  id="convertEndDate" 
                  type="date"
                  value={contractNewEndDate ? contractNewEndDate.split('T')[0] : ''}
                  onChange={(e) => setContractNewEndDate(e.target.value)}
                  className="col-span-3"
                  data-testid="input-contract-convert-end-date"
                />
              </div>
            )}

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="reason" className="text-right">Reason/Notes</Label>
              <Input 
                id="reason" 
                value={contractReason} 
                onChange={(e) => setContractReason(e.target.value)}
                className="col-span-3"
                placeholder="Optional reason for change"
                data-testid="input-contract-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsContractDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleContractAction}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Termination Dialog */}
      <Dialog open={isTerminationDialogOpen} onOpenChange={setIsTerminationDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <UserX className="h-5 w-5" />
              Terminate Personnel
            </DialogTitle>
            <DialogDescription>
              This will mark {terminationUser?.firstName} {terminationUser?.surname} as terminated.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-xs">Employee</Label>
              <p className="col-span-3 font-medium text-sm">
                {terminationUser?.firstName} {terminationUser?.surname}
              </p>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-xs">ID</Label>
              <p className="col-span-3 font-medium text-sm">
                {terminationUser?.id}
              </p>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="terminationDateInput" className="text-right text-xs">Termination Date</Label>
              <Input 
                id="terminationDateInput" 
                type="date"
                value={terminationDate ? terminationDate.split('T')[0] : ''}
                onChange={(e) => setTerminationDate(e.target.value)}
                className="col-span-3"
                data-testid="input-termination-date-dialog"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The employee will be marked as terminated on this date. They will no longer be able to clock in or submit leave requests.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTerminationDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={() => {
                if (terminationUser && terminationDate) {
                  updateUserMutation.mutate({
                    id: terminationUser.id,
                    terminationDate: terminationDate
                  });
                  setIsTerminationDialogOpen(false);
                  toast({
                    title: "Personnel Terminated",
                    description: `${terminationUser.firstName} ${terminationUser.surname} has been marked as terminated.`,
                  });
                } else if (!terminationDate) {
                  toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Please select a termination date.",
                  });
                }
              }}
              data-testid="button-confirm-termination"
            >
              Confirm Termination
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
