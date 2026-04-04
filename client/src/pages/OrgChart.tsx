import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Building2, User as UserIcon, Crown, Briefcase, ZoomIn, ZoomOut, RotateCcw, Download, Loader2, Eye, EyeOff, Maximize2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { userApi, departmentApi, attendanceApi, orgPositionApi } from '@/lib/api';
import defaultAvatarUrl from '@/assets/default-avatar.jpg';
import type { User, Department, OrgPosition } from '@shared/schema';
import * as d3 from 'd3-hierarchy';
import { jsPDF } from 'jspdf';
import { useToast } from '@/hooks/use-toast';

interface WorkerData {
  id: string;
  name: string;
  photoUrl: string | null;
  isManager?: boolean;
}

interface AttendanceProps {
  showAttendance: boolean;
  clockedInUserIds: Set<string>;
}

interface OrgNodeData {
  id: string;
  userId?: string;
  name: string;
  role: string;
  department: string | null;
  photoUrl: string | null;
  isRoot?: boolean;
  kind: 'manager' | 'department-group';
  workers?: WorkerData[];
  nodeHeight: number;
  isVacant?: boolean;
  isOutsourced?: boolean;
  positionTitle?: string;
  tier?: number; // Visual tier: 1 = normal level, higher numbers push node down within siblings
}

const NODE_WIDTH = 240;
const MANAGER_NODE_HEIGHT = 90;
const WORKER_ROW_HEIGHT = 36;
const DEPT_HEADER_HEIGHT = 28;
const VERTICAL_GAP = 6;
const HORIZONTAL_GAP = 8;

const DEPARTMENT_COLORS: Record<string, string> = {
  'Administration': '#2563eb',
  'Finance': '#16a34a',
  'Front Office': '#ea580c',
  'Human Resources': '#be123c',
  'Manufacturing': '#7c3aed',
  'Mechanical': '#0891b2',
  'Research & Development': '#4f46e5',
  'Sales': '#ca8a04',
  'IT': '#0d9488',
  'Operations': '#dc2626',
  'Repairs': '#f97316',
  'Managing Director': '#f59e0b',
};

function getDepartmentColor(department: string | null): string {
  if (!department) return '#6b7280';
  return DEPARTMENT_COLORS[department] || '#6b7280';
}

