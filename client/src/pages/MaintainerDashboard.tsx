import { useState, useRef, useCallback } from 'react';
import { formatDateForDisplay, parseDateFromDisplay } from './admin/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import Webcam from 'react-webcam';
import { useAuth } from '@/lib/auth-context';
import { userApi, departmentApi, employeeTypeApi, orgPositionApi } from '@/lib/api';
import type { OrgPosition } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { LogOut, UserPlus, Search, Camera, Loader2, CheckCircle2, Users, ScanFace } from 'lucide-react';
import { loadFaceModels, detectFaceWithFeedback, type FaceDetectionStatus } from '@/lib/face-recognition';
import type { User } from '@shared/schema';
import aeceLogo from '@assets/AECE_Logo_1765516911038.png';

export default function MaintainerDashboard() {
  const [, setLocation] = useLocation();
  const { user, logout, hasRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showFaceDialog, setShowFaceDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  const webcamRef = useRef<Webcam>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [faceStatus, setFaceStatus] = useState<FaceDetectionStatus | null>(null);
  const [faceMessage, setFaceMessage] = useState('');

  const [formData, setFormData] = useState({
    id: '',
    firstName: '',
    surname: '',
    nickname: '',
    email: '',
    mobile: '',
    homeAddress: '',
    gender: '',
    role: 'worker',
    department: '',
    employeeTypeId: '',
    nationalId: '',
    taxNumber: '',
    nextOfKin: '',
    emergencyNumber: '',
    startDate: '',
    contractEndDate: '',
    managerId: '',
    reportsToPositionId: '',
    password: '',
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: userApi.getAll,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: departmentApi.getAll,
  });

  const { data: employeeTypes = [] } = useQuery({
    queryKey: ['employeeTypes'],
    queryFn: employeeTypeApi.getAll,
  });

  const { data: orgPositions = [] } = useQuery<OrgPosition[]>({
    queryKey: ['orgPositions'],
    queryFn: orgPositionApi.getAll,
  });

  const createUserMutation = useMutation({
    mutationFn: userApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowAddDialog(false);
      resetForm();
      toast({ title: 'Success', description: 'Employee created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<User> }) => userApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowEditDialog(false);
      setSelectedUser(null);
      resetForm();
      toast({ title: 'Success', description: 'Employee updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setFormData({
      id: '',
      firstName: '',
      surname: '',
      nickname: '',
      email: '',
      mobile: '',
      homeAddress: '',
      gender: '',
      role: 'worker',
      department: '',
      employeeTypeId: '',
      nationalId: '',
      taxNumber: '',
      nextOfKin: '',
      emergencyNumber: '',
      startDate: '',
      contractEndDate: '',
      managerId: '',
      reportsToPositionId: '',
      password: '',
    });
  };

  const handleAddEmployee = () => {
    resetForm();
    setShowAddDialog(true);
  };

  const handleEditEmployee = (employee: User) => {
    setSelectedUser(employee);
    setFormData({
      id: employee.id,
      firstName: employee.firstName,
      surname: employee.surname,
      nickname: employee.nickname || '',
      email: employee.email || '',
      mobile: employee.mobile || '',
      homeAddress: employee.homeAddress || '',
      gender: employee.gender || '',
      role: Array.isArray((employee as any).roles) && (employee as any).roles.includes('manager') ? 'manager' : (employee.role || 'worker'),
      department: employee.department || '',
      employeeTypeId: employee.employeeTypeId?.toString() || '',
      nationalId: employee.nationalId || '',
      taxNumber: employee.taxNumber || '',
      nextOfKin: employee.nextOfKin || '',
      emergencyNumber: employee.emergencyNumber || '',
      startDate: employee.startDate || '',
      contractEndDate: employee.contractEndDate || '',
      managerId: employee.managerId || '',
      reportsToPositionId: employee.reportsToPositionId?.toString() || '',
      password: employee.password || '',
    });
    setShowEditDialog(true);
  };

  const handleCaptureFace = async (employee: User) => {
    setSelectedUser(employee);
    setShowFaceDialog(true);
    setModelsLoading(true);
    setFaceMessage('Loading face recognition...');
    
    try {
      const loaded = await loadFaceModels();
      setModelsReady(loaded);
      setFaceMessage(loaded ? 'Position face in the camera' : 'Failed to load models');
    } catch (err) {
      setFaceMessage('Failed to initialize camera');
    } finally {
      setModelsLoading(false);
    }
  };

  const captureAndSaveFace = useCallback(async () => {
    if (!webcamRef.current || !selectedUser || !modelsReady) return;
    
    const video = webcamRef.current.video;
    if (!video || video.readyState !== 4) return;

    setCapturing(true);
    setFaceMessage('Detecting face...');

    try {
      const result = await detectFaceWithFeedback(video);
      setFaceStatus(result.status);
      
      if (result.status !== 'face_detected' || !result.descriptor) {
        setFaceMessage(result.message);
        setCapturing(false);
        return;
      }

      const descriptorArray = Array.from(result.descriptor);
      const descriptorJson = JSON.stringify(descriptorArray);
      
      await updateUserMutation.mutateAsync({
        id: selectedUser.id,
        data: { faceDescriptor: descriptorJson },
      });
      
      setFaceMessage('Face registered successfully!');
      setTimeout(() => {
        setShowFaceDialog(false);
        setSelectedUser(null);
        setModelsReady(false);
      }, 1500);
    } catch (err) {
      setFaceMessage('Failed to save face data');
    } finally {
      setCapturing(false);
    }
  }, [modelsReady, selectedUser, updateUserMutation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const userData: Partial<User> = {
      firstName: formData.firstName,
      surname: formData.surname,
      nickname: formData.nickname || null,
      email: formData.email || null,
      mobile: formData.mobile || null,
      homeAddress: formData.homeAddress || null,
      gender: formData.gender || null,
      role: formData.role as 'worker' | 'manager',
      roles: formData.role === 'manager' ? ['employee', 'manager'] : ['employee'],
      department: formData.department || null,
      employeeTypeId: formData.employeeTypeId ? parseInt(formData.employeeTypeId) : null,
      nationalId: formData.nationalId || null,
      taxNumber: formData.taxNumber || null,
      nextOfKin: formData.nextOfKin || null,
      emergencyNumber: formData.emergencyNumber || null,
      startDate: formData.startDate || null,
      contractEndDate: formData.contractEndDate || null,
      managerId: formData.managerId || null,
      reportsToPositionId: formData.reportsToPositionId ? parseInt(formData.reportsToPositionId) : null,
      password: formData.password || null,
    };

    if (showAddDialog) {
      createUserMutation.mutate({ ...userData, id: formData.id } as User);
    } else if (selectedUser) {
      updateUserMutation.mutate({ id: selectedUser.id, data: userData });
    }
  };

  const handleLogout = () => {
    logout();
    setLocation('/');
  };

  const filteredUsers = users.filter(u => 
    u.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.surname.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.nationalId && u.nationalId.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const managers = users.filter(u => Array.isArray((u as any).roles) && (u as any).roles.includes('manager'));

  if (!user) {
    setLocation('/login');
    return null;
  }

  // Access control: only users with maintainer role can access this dashboard
  if (!hasRole('maintainer')) {
    setLocation('/');
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={aeceLogo} alt="AECE" className="h-10" />
            <div>
              <h1 className="text-xl font-heading font-bold text-slate-900">User Maintainer Portal</h1>
              <p className="text-sm text-muted-foreground">Manage employee data and face registration</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {user.firstName} {user.surname}
            </span>
            <Button variant="outline" size="sm" onClick={handleLogout} data-testid="button-logout">
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Employee Management
                </CardTitle>
                <CardDescription>Add, edit employees and register face data for login</CardDescription>
              </div>
              <Button onClick={handleAddEmployee} data-testid="button-add-employee">
                <UserPlus className="h-4 w-4 mr-2" />
                Add Employee
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, ID, or national ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Face</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((employee) => (
                    <TableRow key={employee.id} data-testid={`row-employee-${employee.id}`}>
                      <TableCell className="font-mono">{employee.id}</TableCell>
                      <TableCell>
                        {employee.firstName} {employee.surname}
                        {employee.nickname && <span className="text-muted-foreground ml-1">({employee.nickname})</span>}
                      </TableCell>
                      <TableCell>{employee.department || '-'}</TableCell>
                      <TableCell>{employee.email || '-'}</TableCell>
                      <TableCell>
                        {employee.faceDescriptor ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Registered
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-slate-50 text-slate-600">
                            Not registered
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditEmployee(employee)}
                            data-testid={`button-edit-${employee.id}`}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCaptureFace(employee)}
                            data-testid={`button-face-${employee.id}`}
                          >
                            <Camera className="h-4 w-4 mr-1" />
                            Face
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>

      <Dialog open={showAddDialog || showEditDialog} onOpenChange={(open) => {
        if (!open) {
          setShowAddDialog(false);
          setShowEditDialog(false);
          setSelectedUser(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{showAddDialog ? 'Add New Employee' : 'Edit Employee'}</DialogTitle>
            <DialogDescription>
              {showAddDialog ? 'Enter the details for the new employee' : 'Update employee information'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {showAddDialog && (
                <div className="space-y-2">
                  <Label>Employee ID *</Label>
                  <Input
                    value={formData.id}
                    onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                    placeholder="e.g., AECE1001"
                    required
                    data-testid="input-employee-id"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>First Name *</Label>
                <Input
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  required
                  data-testid="input-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Surname *</Label>
                <Input
                  value={formData.surname}
                  onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
                  required
                  data-testid="input-surname"
                />
              </div>
              <div className="space-y-2">
                <Label>Nickname</Label>
                <Input
                  value={formData.nickname}
                  onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                  data-testid="input-nickname"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-2">
                <Label>Mobile</Label>
                <Input
                  value={formData.mobile}
                  onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                  data-testid="input-mobile"
                />
              </div>
              <div className="space-y-2">
                <Label>National ID</Label>
                <Input
                  value={formData.nationalId}
                  onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })}
                  placeholder="SA ID Number"
                  data-testid="input-national-id"
                />
              </div>
              <div className="space-y-2">
                <Label>Gender</Label>
                <Select value={formData.gender} onValueChange={(v) => setFormData({ ...formData, gender: v })}>
                  <SelectTrigger data-testid="select-gender">
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })}>
                  <SelectTrigger data-testid="select-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="worker">Employee</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <SearchableSelect
                  value={formData.department}
                  onValueChange={(v) => setFormData({ ...formData, department: v })}
                  options={departments.map(dept => ({ value: dept.name, label: dept.name }))}
                  placeholder="Select department"
                />
              </div>
              <div className="space-y-2">
                <Label>Employee Type</Label>
                <SearchableSelect
                  value={formData.employeeTypeId}
                  onValueChange={(v) => setFormData({ ...formData, employeeTypeId: v })}
                  options={employeeTypes.map(type => ({ value: type.id.toString(), label: type.name }))}
                  placeholder="Select type"
                />
              </div>
              <div className="space-y-2">
                <Label>Reports To (Position)</Label>
                <SearchableSelect
                  value={formData.reportsToPositionId || 'none'}
                  onValueChange={(v) => setFormData({ ...formData, reportsToPositionId: v === 'none' ? '' : v })}
                  options={[
                    { value: 'none', label: 'No Reporting Position' },
                    ...orgPositions
                      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.title.localeCompare(b.title))
                      .map(pos => ({ value: pos.id.toString(), label: pos.title })),
                  ]}
                  placeholder="Select reporting position (optional)"
                />
              </div>
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="text"
                  placeholder="dd/mm/yyyy"
                  value={formatDateForDisplay(formData.startDate)}
                  onChange={(e) => setFormData({ ...formData, startDate: parseDateFromDisplay(e.target.value) })}
                  data-testid="input-start-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Contract End Date</Label>
                <Input
                  type="text"
                  placeholder="dd/mm/yyyy"
                  value={formatDateForDisplay(formData.contractEndDate)}
                  onChange={(e) => setFormData({ ...formData, contractEndDate: parseDateFromDisplay(e.target.value) })}
                  data-testid="input-contract-end"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Home Address</Label>
                <Input
                  value={formData.homeAddress}
                  onChange={(e) => setFormData({ ...formData, homeAddress: e.target.value })}
                  data-testid="input-address"
                />
              </div>
              <div className="space-y-2">
                <Label>Next of Kin</Label>
                <Input
                  value={formData.nextOfKin}
                  onChange={(e) => setFormData({ ...formData, nextOfKin: e.target.value })}
                  placeholder="Name and relationship"
                  data-testid="input-next-of-kin"
                />
              </div>
              <div className="space-y-2">
                <Label>Emergency Contact</Label>
                <Input
                  value={formData.emergencyNumber}
                  onChange={(e) => setFormData({ ...formData, emergencyNumber: e.target.value })}
                  data-testid="input-emergency"
                />
              </div>
              <div className="space-y-2">
                <Label>Tax Number</Label>
                <Input
                  value={formData.taxNumber}
                  onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value })}
                  data-testid="input-tax"
                />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="text"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Leave blank to keep current"
                  data-testid="input-password"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => {
                setShowAddDialog(false);
                setShowEditDialog(false);
                setSelectedUser(null);
                resetForm();
              }}>
                Cancel
              </Button>
              <Button type="submit" disabled={createUserMutation.isPending || updateUserMutation.isPending} data-testid="button-save">
                {(createUserMutation.isPending || updateUserMutation.isPending) ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showFaceDialog} onOpenChange={(open) => {
        if (!open) {
          setShowFaceDialog(false);
          setSelectedUser(null);
          setModelsReady(false);
          setFaceStatus(null);
          setFaceMessage('');
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanFace className="h-5 w-5" />
              Register Face
            </DialogTitle>
            <DialogDescription>
              {selectedUser && `Capture face data for ${selectedUser.firstName} ${selectedUser.surname}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative rounded-xl overflow-hidden bg-slate-900 aspect-video">
              <Webcam
                ref={webcamRef}
                audio={false}
                screenshotFormat="image/jpeg"
                videoConstraints={{ facingMode: 'user', width: 640, height: 480 }}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className={`w-48 h-48 rounded-full border-4 ${
                  faceStatus === 'face_detected' ? 'border-green-500' : 
                  faceStatus ? 'border-amber-500' : 
                  'border-white/50'
                } transition-colors`} />
              </div>
            </div>
            
            <div className="text-center">
              {modelsLoading ? (
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{faceMessage}</span>
                </div>
              ) : (
                <p className={faceStatus === 'face_detected' ? 'text-green-600' : 'text-muted-foreground'}>
                  {faceMessage}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowFaceDialog(false)}>
                Cancel
              </Button>
              <Button 
                onClick={captureAndSaveFace} 
                disabled={!modelsReady || capturing}
                data-testid="button-capture-face"
              >
                {capturing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Capturing...
                  </>
                ) : (
                  <>
                    <Camera className="h-4 w-4 mr-2" />
                    Capture Face
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