function ManagerNode({ data, x, y, showAttendance, clockedInUserIds }: { data: OrgNodeData; x: number; y: number } & AttendanceProps) {
  const isRoot = data.isRoot;
  const isVacant = data.isVacant;
  const isOutsourced = data.isOutsourced;
  const deptColor = getDepartmentColor(data.department);
  const isClockedIn = data.userId ? clockedInUserIds.has(data.userId) : false;
  const opacity = showAttendance ? (isClockedIn || isVacant || isOutsourced ? 1 : 0.3) : 1;
  
  return (
    <g transform={`translate(${x - NODE_WIDTH / 2}, ${y})`} style={{ opacity }}>
      <foreignObject width={NODE_WIDTH} height={MANAGER_NODE_HEIGHT}>
        <div 
          className={`h-full rounded-lg border-2 shadow-md overflow-hidden ${
            isVacant ? 'border-dashed border-red-400 bg-red-50' :
            isOutsourced ? 'border-dashed border-amber-400 bg-amber-50' :
            isRoot ? 'border-amber-500 bg-amber-50' : 'border-primary bg-primary/5'
          }`}
        >
          {/* Department header at top */}
          <div 
            className="px-2 py-0.5 text-white text-[11px] font-medium truncate"
            style={{ backgroundColor: isVacant ? '#dc2626' : isOutsourced ? '#d97706' : deptColor }}
          >
            {data.positionTitle || data.department || 'No Department'}
          </div>
          
          {/* Manager content */}
          <div className="flex items-center gap-2 p-2 pb-3">
            {isVacant ? (
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-red-200 text-red-600 border-2 border-dashed border-red-400">
                <UserIcon className="h-4 w-4" />
              </div>
            ) : isOutsourced ? (
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-amber-200 text-amber-700 border-2 border-dashed border-amber-400">
                <Briefcase className="h-4 w-4" />
              </div>
            ) : data.photoUrl ? (
              <img 
                src={data.photoUrl} 
                alt={data.name} 
                className="w-9 h-9 rounded-full object-cover shrink-0" 
              />
            ) : (
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                isRoot ? 'bg-amber-500 text-white' : 'bg-primary text-white'
              }`}>
                <Crown className={isRoot ? "h-4 w-4" : "h-3.5 w-3.5"} />
              </div>
            )}
            <div className="flex-1 min-w-0 overflow-hidden">
              <p className={`font-semibold text-[15px] truncate leading-tight ${isVacant ? 'text-red-600 italic' : isOutsourced ? 'text-amber-700 italic' : ''}`}>
                {isVacant ? 'VACANT' : isOutsourced ? 'OUTSOURCED' : data.name}
              </p>
              <Badge 
                variant={isVacant ? "destructive" : "default"} 
                className={`text-[10px] px-1.5 py-0 h-4 mt-1 ${isOutsourced ? 'bg-amber-500 text-white' : ''}`}
              >
                {isVacant ? 'Vacant' : isOutsourced ? 'Outsourced' : 'Manager'}
              </Badge>
            </div>
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

function DepartmentGroupNode({ data, x, y, showAttendance, clockedInUserIds }: { data: OrgNodeData; x: number; y: number } & AttendanceProps) {
  const deptColor = getDepartmentColor(data.department);
  const workers = data.workers || [];
  const clockedInCount = showAttendance ? workers.filter(w => clockedInUserIds.has(w.id)).length : workers.length;
  
  return (
    <g transform={`translate(${x - NODE_WIDTH / 2}, ${y})`}>
      <foreignObject width={NODE_WIDTH} height={data.nodeHeight}>
        <div 
          className="h-full rounded-lg border-2 shadow-sm overflow-hidden"
          style={{ borderColor: deptColor }}
        >
          <div 
            className="px-2 py-1.5 text-white text-[11px] font-semibold flex items-center gap-1"
            style={{ backgroundColor: deptColor }}
          >
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{data.department || 'Unassigned'}</span>
            <span className="ml-auto opacity-75 shrink-0">
              {showAttendance ? `${clockedInCount}/${workers.length}` : `(${workers.length})`}
            </span>
          </div>
          
          <div className="bg-white">
            {workers.map((worker, idx) => {
              const isClockedIn = clockedInUserIds.has(worker.id);
              const workerOpacity = showAttendance ? (isClockedIn ? 1 : 0.3) : 1;
              
              return (
                <div 
                  key={worker.id}
                  className={`flex items-center gap-2 px-2 py-1 ${idx > 0 ? 'border-t border-slate-100' : ''}`}
                  style={{ height: WORKER_ROW_HEIGHT, opacity: workerOpacity }}
                >
                  <img 
                    src={worker.photoUrl || defaultAvatarUrl} 
                    alt={worker.name} 
                    className="w-6 h-6 rounded-full object-cover shrink-0" 
                  />
                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    <p className="text-[15px] font-semibold truncate">{worker.name}</p>
                    {worker.isManager && (
                      <Badge variant="default" className="text-[8px] px-1 py-0 h-3.5 shrink-0">Mgr</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

function OrgNode({ data, x, y, showAttendance, clockedInUserIds }: { data: OrgNodeData; x: number; y: number } & AttendanceProps) {
  if (data.kind === 'department-group') {
    return <DepartmentGroupNode data={data} x={x} y={y} showAttendance={showAttendance} clockedInUserIds={clockedInUserIds} />;
  }
  return <ManagerNode data={data} x={x} y={y} showAttendance={showAttendance} clockedInUserIds={clockedInUserIds} />;
}

function Connector({ source, target, sourceHeight, targetTier = 1 }: { source: { x: number; y: number }; target: { x: number; y: number }; sourceHeight: number; targetTier?: number }) {
  const sourceBottom = source.y + sourceHeight;
  const targetTop = target.y;
  // For tiered nodes the elbow stays close to the parent so the long drop is vertical,
  // not diagonal — this way the line still visually "comes from" the parent level.
  const midY = targetTier > 1
    ? sourceBottom + 20
    : (sourceBottom + targetTop) / 2;
  
  const path = `
    M ${source.x} ${sourceBottom}
    L ${source.x} ${midY}
    L ${target.x} ${midY}
    L ${target.x} ${targetTop}
  `;
  
  return (
    <path
      d={path}
      fill="none"
      stroke="#94a3b8"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

export default function OrgChart() {
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);
  const { toast } = useToast();

  const today = new Date().toISOString().split('T')[0];
  const { data: todayAttendance = [] } = useQuery({
    queryKey: ['attendance', 'today', today],
    queryFn: () => attendanceApi.getAll(today, today),
    enabled: showAttendance,
  });

  const clockedInUserIds = useMemo(() => {
    if (!showAttendance || todayAttendance.length === 0) return new Set<string>();
    
    const now = new Date();
    const userLastAction = new Map<string, { type: string; timestamp: Date }>();
    
    const sortedRecords = [...todayAttendance].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    sortedRecords.forEach(record => {
      const recordTime = new Date(record.timestamp);
      if (recordTime <= now) {
        userLastAction.set(record.userId, { type: record.type, timestamp: recordTime });
      }
    });
    
    const clockedIn = new Set<string>();
    userLastAction.forEach((action, userId) => {
      if (action.type === 'in') {
        clockedIn.add(userId);
      }
    });
    
    return clockedIn;
  }, [showAttendance, todayAttendance]);

  const buildExportSvg = () => {
    if (!treeData) return null;
    
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('width', String(dimensions.width));
    svg.setAttribute('height', String(dimensions.height));
    svg.setAttribute('viewBox', `0 0 ${dimensions.width} ${dimensions.height}`);
    svg.setAttribute('xmlns', svgNs);
    
    // Add white background
    const bg = document.createElementNS(svgNs, 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', '#ffffff');
    svg.appendChild(bg);
    
    // Create main group with offset
    const mainGroup = document.createElementNS(svgNs, 'g');
    mainGroup.setAttribute('transform', `translate(${dimensions.offsetX}, 30)`);
    svg.appendChild(mainGroup);
    
    // Draw connecting lines first
    const links = treeData.links();
    links.forEach(link => {
      const sourceX = link.source.x;
      const sourceY = link.source.y + link.source.data.data.nodeHeight;
      const targetX = link.target.x;
      const targetY = link.target.y;
      const targetTierVal = (link.target.data.data.tier || 1) as number;
      // Same elbow logic as React Connector: tiered nodes keep elbow near parent
      const midY = targetTierVal > 1 ? sourceY + 20 : (sourceY + targetY) / 2;
      
      const path = document.createElementNS(svgNs, 'path');
      path.setAttribute('d', `M${sourceX},${sourceY} L${sourceX},${midY} L${targetX},${midY} L${targetX},${targetY}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#94a3b8');
      path.setAttribute('stroke-width', '2');
      mainGroup.appendChild(path);
    });
    
    // Draw nodes
    const nodes = treeData.descendants();
    nodes.forEach(node => {
      const d = node.data.data;
      const x = node.x - NODE_WIDTH / 2;
      const y = node.y;
      const deptColor = getDepartmentColor(d.department);
      
      const nodeGroup = document.createElementNS(svgNs, 'g');
      nodeGroup.setAttribute('transform', `translate(${x}, ${y})`);
      
      if (d.kind === 'manager') {
        const isVacant = d.isVacant;
        const isOutsourced = d.isOutsourced;
        // Manager node background
        const rect = document.createElementNS(svgNs, 'rect');
        rect.setAttribute('width', String(NODE_WIDTH));
        rect.setAttribute('height', String(MANAGER_NODE_HEIGHT));
        rect.setAttribute('rx', '8');
        rect.setAttribute('fill', isVacant ? '#fef2f2' : isOutsourced ? '#fffbeb' : d.isRoot ? '#fef3c7' : '#eff6ff');
        rect.setAttribute('stroke', isVacant ? '#dc2626' : isOutsourced ? '#d97706' : d.isRoot ? '#f59e0b' : '#3b82f6');
        rect.setAttribute('stroke-width', '2');
        if (isVacant || isOutsourced) rect.setAttribute('stroke-dasharray', '6,3');
        nodeGroup.appendChild(rect);
        
        // Department header bar
        const deptBar = document.createElementNS(svgNs, 'rect');
        deptBar.setAttribute('width', String(NODE_WIDTH));
        deptBar.setAttribute('height', '16');
        deptBar.setAttribute('rx', '8');
        deptBar.setAttribute('fill', isVacant ? '#dc2626' : isOutsourced ? '#d97706' : deptColor);
        nodeGroup.appendChild(deptBar);
        
        // Cover bottom corners of dept bar
        const coverRect = document.createElementNS(svgNs, 'rect');
        coverRect.setAttribute('y', '8');
        coverRect.setAttribute('width', String(NODE_WIDTH));
        coverRect.setAttribute('height', '8');
        coverRect.setAttribute('fill', deptColor);
        nodeGroup.appendChild(coverRect);
        
        // Department text
        const deptText = document.createElementNS(svgNs, 'text');
        deptText.setAttribute('x', String(NODE_WIDTH / 2));
        deptText.setAttribute('y', '12');
        deptText.setAttribute('text-anchor', 'middle');
        deptText.setAttribute('fill', '#ffffff');
        deptText.setAttribute('font-size', '12');
        deptText.setAttribute('font-family', 'Arial, sans-serif');
        deptText.textContent = d.positionTitle || d.department || 'No Department';
        nodeGroup.appendChild(deptText);
        
        // Name text
        const nameText = document.createElementNS(svgNs, 'text');
        nameText.setAttribute('x', String(NODE_WIDTH / 2));
        nameText.setAttribute('y', '40');
        nameText.setAttribute('text-anchor', 'middle');
        nameText.setAttribute('fill', isVacant ? '#dc2626' : isOutsourced ? '#b45309' : '#1e293b');
        nameText.setAttribute('font-size', '14');
        nameText.setAttribute('font-weight', 'bold');
        nameText.setAttribute('font-family', 'Arial, sans-serif');
        if (isVacant || isOutsourced) nameText.setAttribute('font-style', 'italic');
        const nameDisplay = isVacant ? 'VACANT' : isOutsourced ? 'OUTSOURCED' : d.name;
        nameText.textContent = nameDisplay.length > 22 ? nameDisplay.substring(0, 20) + '...' : nameDisplay;
        nodeGroup.appendChild(nameText);
        
        // Manager badge
        const badgeLabel = isVacant ? 'Vacant' : isOutsourced ? 'Outsourced' : 'Manager';
        const badgeWidth = isOutsourced ? 76 : 56;
        const badgeRect = document.createElementNS(svgNs, 'rect');
        badgeRect.setAttribute('x', String((NODE_WIDTH - badgeWidth) / 2));
        badgeRect.setAttribute('y', '50');
        badgeRect.setAttribute('width', String(badgeWidth));
        badgeRect.setAttribute('height', '18');
        badgeRect.setAttribute('rx', '4');
        badgeRect.setAttribute('fill', isVacant ? '#dc2626' : isOutsourced ? '#d97706' : '#3b82f6');
        nodeGroup.appendChild(badgeRect);
        
        const badgeText = document.createElementNS(svgNs, 'text');
        badgeText.setAttribute('x', String(NODE_WIDTH / 2));
        badgeText.setAttribute('y', '63');
        badgeText.setAttribute('text-anchor', 'middle');
        badgeText.setAttribute('fill', '#ffffff');
        badgeText.setAttribute('font-size', '12');
        badgeText.setAttribute('font-family', 'Arial, sans-serif');
        badgeText.textContent = badgeLabel;
        nodeGroup.appendChild(badgeText);
        
      } else if (d.kind === 'department-group') {
        const workers = d.workers || [];
        const totalHeight = DEPT_HEADER_HEIGHT + workers.length * WORKER_ROW_HEIGHT + 4;
        
        // Background
        const rect = document.createElementNS(svgNs, 'rect');
        rect.setAttribute('width', String(NODE_WIDTH));
        rect.setAttribute('height', String(totalHeight));
        rect.setAttribute('rx', '8');
        rect.setAttribute('fill', '#ffffff');
        rect.setAttribute('stroke', deptColor);
        rect.setAttribute('stroke-width', '2');
        nodeGroup.appendChild(rect);
        
        // Department header
        const headerRect = document.createElementNS(svgNs, 'rect');
        headerRect.setAttribute('width', String(NODE_WIDTH));
        headerRect.setAttribute('height', String(DEPT_HEADER_HEIGHT));
        headerRect.setAttribute('rx', '8');
        headerRect.setAttribute('fill', deptColor);
        nodeGroup.appendChild(headerRect);
        
        // Cover bottom corners
        const coverRect = document.createElementNS(svgNs, 'rect');
        coverRect.setAttribute('y', '12');
        coverRect.setAttribute('width', String(NODE_WIDTH));
        coverRect.setAttribute('height', '16');
        coverRect.setAttribute('fill', deptColor);
        nodeGroup.appendChild(coverRect);
        
        // Department name
        const deptText = document.createElementNS(svgNs, 'text');
        deptText.setAttribute('x', '8');
        deptText.setAttribute('y', '18');
        deptText.setAttribute('fill', '#ffffff');
        deptText.setAttribute('font-size', '13');
        deptText.setAttribute('font-weight', 'bold');
        deptText.setAttribute('font-family', 'Arial, sans-serif');
        deptText.textContent = `${d.department || 'Unassigned'} (${workers.length})`;
        nodeGroup.appendChild(deptText);
        
        // Worker names
        workers.forEach((worker, idx) => {
          const workerY = DEPT_HEADER_HEIGHT + idx * WORKER_ROW_HEIGHT + 22;
          
          // Worker circle
          const circle = document.createElementNS(svgNs, 'circle');
          circle.setAttribute('cx', '16');
          circle.setAttribute('cy', String(workerY - 4));
          circle.setAttribute('r', '10');
          circle.setAttribute('fill', deptColor);
          circle.setAttribute('opacity', '0.2');
          nodeGroup.appendChild(circle);
          
          // Worker name
          const workerText = document.createElementNS(svgNs, 'text');
          workerText.setAttribute('x', '32');
          workerText.setAttribute('y', String(workerY));
          workerText.setAttribute('fill', '#334155');
          workerText.setAttribute('font-size', '14');
          workerText.setAttribute('font-weight', 'bold');
          workerText.setAttribute('font-family', 'Arial, sans-serif');
          const displayName = worker.name.length > 16 ? worker.name.substring(0, 14) + '...' : worker.name;
          workerText.textContent = worker.isManager ? displayName : (worker.name.length > 18 ? worker.name.substring(0, 16) + '...' : worker.name);
          nodeGroup.appendChild(workerText);
          
          if (worker.isManager) {
            const mgrBadge = document.createElementNS(svgNs, 'rect');
            const badgeX = NODE_WIDTH - 36;
            mgrBadge.setAttribute('x', String(badgeX));
            mgrBadge.setAttribute('y', String(workerY - 10));
            mgrBadge.setAttribute('width', '28');
            mgrBadge.setAttribute('height', '14');
            mgrBadge.setAttribute('rx', '3');
            mgrBadge.setAttribute('fill', '#3b82f6');
            nodeGroup.appendChild(mgrBadge);
            
            const mgrText = document.createElementNS(svgNs, 'text');
            mgrText.setAttribute('x', String(badgeX + 14));
            mgrText.setAttribute('y', String(workerY - 1));
            mgrText.setAttribute('text-anchor', 'middle');
            mgrText.setAttribute('fill', '#ffffff');
            mgrText.setAttribute('font-size', '8');
            mgrText.setAttribute('font-family', 'Arial, sans-serif');
            mgrText.textContent = 'Mgr';
            nodeGroup.appendChild(mgrText);
          }
        });
      }
      
      mainGroup.appendChild(nodeGroup);
    });
    
    return svg;
  };
  
  const handleExportPDF = async () => {
    if (!treeData) {
      toast({ title: "Error", description: "Unable to export chart", variant: "destructive" });
      return;
    }
    
    setIsExporting(true);
    try {
      // Build pure SVG for export
      const exportSvg = buildExportSvg();
      if (!exportSvg) throw new Error('Failed to build export SVG');
      
      const svgWidth = dimensions.width;
      const svgHeight = dimensions.height;
      
      // Serialize SVG to string
      const serializer = new XMLSerializer();
      let svgString = serializer.serializeToString(exportSvg);
      
      // Add XML declaration
      svgString = '<?xml version="1.0" encoding="UTF-8"?>' + svgString;
      
      // Create blob and URL
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      // Create image and load SVG
      const img = new Image();
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load SVG'));
        img.src = url;
      });
      
      // Create canvas and draw
      const canvas = document.createElement('canvas');
      const scale = 2; // Higher quality
      canvas.width = svgWidth * scale;
      canvas.height = svgHeight * scale;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');
      
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, svgWidth, svgHeight);
      
      // Clean up blob URL
      URL.revokeObjectURL(url);
      
      const imgData = canvas.toDataURL('image/png');
      
      // Create PDF (landscape orientation for org chart)
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: 'a4',
      });
      
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      // Calculate scaling to fit the chart
      const pdfScale = Math.min((pageWidth - 40) / svgWidth, (pageHeight - 60) / svgHeight);
      const scaledWidth = svgWidth * pdfScale;
      const scaledHeight = svgHeight * pdfScale;
      
      // Center the image
      const x = (pageWidth - scaledWidth) / 2;
      const y = 40;
      
      // Add title
      pdf.setFontSize(16);
      pdf.text('AEC Electronics - Organization Chart', pageWidth / 2, 25, { align: 'center' });
      
      // Add the image
      pdf.addImage(imgData, 'PNG', x, y, scaledWidth, scaledHeight);
      
      // Add footer with date
      pdf.setFontSize(10);
      const today = new Date().toLocaleDateString('en-GB');
      pdf.text(`Generated: ${today}`, pageWidth / 2, pageHeight - 15, { align: 'center' });
      
      // Download PDF
      pdf.save('AECE-Organization-Chart.pdf');
      
      toast({ title: "Success", description: "Organization chart exported to PDF" });
      
    } catch (error) {
      console.error('PDF export failed:', error);
      toast({ title: "Error", description: "Failed to export PDF. Please try again.", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };


  const { data: users = [], isLoading: usersLoading, isError: usersError } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: userApi.getAll,
  });

  const { data: departments = [], isLoading: deptsLoading, isError: deptsError } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: departmentApi.getAll,
  });

  const { data: orgPositions = [], isLoading: positionsLoading, isError: positionsError } = useQuery<OrgPosition[]>({
    queryKey: ['org-positions'],
    queryFn: orgPositionApi.getAll,
  });

  const isLoading = usersLoading || deptsLoading || positionsLoading;
  const isError = usersError || deptsError || positionsError;

  const activeUsers = useMemo(() => users.filter(u => !u.terminationDate && !u.exclude), [users]);

  const { treeData, dimensions } = useMemo(() => {
    try {
    if (activeUsers.length === 0 && orgPositions.length === 0) {
      return { treeData: null, dimensions: { width: 800, height: 400, offsetX: 0 } };
    }

    const userMap = new Map(activeUsers.map(u => [u.id, u]));
    
    interface TreeNode {
      data: OrgNodeData;
      children: TreeNode[];
    }

    // ===== POSITION-BASED ORG CHART =====
    if (orgPositions.length > 0) {
      const positionMap = new Map(orgPositions.map(p => [p.id, p]));
      const rootPositions = orgPositions.filter(p => !p.parentPositionId);
      
      const getUsersForPosition = (posId: number): User[] => {
        return activeUsers.filter(u => u.orgPositionId === posId);
      };

      const isWorkerPosition = (posId: number): boolean => {
        const pos = positionMap.get(posId)!;
        if ((pos as any).isOutsourced) return false; // outsourced positions always get their own node
        const hasChildren = orgPositions.some(p => p.parentPositionId === posId);
        if (hasChildren) return false;
        const assignedUsers = getUsersForPosition(posId);
        if (assignedUsers.length === 1 && assignedUsers[0].role === 'manager') return false;
        if (assignedUsers.length > 1) return true;
        if (assignedUsers.length === 0) return true;
        return assignedUsers[0].role === 'worker';
      };

      const buildPositionSubtree = (posId: number): TreeNode => {
        const pos = positionMap.get(posId)!;
        const assignedUsers = getUsersForPosition(posId);
        const primaryUser = assignedUsers.length > 0 ? assignedUsers[0] : null;
        const childPositions = orgPositions
          .filter(p => p.parentPositionId === posId)
          .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        
        const managerChildren = childPositions.filter(cp => !isWorkerPosition(cp.id));
        const workerChildren = childPositions.filter(cp => isWorkerPosition(cp.id));

        const children: TreeNode[] = managerChildren.map(cp => buildPositionSubtree(cp.id));

        // Collect all worker entries for department groups:
        // 1. Workers assigned to child worker positions via orgPositionId
        // 2. Workers who report to this position's occupant via managerId but have no orgPositionId
        const groupsByDept = new Map<string, { id: string; name: string; photoUrl: string | null }[]>();

        workerChildren.forEach(wp => {
          const wPos = positionMap.get(wp.id)!;
          const wUsers = getUsersForPosition(wp.id);
          const dept = wPos.department || wPos.title || 'Staff';
          if (!groupsByDept.has(dept)) groupsByDept.set(dept, []);
          if (wUsers.length > 0) {
            wUsers.forEach(wUser => {
              groupsByDept.get(dept)!.push({
                id: wUser.id,
                name: `${wUser.firstName} ${wUser.surname}`,
                photoUrl: wUser.photoUrl,
              });
            });
          } else {
            groupsByDept.get(dept)!.push({
              id: `vacant-${wp.id}`,
              name: `VACANT - ${wPos.title}`,
              photoUrl: null,
            });
          }
        });

        // Include employees who report to this position's occupant via managerId but have no orgPositionId
        if (primaryUser) {
          activeUsers
            .filter(u => u.managerId === primaryUser.id && !u.orgPositionId)
            .forEach(w => {
              const dept = w.department || 'Staff';
              if (!groupsByDept.has(dept)) groupsByDept.set(dept, []);
              groupsByDept.get(dept)!.push({
                id: w.id,
                name: `${w.firstName} ${w.surname}`,
                photoUrl: w.photoUrl,
              });
            });
        }

        if (groupsByDept.size > 0) {
          Array.from(groupsByDept.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .forEach(([dept, workers]) => {
              const nodeHeight = DEPT_HEADER_HEIGHT + workers.length * WORKER_ROW_HEIGHT + 4;
              children.push({
                data: {
                  id: `pos-group-${posId}-${dept}`,
                  name: dept,
                  role: 'worker',
                  department: dept,
                  photoUrl: null,
                  kind: 'department-group' as const,
                  workers,
                  nodeHeight,
                },
                children: [],
              });
            });
        }
        
        const hasMultipleUsers = assignedUsers.length > 1;
        const isVacant = assignedUsers.length === 0 && !(pos as any).isOutsourced;
        
        if (hasMultipleUsers) {
          const workerEntries = assignedUsers.map(u => ({
            id: u.id,
            name: `${u.firstName} ${u.surname}`,
            photoUrl: u.photoUrl,
          }));
          const nodeHeight = DEPT_HEADER_HEIGHT + workerEntries.length * WORKER_ROW_HEIGHT + 4;
          return {
            data: {
              id: `pos-${posId}`,
              name: pos.title,
              role: 'worker',
              department: pos.department || pos.title,
              photoUrl: null,
              kind: 'department-group' as const,
              workers: workerEntries,
              nodeHeight,
            },
            children,
          };
        }
        
        return {
          data: {
            id: `pos-${posId}`,
            userId: primaryUser?.id,
            name: primaryUser ? `${primaryUser.firstName} ${primaryUser.surname}` : 'VACANT',
            role: 'manager',
            department: pos.department || pos.title,
            photoUrl: primaryUser?.photoUrl || null,
            isRoot: !pos.parentPositionId,
            kind: 'manager' as const,
            nodeHeight: MANAGER_NODE_HEIGHT,
            isVacant,
            isOutsourced: !!(pos as any).isOutsourced,
            positionTitle: pos.title,
            tier: (pos as any).tier || 1,
          } as OrgNodeData,
          children,
        };
      };
      
      let rootNode: TreeNode;
      if (rootPositions.length === 1) {
        rootNode = buildPositionSubtree(rootPositions[0].id);
        rootNode.data.isRoot = true;
      } else {
        rootNode = {
          data: {
            id: 'company',
            name: 'AEC Electronics',
            role: 'manager',
            department: 'Managing Director',
            photoUrl: null,
            isRoot: true,
            kind: 'manager',
            nodeHeight: MANAGER_NODE_HEIGHT,
          },
          children: rootPositions.map(p => buildPositionSubtree(p.id)),
        };
      }
      
      const h = d3.hierarchy(rootNode);
      let maxNodeHeight = MANAGER_NODE_HEIGHT;
      h.each(node => {
        if (node.data.data.nodeHeight > maxNodeHeight) maxNodeHeight = node.data.data.nodeHeight;
      });
      const treeLayout = d3.tree<TreeNode>()
        .nodeSize([NODE_WIDTH + HORIZONTAL_GAP, (maxNodeHeight + VERTICAL_GAP) / 2])
        .separation(() => 1);
      const tree = treeLayout(h);

      // Apply tier-based vertical offsets — higher tiers push a node down within its sibling group
      const tierStep = maxNodeHeight + VERTICAL_GAP * 6;
      tree.descendants().forEach(node => {
        const nodeTier = node.data.data.tier || 1;
        if (nodeTier > 1) {
          node.y += (nodeTier - 1) * tierStep;
        }
      });

      const nodes = tree.descendants();
      const minX = Math.min(...nodes.map(n => n.x));
      const maxX = Math.max(...nodes.map(n => n.x));
      const maxY = Math.max(...nodes.map(n => n.y + n.data.data.nodeHeight));
      const padding = 30;
      return {
        treeData: tree,
        dimensions: {
          width: maxX - minX + NODE_WIDTH + padding * 2,
          height: maxY + padding * 2,
          offsetX: -minX + NODE_WIDTH / 2 + padding,
        },
      };
    }

    // ===== LEGACY MANAGER-BASED ORG CHART =====
    const roots = activeUsers.filter(u => !u.managerId || !userMap.has(u.managerId));

    const buildSubtree = (userId: string, visited = new Set<string>()): TreeNode | null => {
      if (visited.has(userId)) return null;
      visited.add(userId);
      
      const user = userMap.get(userId);
      if (!user) return null;
      
      const directReports = activeUsers.filter(u => u.managerId === userId);
      const managerReports = directReports.filter(u => u.role === 'manager');
      const workerReports = directReports.filter(u => u.role === 'worker');
      
      const managersByDept = new Map<string, User[]>();
      managerReports.forEach(m => {
        const dept = m.department || 'Unassigned';
        if (!managersByDept.has(dept)) managersByDept.set(dept, []);
        managersByDept.get(dept)!.push(m);
      });
      
      const soloManagers: User[] = [];
      const groupedManagerDepts = new Map<string, User[]>();
      
      managersByDept.forEach((managers, dept) => {
        if (managers.length > 1) {
          groupedManagerDepts.set(dept, managers);
        } else {
          soloManagers.push(managers[0]);
        }
      });
      
      const managerChildren = soloManagers
        .sort((a, b) => (a.department || '').localeCompare(b.department || ''))
        .map(u => buildSubtree(u.id, new Set(visited)))
        .filter((n): n is TreeNode => n !== null);
      
      const groupedManagerChildren: TreeNode[] = Array.from(groupedManagerDepts.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dept, managers]) => {
          const managerIds = new Set(managers.map(m => m.id));
          const managerEntries: WorkerData[] = managers
            .sort((a, b) => `${a.firstName} ${a.surname}`.localeCompare(`${b.firstName} ${b.surname}`))
            .map(m => {
              visited.add(m.id);
              return {
                id: m.id,
                name: `${m.firstName} ${m.surname}`,
                photoUrl: m.photoUrl,
                isManager: true,
              };
            });
          
          const mgrNodeHeight = DEPT_HEADER_HEIGHT + managerEntries.length * WORKER_ROW_HEIGHT + 4;
          
          const sharedWorkers = activeUsers.filter(u => 
            u.role === 'worker' && 
            managerIds.has(u.managerId || '')
          );
          
          const workerChildren: TreeNode[] = [];
          if (sharedWorkers.length > 0) {
            const workerEntries: WorkerData[] = sharedWorkers
              .sort((a, b) => `${a.firstName} ${a.surname}`.localeCompare(`${b.firstName} ${b.surname}`))
              .map(w => ({
                id: w.id,
                name: `${w.firstName} ${w.surname}`,
                photoUrl: w.photoUrl,
              }));
            const wNodeHeight = DEPT_HEADER_HEIGHT + workerEntries.length * WORKER_ROW_HEIGHT + 4;
            workerChildren.push({
              data: {
                id: `dept-workers-${userId}-${dept}`,
                name: `${dept} Workers`,
                role: 'worker',
                department: dept,
                photoUrl: null,
                kind: 'department-group' as const,
                workers: workerEntries,
                nodeHeight: wNodeHeight,
              },
              children: [],
            });
          }
          
          return {
            data: {
              id: `dept-group-${userId}-${dept}`,
              name: dept,
              role: 'worker',
              department: dept,
              photoUrl: null,
              kind: 'department-group' as const,
              workers: managerEntries,
              nodeHeight: mgrNodeHeight,
            },
            children: workerChildren,
          };
        });
      
      const workersByDept = new Map<string, User[]>();
      workerReports.forEach(w => {
        const dept = w.department || 'Unassigned';
        if (!workersByDept.has(dept)) workersByDept.set(dept, []);
        workersByDept.get(dept)!.push(w);
      });
      
      const deptGroupChildren: TreeNode[] = Array.from(workersByDept.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dept, workers]) => {
          const nodeHeight = DEPT_HEADER_HEIGHT + workers.length * WORKER_ROW_HEIGHT + 4;
          return {
            data: {
              id: `dept-${userId}-${dept}`,
              name: dept,
              role: 'worker',
              department: dept,
              photoUrl: null,
              kind: 'department-group' as const,
              workers: workers.map(w => ({
                id: w.id,
                name: `${w.firstName} ${w.surname}`,
                photoUrl: w.photoUrl,
              })),
              nodeHeight,
            },
            children: [],
          };
        });
      
      const children = [...managerChildren, ...groupedManagerChildren, ...deptGroupChildren];
      
      return {
        data: {
          id: user.id,
          userId: user.id,
          name: `${user.firstName} ${user.surname}`,
          role: user.role,
          department: user.department,
          photoUrl: user.photoUrl,
          kind: 'manager' as const,
          nodeHeight: MANAGER_NODE_HEIGHT,
        },
        children,
      };
    };

    let rootNode: TreeNode;
    
    if (roots.length === 0) {
      return { treeData: null, dimensions: { width: 800, height: 400, offsetX: 0 } };
    } else if (roots.length === 1) {
      const tree = buildSubtree(roots[0].id);
      if (!tree) return { treeData: null, dimensions: { width: 800, height: 400, offsetX: 0 } };
      tree.data.isRoot = true;
      rootNode = tree;
    } else {
      const managerRoots = roots.filter(r => r.role === 'manager').sort((a, b) => (a.department || '').localeCompare(b.department || ''));
      const workerRoots = roots.filter(r => r.role === 'worker').sort((a, b) => (a.department || '').localeCompare(b.department || ''));
      const sortedRoots = [...managerRoots, ...workerRoots];
      
      rootNode = {
        data: {
          id: 'company',
          name: 'AEC Electronics',
          role: 'manager',
          department: 'Managing Director',
          photoUrl: null,
          isRoot: true,
          kind: 'manager',
          nodeHeight: MANAGER_NODE_HEIGHT,
        },
        children: sortedRoots
          .map(r => buildSubtree(r.id))
          .filter((n): n is TreeNode => n !== null),
      };
    }

    const h = d3.hierarchy(rootNode);
    
    // Find max node height across all nodes
    let maxNodeHeight = MANAGER_NODE_HEIGHT;
    h.each(node => {
      if (node.data.data.nodeHeight > maxNodeHeight) {
        maxNodeHeight = node.data.data.nodeHeight;
      }
    });
    
    const treeLayout = d3.tree<TreeNode>()
      .nodeSize([NODE_WIDTH + HORIZONTAL_GAP, (maxNodeHeight + VERTICAL_GAP) / 2])
      .separation((a, b) => {
        if (a.parent === b.parent) return 1;
        return 1;
      });
    
    const tree = treeLayout(h);
    
    const nodes = tree.descendants();
    const minX = Math.min(...nodes.map(n => n.x));
    const maxX = Math.max(...nodes.map(n => n.x));
    const maxY = Math.max(...nodes.map(n => n.y + n.data.data.nodeHeight));
    
    const padding = 30;
    const width = maxX - minX + NODE_WIDTH + padding * 2;
    const height = maxY + padding * 2;
    const offsetX = -minX + NODE_WIDTH / 2 + padding;
    
    return {
      treeData: tree,
      dimensions: { width, height, offsetX },
    };
    } catch (err) {
      console.error('OrgChart tree computation error:', err);
      return { treeData: null, dimensions: { width: 800, height: 400, offsetX: 0 } };
    }
  }, [activeUsers, orgPositions]);

  const unassignedEmployees = useMemo(() => {
    if (orgPositions.length === 0) return [];
    const positionIds = new Set(orgPositions.map(p => p.id));
    const managerIds = new Set(activeUsers.map(u => u.id));
    return activeUsers.filter(u => {
      const hasPosition = u.orgPositionId && positionIds.has(u.orgPositionId);
      const hasManager = u.managerId && managerIds.has(u.managerId);
      return !hasPosition && !hasManager;
    });
  }, [activeUsers, orgPositions]);

  const totalManagers = activeUsers.filter(u => u.role === 'manager').length;
  const totalWorkers = activeUsers.filter(u => u.role === 'worker').length;

  const uniqueDepartments = useMemo(() => {
    const depts = new Set<string>();
    activeUsers.forEach(u => {
      if (u.department) depts.add(u.department);
    });
    return Array.from(depts).sort();
  }, [activeUsers]);

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.2, 2));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.2, 0.4));
  const handleZoomReset = () => setZoom(1);
  const handleFitToWindow = () => {
    if (!containerRef.current || !dimensions.width || !dimensions.height) return;
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    const scaleX = containerWidth / dimensions.width;
    const scaleY = containerHeight / dimensions.height;
    const fitScale = Math.min(scaleX, scaleY, 2);
    setZoom(Math.max(0.4, Math.min(fitScale, 2)));
  };

  if (!user || user.role !== 'manager') {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold text-slate-900">Organization Chart</h1>
          <p className="text-muted-foreground">Managers with department-grouped teams</p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="gap-1">
            <Crown className="h-3 w-3" /> {totalManagers} Managers
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <Briefcase className="h-3 w-3" /> {totalWorkers} Workers
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Building2 className="h-3 w-3" /> {departments.length} Departments
          </Badge>
        </div>
      </div>

      <div>
        {isLoading ? (
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 justify-center">
                <Skeleton className="h-24 w-48" />
                <Skeleton className="h-24 w-48" />
                <Skeleton className="h-24 w-48" />
              </div>
            </CardContent>
          </Card>
        ) : isError ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-lg font-medium text-destructive">Failed to load org chart data</p>
              <p className="text-sm text-muted-foreground mt-1">Please refresh the page to try again</p>
            </CardContent>
          </Card>
        ) : treeData ? (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    AEC Electronics - Workforce Structure
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Managers shown individually; workers grouped by department
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleZoomOut}
                    disabled={zoom <= 0.4}
                    data-testid="button-zoom-out"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium w-12 text-center">{Math.round(zoom * 100)}%</span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleZoomIn}
                    disabled={zoom >= 2}
                    data-testid="button-zoom-in"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleZoomReset}
                    data-testid="button-zoom-reset"
                    title="Reset zoom"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleFitToWindow}
                    data-testid="button-fit-to-window"
                    title="Fit to window"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                  <div className="h-6 w-px bg-slate-200 mx-1" />
                  <Button 
                    variant={showAttendance ? "default" : "outline"} 
                    size="sm" 
                    onClick={() => setShowAttendance(!showAttendance)}
                    className={showAttendance ? "bg-green-600 hover:bg-green-700" : ""}
                    data-testid="button-show-attendance"
                  >
                    {showAttendance ? (
                      <EyeOff className="h-4 w-4 mr-2" />
                    ) : (
                      <Eye className="h-4 w-4 mr-2" />
                    )}
                    {showAttendance ? "Hide Attendance" : "Show Attendance"}
                  </Button>
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={handleExportPDF}
                    disabled={isExporting}
                    data-testid="button-export-pdf"
                  >
                    {isExporting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    Export PDF
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {uniqueDepartments.map(dept => (
                  <div key={dept} className="flex items-center gap-1">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: getDepartmentColor(dept) }}
                    />
                    <span className="text-xs text-muted-foreground">{dept}</span>
                  </div>
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div 
                ref={containerRef}
                className="overflow-auto border-t"
                style={{ maxHeight: 'calc(100vh - 300px)' }}
              >
                <svg 
                  ref={svgRef}
                  width={dimensions.width * zoom} 
                  height={dimensions.height * zoom}
                  className="min-w-full"
                  style={{ minHeight: '400px', backgroundColor: '#ffffff' }}
                >
                  <g transform={`scale(${zoom}) translate(${dimensions.offsetX || 0}, 30)`}>
                    {treeData.links().map((link, i) => (
                      <Connector
                        key={i}
                        source={{ x: link.source.x, y: link.source.y }}
                        target={{ x: link.target.x, y: link.target.y }}
                        sourceHeight={link.source.data.data.nodeHeight}
                        targetTier={link.target.data.data.tier || 1}
                      />
                    ))}
                    
                    {treeData.descendants().map((node) => (
                      <OrgNode
                        key={node.data.data.id}
                        data={node.data.data}
                        x={node.x}
                        y={node.y}
                        showAttendance={showAttendance}
                        clockedInUserIds={clockedInUserIds}
                      />
                    ))}
                  </g>
                </svg>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No employees found</p>
              <p className="text-sm text-muted-foreground">Add employees to see the organization chart</p>
            </CardContent>
          </Card>
        )}

        {unassignedEmployees.length > 0 && (
          <Card className="mt-4 border-amber-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-amber-700 flex items-center gap-2">
                <UserIcon className="h-4 w-4" />
                {unassignedEmployees.length} employee{unassignedEmployees.length !== 1 ? 's' : ''} not assigned to a position
              </CardTitle>
              <p className="text-xs text-muted-foreground">These employees will not appear in the org chart until assigned to a position in Personnel.</p>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {unassignedEmployees.map(u => (
                  <div key={u.id} className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded px-2 py-1 text-xs text-amber-800">
                    <span className="font-medium">{u.firstName} {u.surname}</span>
                    {u.department && <span className="text-amber-600">({u.department})</span>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
