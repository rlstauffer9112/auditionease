import React, { useState, useEffect } from 'react';
import {
  Users,
  Calendar,
  ClipboardList,
  Plus,
  UserPlus,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Music,
  Mic2,
  Trophy,
  Search,
  Loader2,
  Settings,
  ChevronDown,
  ChevronUp,
  Pencil,
  Mail,
  Trash2,
  Undo2,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthPage } from './components/AuthPage';
import { VerifyPage } from './components/VerifyPage';
import { LandingPage } from './components/LandingPage';
import { InvitePage } from './components/InvitePage';
import { Link2, Copy, Check, FileBarChart, Play, Filter, Download } from 'lucide-react';
import { LogOut } from 'lucide-react';

// --- Types ---
interface CustomFieldValue {
  id: number;
  customAttributeId: number;
  value: string;
  updatedAt: string;
}

interface AuditionUser {
  auditionUserId: number;
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  notes: string;
  customFieldValues: CustomFieldValue[];
}

interface CustomAttribute {
  id: number;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multiselect';
  options: string; // JSON string
  required: boolean;
  order: number;
}

interface Audition {
  id: number;
  title: string;
  description: string;
  date: string;
  location: string;
  status: 'open' | 'closed' | 'completed';
  inviteCode: string;
  createdAt: string;
  userCount: number;
  openSlots: number;
  filledSlots: number;
}

interface AuditionSlot {
  id: number;
  auditionId: number;
  userId: number | null;
  date: string;
  startTime: string;
  endTime: string;
  status: 'available' | 'booked' | 'completed' | 'no-show' | 'closed';
  score: number | null;
  feedback: string | null;
  passedToCallback: boolean;
}

interface Callback {
  id: number;
  auditionId: number;
  userId: number;
  scheduledTime: string;
  notes: string;
  finalDecision: 'accepted' | 'rejected' | 'pending';
}

interface ReportCriterion {
  field: string;
  operator: string;
  value: string;
  logicOp?: 'AND' | 'OR';
}

interface ReportColumn {
  field: string;
  label: string;
}

interface ReportTemplate {
  id: number;
  name: string;
  criteria: ReportCriterion[];
  columns: ReportColumn[];
  createdAt: string;
  updatedAt: string;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function parseOptions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try { const arr = JSON.parse(trimmed); if (Array.isArray(arr)) return arr.map(String); } catch { /* fall through */ }
  }
  return trimmed.split(',').map(o => o.trim()).filter(Boolean);
}

const UNAMBIGUOUS_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateInviteCode(): string {
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => UNAMBIGUOUS_CHARS[b % UNAMBIGUOUS_CHARS.length]).join('');
}

function AppContent() {
  const { user, loading: authLoading, logout } = useAuth();
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [activeTab, setActiveTab] = useState<'auditions' | 'vocalists' | 'callbacks' | 'reports' | 'settings'>('auditions');
  const [auditions, setAuditions] = useState<Audition[]>([]);
  const [customAttributes, setCustomAttributes] = useState<CustomAttribute[]>([]);
  const [selectedAudition, setSelectedAudition] = useState<Audition | null>(null);
  const [slots, setSlots] = useState<AuditionSlot[]>([]);
  const [auditionUsersMap, setAuditionUsersMap] = useState<Map<number, AuditionUser[]>>(new Map());
  const [loading, setLoading] = useState(true);

  // Form states
  const [showAddAudition, setShowAddAudition] = useState(false);
  const [editingAudition, setEditingAudition] = useState<Audition | null>(null);
  const [auditionSort, setAuditionSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });
  const [showGenerateSlots, setShowGenerateSlots] = useState(false);
  const [slotConfig, setSlotConfig] = useState({ date: '', startTime: '09:00', endTime: '17:00', duration: 15, padding: 0 });
  const [newAudition, setNewAudition] = useState({ title: '', description: '', date: '', location: '', inviteCode: '', status: 'open' as string });

  // Settings states
  const [setupTab, setSetupTab] = useState<'general' | 'attributes'>('general');
  const [newAttr, setNewAttr] = useState({ label: '', type: 'text' as any, options: '', required: false });

  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  const [showUserDetails, setShowUserDetails] = useState<AuditionUser | null>(null);
  const [editingUserDetails, setEditingUserDetails] = useState(false);
  const [editUserForm, setEditUserForm] = useState<{ firstName: string; lastName: string; phone: string; customFieldValues: { customAttributeId: number; value: string }[] }>({ firstName: '', lastName: '', phone: '', customFieldValues: [] });
  const [savingUserDetails, setSavingUserDetails] = useState(false);
  const [vocalistSearch, setVocalistSearch] = useState('');
  const [evaluatingSlotId, setEvaluatingSlotId] = useState<number | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [evalScore, setEvalScore] = useState('');
  const [evalFeedback, setEvalFeedback] = useState('');
  const [evalPass, setEvalPass] = useState(false);

  // Vocalists tab state
  const [vocalistAuditionId, setVocalistAuditionId] = useState<number | null>(null);
  const [vocalistUsers, setVocalistUsers] = useState<AuditionUser[]>([]);

  // Callback states
  const [callbacksData, setCallbacksData] = useState<Callback[]>([]);
  const [callbackAuditionId, setCallbackAuditionId] = useState<number | null>(null);
  const [callbackSlots, setCallbackSlots] = useState<AuditionSlot[]>([]);
  const [callbackUsers, setCallbackUsers] = useState<AuditionUser[]>([]);
  const [showScheduleCallback, setShowScheduleCallback] = useState<Callback | null>(null);
  const [scheduleDateTime, setScheduleDateTime] = useState('');

  // Report states
  const [reportsList, setReportsList] = useState<ReportTemplate[]>([]);
  const [reportView, setReportView] = useState<'list' | 'builder' | 'results'>('list');
  const [editingReportId, setEditingReportId] = useState<number | null>(null);
  const [reportName, setReportName] = useState('');
  const [reportCriteria, setReportCriteria] = useState<ReportCriterion[]>([]);
  const [reportColumns, setReportColumns] = useState<ReportColumn[]>([]);
  const [reportResults, setReportResults] = useState<{ reportName: string; columns: ReportColumn[]; rows: Record<string, any>[] } | null>(null);
  const [runningReportId, setRunningReportId] = useState<number | null>(null);

  const navigateToLogin = () => {
    window.history.pushState({}, '', '/login');
    setCurrentPath('/login');
  };

  const navigateToHome = () => {
    window.history.pushState({}, '', '/');
    setCurrentPath('/');
  };

  const authFetch = (url: string, opts: RequestInit = {}) => {
    const token = localStorage.getItem('sessionToken');
    return fetch(url, {
      ...opts,
      headers: {
        ...opts.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  };

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f0]">
        <Loader2 className="w-8 h-8 text-[#5A5A40] animate-spin" />
      </div>
    );
  }

  if (currentPath === '/verify') {
    return <VerifyPage />;
  }

  const inviteMatch = currentPath.match(/^\/invite\/([^/]+)$/);
  if (inviteMatch) {
    return <InvitePage inviteCode={inviteMatch[1]} />;
  }

  if (!user) {
    if (currentPath === '/login') {
      return <AuthPage onBack={navigateToHome} />;
    }
    return <LandingPage onGetStarted={navigateToLogin} />;
  }

  async function fetchData() {
    setLoading(true);
    try {
      const [audRes, attrRes, repRes] = await Promise.all([
        authFetch('/api/auditions'),
        authFetch('/api/custom-attributes'),
        authFetch('/api/reports')
      ]);
      const audData = await audRes.json();
      const attrData = await attrRes.json();
      const repData = await repRes.json();
      setAuditions(audData);
      setCustomAttributes(attrData);
      setReportsList(repData.map((r: any) => ({
        ...r,
        criteria: JSON.parse(r.criteria || '[]'),
        columns: JSON.parse(r.columns || '[]'),
      })));
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAuditionUsers(auditionId: number): Promise<AuditionUser[]> {
    try {
      const res = await authFetch(`/api/auditions/${auditionId}/users`);
      const data = await res.json();
      setAuditionUsersMap(prev => new Map(prev).set(auditionId, data));
      return data;
    } catch (err) {
      console.error('Error fetching audition users:', err);
      return [];
    }
  }

  async function fetchSlots(auditionId: number) {
    try {
      const res = await authFetch(`/api/auditions/${auditionId}/slots`);
      const data = await res.json();
      setSlots(data);
    } catch (err) {
      console.error('Error fetching slots:', err);
    }
  }

  const handleAddAudition = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await authFetch('/api/auditions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAudition)
      });
      if (res.ok) {
        fetchData();
        setShowAddAudition(false);
        setNewAudition({ title: '', description: '', date: '', location: '', inviteCode: '', status: 'open' });
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create audition');
      }
    } catch (err) {
      console.error('Error adding audition:', err);
    }
  };

  const handleEditAudition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAudition) return;
    try {
      const res = await authFetch(`/api/auditions/${editingAudition.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAudition)
      });
      if (res.ok) {
        const updated = await res.json();
        fetchData();
        if (selectedAudition?.id === editingAudition.id) {
          setSelectedAudition(updated);
        }
        setEditingAudition(null);
        setShowAddAudition(false);
        setNewAudition({ title: '', description: '', date: '', location: '', inviteCode: '', status: 'open' });
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update audition');
      }
    } catch (err) {
      console.error('Error updating audition:', err);
    }
  };

  const handleAddAttribute = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...newAttr,
        options: (newAttr.type === 'select' || newAttr.type === 'multiselect')
          ? JSON.stringify(newAttr.options.split(',').map(o => o.trim()).filter(Boolean))
          : newAttr.options,
      };
      const res = await authFetch('/api/custom-attributes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        fetchData();
        setNewAttr({ label: '', type: 'text', options: '', required: false });
      }
    } catch (err) {
      console.error('Error adding attribute:', err);
    }
  };

  const handleDeleteAttribute = async (id: number) => {
    if (!confirm('Are you sure? This will not delete existing data but will remove the field from future forms.')) return;
    try {
      const res = await authFetch(`/api/custom-attributes/${id}`, { method: 'DELETE' });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Error deleting attribute:', err);
    }
  };

  const handleReorderAttribute = async (id: number, direction: 'up' | 'down') => {
    const idx = customAttributes.findIndex(a => a.id === id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= customAttributes.length) return;
    const reordered = [...customAttributes];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    setCustomAttributes(reordered);
    try {
      await authFetch('/api/custom-attributes/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: reordered.map(a => a.id) })
      });
    } catch (err) {
      console.error('Error reordering attributes:', err);
      fetchData();
    }
  };

  const handleSelectAudition = (audition: Audition) => {
    setSelectedAudition(audition);
    fetchSlots(audition.id);
    fetchAuditionUsers(audition.id);
  };

  const currentAuditionUsers = selectedAudition ? (auditionUsersMap.get(selectedAudition.id) || []) : [];

  const handleBookSlot = async (slotId: number, userId: number) => {
    try {
      const res = await authFetch(`/api/slots/${slotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, status: 'booked' })
      });
      if (res.ok && selectedAudition) {
        fetchSlots(selectedAudition.id);
      }
    } catch (err) {
      console.error('Error booking slot:', err);
    }
  };

  const handleCompleteAudition = async (slotId: number, score: number, feedback: string, passedToCallback: boolean) => {
    try {
      const res = await authFetch(`/api/slots/${slotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, feedback, passedToCallback, status: 'completed' })
      });
      if (res.ok && selectedAudition) {
        fetchSlots(selectedAudition.id);
        if (passedToCallback) {
          const slot = slots.find(s => s.id === slotId);
          if (slot && slot.userId) {
            await authFetch('/api/callbacks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                auditionId: selectedAudition.id,
                userId: slot.userId,
                notes: `Passed from initial audition. Feedback: ${feedback}`
              })
            });
          }
        }
      }
    } catch (err) {
      console.error('Error completing audition:', err);
    }
  };

  const fetchCallbacksForAudition = async (auditionId: number) => {
    try {
      const [cbRes, slotRes] = await Promise.all([
        authFetch(`/api/auditions/${auditionId}/callbacks`),
        authFetch(`/api/auditions/${auditionId}/slots`)
      ]);
      const cbData = await cbRes.json();
      const slotData = await slotRes.json();
      setCallbacksData(cbData);
      setCallbackSlots(slotData);
      const auUsers = await fetchAuditionUsers(auditionId);
      setCallbackUsers(auUsers);
    } catch (err) {
      console.error('Error fetching callbacks:', err);
    }
  };

  const handleSelectCallbackAudition = (auditionId: number) => {
    setCallbackAuditionId(auditionId);
    fetchCallbacksForAudition(auditionId);
  };

  const handleSelectVocalistAudition = (auditionId: number) => {
    setVocalistAuditionId(auditionId);
    fetchAuditionUsers(auditionId).then(data => setVocalistUsers(data));
  };

  const handleUpdateCallback = async (id: number, updates: Partial<Callback>) => {
    try {
      await authFetch(`/api/callbacks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (callbackAuditionId) fetchCallbacksForAudition(callbackAuditionId);
    } catch (err) {
      console.error('Error updating callback:', err);
    }
  };

  const handleDeleteCallback = async (id: number) => {
    if (!confirm('Remove this applicant from callbacks?')) return;
    try {
      await authFetch(`/api/callbacks/${id}`, { method: 'DELETE' });
      if (callbackAuditionId) fetchCallbacksForAudition(callbackAuditionId);
    } catch (err) {
      console.error('Error deleting callback:', err);
    }
  };

  const handleNotifyCallback = async (id: number) => {
    try {
      const res = await authFetch(`/api/callbacks/${id}/notify`, { method: 'POST' });
      const data = await res.json();
      alert(data.message || 'Notification sent');
    } catch (err) {
      console.error('Error sending notification:', err);
    }
  };

  const getScoreForCallback = (cb: Callback): number | null => {
    const slot = callbackSlots.find(s => s.userId === cb.userId && s.status === 'completed');
    return slot?.score ?? null;
  };

  const filteredVocalists = vocalistUsers.filter(u => {
    if (!vocalistSearch.trim()) return true;
    const q = vocalistSearch.trim().toLowerCase();
    return u.firstName.toLowerCase().startsWith(q) ||
           u.lastName.toLowerCase().startsWith(q) ||
           u.email.toLowerCase().startsWith(q);
  });

  // --- Reports helpers ---
  const availableFields: { field: string; label: string; type: string; options?: string }[] = [
    { field: 'firstName', label: 'First Name', type: 'text' },
    { field: 'lastName', label: 'Last Name', type: 'text' },
    { field: 'email', label: 'Email', type: 'text' },
    { field: 'phone', label: 'Phone', type: 'text' },
    { field: 'auditionTitle', label: 'Audition', type: 'text' },
    { field: 'auditionDate', label: 'Audition Date', type: 'date' },
    { field: 'score', label: 'Score', type: 'number' },
    { field: 'feedback', label: 'Feedback', type: 'text' },
    { field: 'passedToCallback', label: 'Passed to Callback', type: 'boolean' },
    ...customAttributes.map(attr => ({
      field: `custom:${attr.id}`,
      label: attr.label,
      type: attr.type as string,
      options: attr.options || undefined,
    })),
  ];

  const getOperatorsForType = (type: string) => {
    const common = [
      { value: 'is_empty', label: 'is empty' },
      { value: 'is_not_empty', label: 'is not empty' },
    ];
    switch (type) {
      case 'number':
        return [
          { value: 'equals', label: 'equals' },
          { value: 'not_equals', label: 'does not equal' },
          { value: 'greater_than', label: 'greater than' },
          { value: 'less_than', label: 'less than' },
          { value: 'greater_equal', label: 'at least' },
          { value: 'less_equal', label: 'at most' },
          ...common,
        ];
      case 'date':
        return [
          { value: 'equals', label: 'equals' },
          { value: 'not_equals', label: 'does not equal' },
          { value: 'before', label: 'is before' },
          { value: 'after', label: 'is after' },
          ...common,
        ];
      case 'boolean':
        return [{ value: 'equals', label: 'equals' }];
      case 'select':
        return [
          { value: 'equals', label: 'equals' },
          { value: 'not_equals', label: 'does not equal' },
          ...common,
        ];
      case 'multiselect':
        return [
          { value: 'contains', label: 'includes' },
          { value: 'not_contains', label: 'does not include' },
          ...common,
        ];
      default:
        return [
          { value: 'equals', label: 'equals' },
          { value: 'not_equals', label: 'does not equal' },
          { value: 'contains', label: 'contains' },
          { value: 'not_contains', label: 'does not contain' },
          { value: 'starts_with', label: 'starts with' },
          { value: 'ends_with', label: 'ends with' },
          ...common,
        ];
    }
  };

  async function fetchReports() {
    try {
      const res = await authFetch('/api/reports');
      const data = await res.json();
      setReportsList(data.map((r: any) => ({
        ...r,
        criteria: JSON.parse(r.criteria || '[]'),
        columns: JSON.parse(r.columns || '[]'),
      })));
    } catch (err) {
      console.error('Error fetching reports:', err);
    }
  }

  async function handleSaveReport() {
    if (!reportName.trim() || reportColumns.length === 0) return;
    try {
      const body = {
        name: reportName.trim(),
        criteria: JSON.stringify(reportCriteria),
        columns: JSON.stringify(reportColumns),
      };
      if (editingReportId) {
        await authFetch(`/api/reports/${editingReportId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        await authFetch('/api/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      await fetchReports();
      setReportView('list');
    } catch (err) {
      console.error('Error saving report:', err);
    }
  }

  async function handleDeleteReport(id: number) {
    if (!confirm('Delete this report?')) return;
    try {
      await authFetch(`/api/reports/${id}`, { method: 'DELETE' });
      await fetchReports();
    } catch (err) {
      console.error('Error deleting report:', err);
    }
  }

  async function handleRunReport(id: number) {
    try {
      setRunningReportId(id);
      const res = await authFetch(`/api/reports/${id}/run`, { method: 'POST' });
      const data = await res.json();
      const report = reportsList.find(r => r.id === id);
      setReportResults({ reportName: report?.name || 'Report', columns: data.columns, rows: data.rows });
      setReportView('results');
    } catch (err) {
      console.error('Error running report:', err);
    }
  }

  const renderCriterionValue = (criterion: ReportCriterion, idx: number) => {
    if (['is_empty', 'is_not_empty'].includes(criterion.operator)) return null;
    const fieldDef = availableFields.find(f => f.field === criterion.field);
    const fieldType = fieldDef?.type || 'text';
    const updateValue = (val: string) => {
      const u = [...reportCriteria];
      u[idx] = { ...u[idx], value: val };
      setReportCriteria(u);
    };
    if (fieldType === 'boolean') {
      return (
        <select value={criterion.value || 'true'} onChange={e => updateValue(e.target.value)}
          className="w-32 border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm bg-white">
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    }
    if ((fieldType === 'select' || fieldType === 'multiselect') && fieldDef?.options) {
      const opts = parseOptions(fieldDef.options);
      return (
        <select value={criterion.value} onChange={e => updateValue(e.target.value)}
          className="flex-1 min-w-[120px] border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Select...</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (fieldType === 'number') {
      return (
        <input type="number" value={criterion.value} onChange={e => updateValue(e.target.value)}
          className="w-32 border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm" placeholder="Value" />
      );
    }
    if (fieldType === 'date') {
      return (
        <input type="date" value={criterion.value} onChange={e => updateValue(e.target.value)}
          className="w-40 border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm" />
      );
    }
    return (
      <input type="text" value={criterion.value} onChange={e => updateValue(e.target.value)}
        className="flex-1 min-w-[120px] border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm" placeholder="Value" />
    );
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 h-full w-64 bg-white border-r border-[#E5E7EB] p-6 flex flex-col gap-8 z-10">
        <a href="/" onClick={(e) => { e.preventDefault(); setSelectedAudition(null); setActiveTab('auditions'); }} className="flex items-center gap-3 px-2 cursor-pointer hover:opacity-80 transition-opacity">
          <div className="w-10 h-10 bg-[#4F46E5] rounded-xl flex items-center justify-center text-white">
            <Music size={24} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">AuditionEase</h1>
        </a>

        <nav className="flex flex-col gap-2">
          <button
            onClick={() => setActiveTab('auditions')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'auditions' ? 'bg-[#4F46E5] text-white shadow-lg shadow-indigo-100' : 'text-[#6B7280] hover:bg-[#F3F4F6]'}`}
          >
            <Calendar size={20} />
            <span className="font-medium">Auditions</span>
          </button>
          <button
            onClick={() => setActiveTab('vocalists')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'vocalists' ? 'bg-[#4F46E5] text-white shadow-lg shadow-indigo-100' : 'text-[#6B7280] hover:bg-[#F3F4F6]'}`}
          >
            <Users size={20} />
            <span className="font-medium">Applicants</span>
          </button>
          <button
            onClick={() => setActiveTab('callbacks')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'callbacks' ? 'bg-[#4F46E5] text-white shadow-lg shadow-indigo-100' : 'text-[#6B7280] hover:bg-[#F3F4F6]'}`}
          >
            <Trophy size={20} />
            <span className="font-medium">Sections</span>
          </button>
          <button
            onClick={() => { setActiveTab('reports'); setReportView('list'); }}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'reports' ? 'bg-[#4F46E5] text-white shadow-lg shadow-indigo-100' : 'text-[#6B7280] hover:bg-[#F3F4F6]'}`}
          >
            <FileBarChart size={20} />
            <span className="font-medium">Reports</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-[#4F46E5] text-white shadow-lg shadow-indigo-100' : 'text-[#6B7280] hover:bg-[#F3F4F6]'}`}
          >
            <ClipboardList size={20} />
            <span className="font-medium">Setup</span>
          </button>
        </nav>

        <div className="mt-auto space-y-4">
          <div className="p-4 bg-[#F3F4F6] rounded-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-[#4F46E5] rounded-full flex items-center justify-center text-white text-xs font-bold">
                {user.firstName.charAt(0)}
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-bold truncate">{user.firstName} {user.lastName}</p>
                <p className="text-[10px] text-[#6B7280] truncate">{user.email}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut size={14} />
              Sign Out
            </button>
          </div>

        </div>
      </div>

      {/* Main Content */}
      <main className="ml-64 p-10">
        <AnimatePresence mode="wait">
          {activeTab === 'auditions' && (
            <motion.div
              key="auditions"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-5xl mx-auto"
            >
              <div className="flex justify-between items-center mb-10">
                <div>
                  <h2 className="text-3xl font-extrabold tracking-tight mb-2">Choir Auditions</h2>
                  <p className="text-[#6B7280]">Schedule slots, track applicants, and manage section placement.</p>
                </div>
                <button
                  onClick={() => { setNewAudition({ title: '', description: '', date: '', location: '', inviteCode: generateInviteCode(), status: 'open' }); setEditingAudition(null); setShowAddAudition(true); }}
                  className="bg-[#4F46E5] text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-[#4338CA] transition-colors shadow-lg shadow-indigo-100"
                >
                  <Plus size={20} />
                  New Audition
                </button>
              </div>

              {!selectedAudition ? (
                <div className="bg-white rounded-3xl border border-[#E5E7EB] shadow-sm overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#E5E7EB] text-left text-sm font-bold text-[#374151]">
                        {([
                          { key: 'title', label: 'Title' },
                          { key: 'status', label: 'Status' },
                          { key: 'date', label: 'Start Date' },
                          { key: 'openSlots', label: 'Open Slots' },
                          { key: 'filledSlots', label: 'Filled Slots' },
                          { key: 'userCount', label: 'Applicants' },
                          { key: 'createdAt', label: 'Created' },
                        ] as const).map(col => (
                          <th
                            key={col.key}
                            onClick={() => setAuditionSort(prev => ({ key: col.key, dir: prev.key === col.key && prev.dir === 'asc' ? 'desc' : 'asc' }))}
                            className="px-5 py-4 cursor-pointer select-none hover:bg-[#F9FAFB] transition-colors"
                          >
                            <div className="flex items-center gap-1.5">
                              {col.label}
                              {auditionSort.key === col.key ? (
                                auditionSort.dir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                              ) : (
                                <ChevronDown size={14} className="opacity-0 group-hover:opacity-30" />
                              )}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...auditions].sort((a, b) => {
                        const { key, dir } = auditionSort;
                        let av: any, bv: any;
                        if (key === 'userCount' || key === 'openSlots' || key === 'filledSlots') { av = (a as any)[key]; bv = (b as any)[key]; }
                        else if (key === 'createdAt') { av = a.createdAt; bv = b.createdAt; }
                        else { av = (a as any)[key] ?? ''; bv = (b as any)[key] ?? ''; }
                        if (typeof av === 'string') av = av.toLowerCase();
                        if (typeof bv === 'string') bv = bv.toLowerCase();
                        if (av < bv) return dir === 'asc' ? -1 : 1;
                        if (av > bv) return dir === 'asc' ? 1 : -1;
                        return 0;
                      }).map(audition => (
                        <tr
                          key={audition.id}
                          onClick={() => handleSelectAudition(audition)}
                          className="border-b border-[#F3F4F6] last:border-b-0 hover:bg-[#F9FAFB] cursor-pointer transition-colors"
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-[#EEF2FF] text-[#4F46E5] rounded-xl flex-shrink-0">
                                <Mic2 size={16} />
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-[#111827] truncate">{audition.title}</div>
                                <div className="flex items-center gap-1.5 mt-0.5" onClick={e => e.stopPropagation()}>
                                  <Link2 size={10} className="text-[#4F46E5] flex-shrink-0" />
                                  <span className="text-xs font-mono text-[#4F46E5] truncate">{audition.inviteCode}</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(`${window.location.origin}/invite/${audition.inviteCode}`);
                                      setCopiedInvite(true);
                                      setTimeout(() => setCopiedInvite(false), 2000);
                                    }}
                                    className="text-[#6B7280] hover:text-[#4F46E5] transition-colors flex-shrink-0"
                                    title="Copy invite link"
                                  >
                                    {copiedInvite ? <Check size={10} className="text-[#10B981]" /> : <Copy size={10} />}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                              audition.status === 'open' ? 'bg-[#ECFDF5] text-[#10B981]' :
                              audition.status === 'closed' ? 'bg-[#FEF3C7] text-[#D97706]' :
                              'bg-[#F3F4F6] text-[#6B7280]'
                            }`}>
                              {audition.status}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-sm text-[#6B7280]">{audition.date}</td>
                          <td className="px-5 py-4 text-sm text-[#6B7280]">{audition.openSlots}</td>
                          <td className="px-5 py-4 text-sm text-[#6B7280]">{audition.filledSlots}</td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-1.5 text-sm text-[#6B7280]">
                              <Users size={14} />
                              {audition.userCount}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-sm text-[#6B7280]">
                            {audition.createdAt ? new Date(audition.createdAt).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      ))}
                      {auditions.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-5 py-12 text-center text-[#9CA3AF]">
                            No auditions yet. Click "New Audition" to get started.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="space-y-8">
                  <button
                    onClick={() => setSelectedAudition(null)}
                    className="text-[#4F46E5] font-bold flex items-center gap-2 hover:underline"
                  >
                    ← Back to all auditions
                  </button>

                  <div className="bg-white p-8 rounded-3xl border border-[#E5E7EB] shadow-sm">
                    <div className="flex justify-between items-start mb-8">
                      <div>
                        <h3 className="text-2xl font-bold mb-2">{selectedAudition.title}</h3>
                        <div className="flex items-center gap-2 mb-2">
                          <Link2 size={14} className="text-[#4F46E5]" />
                          <span className="text-sm font-mono text-[#4F46E5]">{window.location.origin}/invite/{selectedAudition.inviteCode}</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/invite/${selectedAudition.inviteCode}`);
                              setCopiedInvite(true);
                              setTimeout(() => setCopiedInvite(false), 2000);
                            }}
                            className="text-[#6B7280] hover:text-[#4F46E5] transition-colors"
                            title="Copy invite link"
                          >
                            {copiedInvite ? <Check size={14} className="text-[#10B981]" /> : <Copy size={14} />}
                          </button>
                        </div>
                        <p className="text-[#6B7280]">{selectedAudition.description}</p>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            setNewAudition({
                              title: selectedAudition.title,
                              description: selectedAudition.description || '',
                              date: selectedAudition.date,
                              location: selectedAudition.location || '',
                              inviteCode: selectedAudition.inviteCode,
                              status: selectedAudition.status
                            });
                            setEditingAudition(selectedAudition);
                            setShowAddAudition(true);
                          }}
                          className="px-4 py-2 border border-[#E5E7EB] rounded-xl text-sm font-bold hover:bg-[#F3F4F6] flex items-center gap-1.5"
                        >
                          <Pencil size={14} />
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            setSlotConfig({ date: selectedAudition.date, startTime: '09:00', endTime: '17:00', duration: 15, padding: 0 });
                            setShowGenerateSlots(true);
                          }}
                          className="px-4 py-2 border border-[#E5E7EB] rounded-xl text-sm font-bold hover:bg-[#F3F4F6]"
                        >
                          Generate Slots
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="font-bold text-lg flex items-center gap-2">
                        <Clock size={20} className="text-[#4F46E5]" />
                        Audition Schedule
                      </h4>
                      {(Object.entries(
                        slots.reduce<Record<string, AuditionSlot[]>>((groups, slot) => {
                          const key = slot.date || 'Unscheduled';
                          if (!groups[key]) groups[key] = [];
                          groups[key].push(slot);
                          return groups;
                        }, {})
                      ) as [string, AuditionSlot[]][]).sort(([a], [b]) => a.localeCompare(b)).map(([date, dateSlots]) => (
                        <div key={date} className="space-y-3">
                          <button
                            onClick={() => setCollapsedDates(prev => {
                              const next = new Set(prev);
                              if (next.has(date)) next.delete(date); else next.add(date);
                              return next;
                            })}
                            className="font-bold text-sm text-[#4F46E5] uppercase tracking-wider flex items-center gap-2 pt-2 hover:opacity-80 transition-opacity"
                          >
                            <ChevronDown size={16} className={`transition-transform ${collapsedDates.has(date) ? '-rotate-90' : ''}`} />
                            <Calendar size={16} />
                            {date === 'Unscheduled' ? date : new Date(date + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            <span className="text-xs font-medium text-[#9CA3AF] normal-case tracking-normal">({dateSlots.length} slots)</span>
                          </button>
                          {!collapsedDates.has(date) && <div className="grid grid-cols-1 gap-3">
                            {dateSlots.sort((a, b) => a.startTime.localeCompare(b.startTime)).map(slot => {
                              const slotUser = currentAuditionUsers.find(u => u.userId === slot.userId);
                              return (
                              <div key={slot.id} className={`flex items-center justify-between p-4 rounded-2xl border ${slot.status === 'closed' ? 'bg-[#F3F4F6] border-[#E5E7EB] opacity-60' : 'bg-[#F9FAFB] border-[#F3F4F6]'}`}>
                                <div className="flex items-center gap-6">
                                  {!slot.userId && (
                                    <label className="flex items-center cursor-pointer" title={slot.status === 'closed' ? 'Re-open slot' : 'Close slot'}>
                                      <input
                                        type="checkbox"
                                        checked={slot.status !== 'closed'}
                                        onChange={async () => {
                                          const newStatus = slot.status === 'closed' ? 'available' : 'closed';
                                          await authFetch(`/api/slots/${slot.id}`, {
                                            method: 'PATCH',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ status: newStatus })
                                          });
                                          if (selectedAudition) fetchSlots(selectedAudition.id);
                                        }}
                                        className="w-4 h-4 rounded border-[#D1D5DB] text-[#4F46E5] focus:ring-[#4F46E5]"
                                      />
                                    </label>
                                  )}
                                  <div className="text-sm font-bold bg-white px-3 py-1.5 rounded-lg border border-[#E5E7EB] shadow-sm">
                                    {slot.startTime} - {slot.endTime}
                                  </div>
                                  {slot.status === 'closed' ? (
                                    <span className="text-[#9CA3AF] text-sm italic">Closed</span>
                                  ) : slot.userId ? (
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 bg-[#4F46E5] rounded-full flex items-center justify-center text-white text-xs font-bold">
                                        {slotUser?.firstName?.charAt(0) || '?'}
                                      </div>
                                      <div>
                                        <p className="font-bold text-sm">{slotUser?.firstName} {slotUser?.lastName}</p>
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-[#9CA3AF] text-sm italic">No applicant assigned</span>
                                  )}
                                </div>

                                <div className="flex items-center gap-3">
                                  {slot.status === 'available' && (
                                    <select
                                      onChange={(e) => handleBookSlot(slot.id, parseInt(e.target.value))}
                                      className="text-sm border border-[#E5E7EB] rounded-lg px-3 py-1.5 bg-white font-medium"
                                      defaultValue=""
                                    >
                                      <option value="" disabled>Assign Applicant</option>
                                      {currentAuditionUsers.map(u => (
                                        <option key={u.userId} value={u.userId}>{u.firstName} {u.lastName}</option>
                                      ))}
                                    </select>
                                  )}
                                  {slot.status === 'booked' && (
                                    <button
                                      onClick={() => {
                                        setEvaluatingSlotId(slot.id);
                                        setEvalScore('');
                                        setEvalFeedback('');
                                        setEvalPass(false);
                                      }}
                                      className="bg-[#4F46E5] text-white px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm"
                                    >
                                      Evaluate
                                    </button>
                                  )}
                                  {slot.status === 'completed' && (
                                    <div className="flex items-center gap-4">
                                      <div className="flex items-center gap-1 text-[#4F46E5] font-bold">
                                        <Trophy size={16} />
                                        {slot.score}/10
                                      </div>
                                      {slot.passedToCallback ? (
                                        <span className="flex items-center gap-1 text-[#10B981] text-xs font-bold bg-[#ECFDF5] px-2 py-1 rounded-md">
                                          <CheckCircle2 size={14} /> CALLBACK
                                        </span>
                                      ) : (
                                        <span className="flex items-center gap-1 text-[#EF4444] text-xs font-bold bg-[#FEF2F2] px-2 py-1 rounded-md">
                                          <XCircle size={14} /> REJECTED
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                              );
                            })}
                          </div>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'vocalists' && (
            <motion.div
              key="vocalists"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-5xl mx-auto"
            >
              <div className="flex justify-between items-center mb-10">
                <div>
                  <h2 className="text-3xl font-extrabold tracking-tight mb-2">Applicant Directory</h2>
                  <p className="text-[#6B7280]">View applicants registered for your auditions.</p>
                </div>
              </div>

              <div className="mb-8">
                <label className="block text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-2">Select Audition</label>
                <select
                  value={vocalistAuditionId ?? ''}
                  onChange={e => {
                    const id = parseInt(e.target.value);
                    if (id) handleSelectVocalistAudition(id);
                  }}
                  className="w-full max-w-md border border-[#E5E7EB] rounded-xl px-4 py-3 bg-white font-medium focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                >
                  <option value="" disabled>Choose an audition...</option>
                  {auditions.map(a => (
                    <option key={a.id} value={a.id}>{a.title} — {a.date}</option>
                  ))}
                </select>
              </div>

              {!vocalistAuditionId ? (
                <div className="bg-white p-16 rounded-3xl border border-[#E5E7EB] text-center">
                  <Users size={48} className="mx-auto mb-4 text-[#D1D5DB]" />
                  <h3 className="text-lg font-bold text-[#374151] mb-2">Select an Audition</h3>
                  <p className="text-sm text-[#6B7280]">Choose an audition above to view its registered applicants.</p>
                </div>
              ) : (
                <>
                  <div className="relative mb-6">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                    <input
                      type="text"
                      placeholder="Search by name or email..."
                      value={vocalistSearch}
                      onChange={e => setVocalistSearch(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 border border-[#E5E7EB] rounded-xl focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all bg-white"
                    />
                  </div>

                  <div className="bg-white rounded-3xl border border-[#E5E7EB] overflow-hidden shadow-sm">
                    {filteredVocalists.length === 0 ? (
                      <div className="p-12 text-center text-[#6B7280]">
                        <Users size={48} className="mx-auto mb-4 text-[#D1D5DB]" />
                        <h3 className="text-lg font-bold text-[#374151] mb-2">No Applicants Yet</h3>
                        <p className="text-sm">Applicants will appear here once they register via the invite link.</p>
                      </div>
                    ) : (
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-[#F9FAFB] border-bottom border-[#E5E7EB]">
                            <th className="px-6 py-4 text-xs font-bold text-[#6B7280] uppercase tracking-wider">Name</th>
                            <th className="px-6 py-4 text-xs font-bold text-[#6B7280] uppercase tracking-wider">Contact</th>
                            <th className="px-6 py-4 text-xs font-bold text-[#6B7280] uppercase tracking-wider text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F3F4F6]">
                          {filteredVocalists.map(vocalist => (
                            <tr key={vocalist.userId} onClick={() => setShowUserDetails(vocalist)} className="hover:bg-[#F9FAFB] transition-colors group cursor-pointer">
                              <td className="px-6 py-5">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-[#EEF2FF] text-[#4F46E5] rounded-xl flex items-center justify-center font-bold">
                                    {vocalist.firstName.charAt(0)}
                                  </div>
                                  <span className="font-bold text-[#111827]">{vocalist.firstName} {vocalist.lastName}</span>
                                </div>
                              </td>
                              <td className="px-6 py-5">
                                <div className="text-sm">
                                  <p className="text-[#111827] font-medium">{vocalist.email}</p>
                                  <p className="text-[#6B7280]">{vocalist.phone}</p>
                                </div>
                              </td>
                              <td className="px-6 py-5 text-right">
                                <ChevronRight size={20} className="text-[#6B7280] group-hover:text-[#4F46E5] transition-colors" />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {activeTab === 'callbacks' && (
            <motion.div
              key="callbacks"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="max-w-5xl mx-auto"
            >
              <div className="flex justify-between items-start mb-10">
                <div>
                  <h2 className="text-3xl font-extrabold tracking-tight mb-2">Section Placement</h2>
                  <p className="text-[#6B7280]">Final decisions for singers who passed the initial round.</p>
                </div>
              </div>

              <div className="mb-8">
                <label className="block text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-2">Select Audition</label>
                <select
                  value={callbackAuditionId ?? ''}
                  onChange={e => {
                    const id = parseInt(e.target.value);
                    if (id) handleSelectCallbackAudition(id);
                  }}
                  className="w-full max-w-md border border-[#E5E7EB] rounded-xl px-4 py-3 bg-white font-medium focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                >
                  <option value="" disabled>Choose an audition...</option>
                  {auditions.map(a => (
                    <option key={a.id} value={a.id}>{a.title} — {a.date}</option>
                  ))}
                </select>
              </div>

              {!callbackAuditionId ? (
                <div className="bg-white p-16 rounded-3xl border border-[#E5E7EB] text-center">
                  <Trophy size={48} className="mx-auto mb-4 text-[#D1D5DB]" />
                  <h3 className="text-lg font-bold text-[#374151] mb-2">Select an Audition</h3>
                  <p className="text-sm text-[#6B7280]">Choose an audition above to view and manage its callbacks.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {(['pending', 'accepted', 'rejected'] as const).map(status => {
                    const statusCallbacks = callbacksData.filter(cb => cb.finalDecision === status);
                    const statusConfig = {
                      pending: { color: 'text-[#D97706]', bg: 'bg-[#FFFBEB]', border: 'border-[#FDE68A]' },
                      accepted: { color: 'text-[#10B981]', bg: 'bg-[#ECFDF5]', border: 'border-[#A7F3D0]' },
                      rejected: { color: 'text-[#EF4444]', bg: 'bg-[#FEF2F2]', border: 'border-[#FECACA]' },
                    }[status];
                    return (
                      <div key={status} className="flex flex-col gap-4">
                        <div className="flex items-center justify-between px-2">
                          <h3 className={`font-bold uppercase tracking-widest text-xs ${statusConfig.color}`}>{status}</h3>
                          <span className={`${statusConfig.bg} ${statusConfig.color} px-2 py-0.5 rounded-md text-[10px] font-bold`}>
                            {statusCallbacks.length}
                          </span>
                        </div>
                        <div className={`${statusConfig.bg} p-4 rounded-3xl min-h-[400px] border-2 border-dashed ${statusConfig.border} space-y-3`}>
                          {statusCallbacks.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-[#9CA3AF] gap-2 min-h-[350px]">
                              <Search size={32} strokeWidth={1.5} />
                              <p className="text-sm font-medium">No applicants</p>
                            </div>
                          ) : (
                            statusCallbacks.map(cb => {
                              const cbUser = callbackUsers.find(u => u.userId === cb.userId);
                              const score = getScoreForCallback(cb);
                              return (
                                <div key={cb.id} className="bg-white p-4 rounded-2xl border border-[#E5E7EB] shadow-sm space-y-3">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 bg-[#EEF2FF] text-[#4F46E5] rounded-xl flex items-center justify-center font-bold text-sm">
                                      {cbUser?.firstName?.charAt(0) || '?'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-bold text-sm truncate">{cbUser?.firstName} {cbUser?.lastName}</p>
                                      <p className="text-xs text-[#6B7280] truncate">{cbUser?.email}</p>
                                    </div>
                                    {score !== null && (
                                      <div className="flex items-center gap-1 text-[#4F46E5] font-bold text-sm">
                                        <Trophy size={14} />
                                        {score}/10
                                      </div>
                                    )}
                                  </div>

                                  {cb.notes && (
                                    <p className="text-xs text-[#6B7280] line-clamp-2 italic">"{cb.notes}"</p>
                                  )}

                                  {cb.scheduledTime && (
                                    <div className="flex items-center gap-1.5 text-xs font-medium text-[#4F46E5] bg-[#EEF2FF] px-2.5 py-1.5 rounded-lg">
                                      <Calendar size={12} />
                                      {cb.scheduledTime}
                                    </div>
                                  )}

                                  <div className="flex flex-wrap gap-1.5 pt-1">
                                    {status === 'pending' && (
                                      <>
                                        <button
                                          onClick={() => handleUpdateCallback(cb.id, { finalDecision: 'accepted' })}
                                          className="flex items-center gap-1 px-2.5 py-1.5 bg-[#ECFDF5] text-[#10B981] rounded-lg text-xs font-bold hover:bg-[#D1FAE5] transition-colors"
                                        >
                                          <CheckCircle2 size={12} /> Accept
                                        </button>
                                        <button
                                          onClick={() => handleUpdateCallback(cb.id, { finalDecision: 'rejected' })}
                                          className="flex items-center gap-1 px-2.5 py-1.5 bg-[#FEF2F2] text-[#EF4444] rounded-lg text-xs font-bold hover:bg-[#FECACA] transition-colors"
                                        >
                                          <XCircle size={12} /> Reject
                                        </button>
                                      </>
                                    )}
                                    {status !== 'pending' && (
                                      <button
                                        onClick={() => handleUpdateCallback(cb.id, { finalDecision: 'pending' })}
                                        className="flex items-center gap-1 px-2.5 py-1.5 bg-[#F3F4F6] text-[#6B7280] rounded-lg text-xs font-bold hover:bg-[#E5E7EB] transition-colors"
                                      >
                                        <Undo2 size={12} /> Undo
                                      </button>
                                    )}
                                    <button
                                      onClick={() => {
                                        setShowScheduleCallback(cb);
                                        setScheduleDateTime(cb.scheduledTime || '');
                                      }}
                                      className="flex items-center gap-1 px-2.5 py-1.5 bg-[#F3F4F6] text-[#6B7280] rounded-lg text-xs font-bold hover:bg-[#E5E7EB] transition-colors"
                                    >
                                      <Clock size={12} /> Schedule
                                    </button>
                                    <button
                                      onClick={() => handleNotifyCallback(cb.id)}
                                      className="flex items-center gap-1 px-2.5 py-1.5 bg-[#EEF2FF] text-[#4F46E5] rounded-lg text-xs font-bold hover:bg-[#E0E7FF] transition-colors"
                                    >
                                      <Mail size={12} /> Notify
                                    </button>
                                    <button
                                      onClick={() => handleDeleteCallback(cb.id)}
                                      className="flex items-center gap-1 px-2.5 py-1.5 text-[#9CA3AF] rounded-lg text-xs font-bold hover:bg-[#FEF2F2] hover:text-[#EF4444] transition-colors"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-5xl mx-auto"
            >
              <div className="mb-8">
                <h2 className="text-3xl font-extrabold tracking-tight mb-2">Setup</h2>
                <p className="text-[#6B7280]">Configure your AuditionEase account settings.</p>
              </div>

              <div className="flex gap-1 mb-8 bg-[#F3F4F6] p-1 rounded-xl w-fit">
                <button
                  onClick={() => setSetupTab('general')}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${setupTab === 'general' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#6B7280] hover:text-[#374151]'}`}
                >
                  <Settings size={16} />
                  General
                </button>
                <button
                  onClick={() => setSetupTab('attributes')}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${setupTab === 'attributes' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#6B7280] hover:text-[#374151]'}`}
                >
                  <ClipboardList size={16} />
                  Applicant Attributes
                </button>
              </div>

              {setupTab === 'general' && (
                <div className="bg-white p-8 rounded-3xl border border-[#E5E7EB] shadow-sm">
                  <div className="text-center py-12 text-[#6B7280]">
                    <Settings size={48} className="mx-auto mb-4 text-[#D1D5DB]" />
                    <h3 className="text-lg font-bold text-[#374151] mb-2">General Settings</h3>
                    <p className="text-sm">Account-level settings will appear here.</p>
                  </div>
                </div>
              )}

              {setupTab === 'attributes' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-1">
                    <div className="bg-white p-6 rounded-3xl border border-[#E5E7EB] shadow-sm sticky top-10">
                      <h3 className="text-lg font-bold mb-4">Add New Attribute</h3>
                      <form onSubmit={handleAddAttribute} className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-[#6B7280] uppercase mb-1">Label</label>
                          <input
                            required
                            type="text"
                            value={newAttr.label}
                            onChange={e => setNewAttr({...newAttr, label: e.target.value})}
                            className="w-full border border-[#E5E7EB] rounded-xl px-4 py-2 text-sm"
                            placeholder="e.g. Dietary Restrictions"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-[#6B7280] uppercase mb-1">Type</label>
                          <select
                            value={newAttr.type}
                            onChange={e => setNewAttr({...newAttr, type: e.target.value as any})}
                            className="w-full border border-[#E5E7EB] rounded-xl px-4 py-2 text-sm bg-white"
                          >
                            <option value="text">Text</option>
                            <option value="number">Number</option>
                            <option value="date">Date</option>
                            <option value="boolean">Yes/No</option>
                            <option value="select">Dropdown (Select One)</option>
                            <option value="multiselect">Dropdown (Select Multiple)</option>
                          </select>
                        </div>
                        {(newAttr.type === 'select' || newAttr.type === 'multiselect') && (
                          <div>
                            <label className="block text-xs font-bold text-[#6B7280] uppercase mb-1">Options (comma separated)</label>
                            <input
                              type="text"
                              value={newAttr.options}
                              onChange={e => setNewAttr({...newAttr, options: e.target.value})}
                              className="w-full border border-[#E5E7EB] rounded-xl px-4 py-2 text-sm"
                              placeholder="Option 1, Option 2"
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="required"
                            checked={newAttr.required}
                            onChange={e => setNewAttr({...newAttr, required: e.target.checked})}
                          />
                          <label htmlFor="required" className="text-sm font-medium">Required field</label>
                        </div>
                        <button
                          type="submit"
                          className="w-full bg-[#4F46E5] text-white py-3 rounded-xl font-bold hover:bg-[#4338CA] transition-colors"
                        >
                          Add Attribute
                        </button>
                      </form>
                    </div>
                  </div>

                  <div className="lg:col-span-2 space-y-4">
                    <h3 className="text-lg font-bold">Current Attributes</h3>
                    {customAttributes.length === 0 ? (
                      <div className="bg-white p-12 rounded-3xl border border-[#E5E7EB] text-center text-[#6B7280]">
                        No custom attributes defined yet.
                      </div>
                    ) : (
                      customAttributes.map((attr, idx) => (
                        <div key={attr.id} className="bg-white p-4 rounded-2xl border border-[#E5E7EB] flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="flex flex-col">
                              <button
                                onClick={() => handleReorderAttribute(attr.id, 'up')}
                                disabled={idx === 0}
                                className="p-0.5 text-[#6B7280] hover:text-[#111827] disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                              >
                                <ArrowUp size={16} />
                              </button>
                              <button
                                onClick={() => handleReorderAttribute(attr.id, 'down')}
                                disabled={idx === customAttributes.length - 1}
                                className="p-0.5 text-[#6B7280] hover:text-[#111827] disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                              >
                                <ArrowDown size={16} />
                              </button>
                            </div>
                            <div>
                              <p className="font-bold">{attr.label}</p>
                              <p className="text-xs text-[#6B7280] uppercase tracking-wider">{attr.type === 'select' ? 'Dropdown (Select One)' : attr.type === 'multiselect' ? 'Dropdown (Select Multiple)' : attr.type} {attr.required ? '• Required' : ''}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteAttribute(attr.id)}
                            className="p-2 text-[#EF4444] hover:bg-[#FEF2F2] rounded-lg transition-colors"
                          >
                            <XCircle size={20} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'reports' && (
            <motion.div
              key="reports"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-5xl mx-auto"
            >
              {reportView === 'list' && (
                <>
                  <div className="flex justify-between items-center mb-10">
                    <div>
                      <h2 className="text-3xl font-extrabold tracking-tight mb-2">Reports</h2>
                      <p className="text-[#6B7280]">Build and run custom reports on your applicant data.</p>
                    </div>
                    <button
                      onClick={() => {
                        setEditingReportId(null);
                        setReportName('');
                        setReportCriteria([]);
                        setReportColumns([
                          { field: 'firstName', label: 'First Name' },
                          { field: 'lastName', label: 'Last Name' },
                          { field: 'email', label: 'Email' },
                        ]);
                        setReportView('builder');
                      }}
                      className="bg-[#4F46E5] text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-[#4338CA] transition-colors shadow-lg shadow-indigo-100"
                    >
                      <Plus size={20} />
                      New Report
                    </button>
                  </div>

                  {reportsList.length === 0 ? (
                    <div className="bg-white p-16 rounded-3xl border border-[#E5E7EB] text-center">
                      <FileBarChart size={48} className="mx-auto mb-4 text-[#D1D5DB]" />
                      <h3 className="text-lg font-bold text-[#374151] mb-2">No Reports Yet</h3>
                      <p className="text-sm text-[#6B7280]">Create your first report to filter and analyze your applicant data.</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm divide-y divide-[#F3F4F6]">
                      {reportsList.map(report => (
                        <div key={report.id} className="flex items-center gap-4 px-4 py-3 hover:bg-[#F9FAFB] transition-colors">
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => {
                                setEditingReportId(report.id);
                                setReportName(report.name);
                                setReportCriteria(report.criteria);
                                setReportColumns(report.columns);
                                setReportView('builder');
                              }}
                              className="p-1.5 text-[#6B7280] hover:text-[#4F46E5] hover:bg-[#EEF2FF] rounded-lg transition-colors"
                              title="Edit report"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => handleDeleteReport(report.id)}
                              className="p-1.5 text-[#6B7280] hover:text-[#EF4444] hover:bg-[#FEF2F2] rounded-lg transition-colors"
                              title="Delete report"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm text-[#111827] truncate">{report.name}</p>
                            <p className="text-xs text-[#9CA3AF]">
                              {report.criteria.length} filter{report.criteria.length !== 1 ? 's' : ''} · {report.columns.length} column{report.columns.length !== 1 ? 's' : ''} · {new Date(report.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <button
                            onClick={() => handleRunReport(report.id)}
                            className="flex-shrink-0 bg-[#4F46E5] text-white px-4 py-1.5 rounded-lg font-bold text-xs hover:bg-[#4338CA] transition-colors flex items-center gap-1.5"
                          >
                            <Play size={14} /> Run
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {reportView === 'builder' && (
                <>
                  <button
                    onClick={() => setReportView('list')}
                    className="text-[#4F46E5] font-bold flex items-center gap-2 hover:underline mb-6"
                  >
                    ← Back to Reports
                  </button>

                  <div className="bg-white rounded-3xl border border-[#E5E7EB] shadow-sm p-8 space-y-8">
                    <h3 className="text-2xl font-bold">{editingReportId ? 'Edit Report' : 'Create Report'}</h3>

                    <div>
                      <label className="block text-sm font-bold text-[#374151] mb-1.5">Report Name</label>
                      <input
                        type="text"
                        value={reportName}
                        onChange={e => setReportName(e.target.value)}
                        className="w-full max-w-md border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                        placeholder="e.g. Soprano Applicants"
                      />
                    </div>

                    <div>
                      <h4 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <Filter size={20} className="text-[#4F46E5]" />
                        Filter Criteria
                      </h4>
                      <p className="text-sm text-[#6B7280] mb-4">Add conditions to filter which applicants appear in the report. Leave empty to include all.</p>
                      <div className="space-y-3">
                        {reportCriteria.map((criterion, idx) => (
                          <div key={idx} className="flex items-center gap-2 flex-wrap bg-[#F9FAFB] p-3 rounded-xl">
                            {idx === 0 ? (
                              <span className="w-16 text-xs font-bold text-[#6B7280] uppercase text-center">Where</span>
                            ) : (
                              <select
                                value={criterion.logicOp || 'AND'}
                                onChange={e => {
                                  const u = [...reportCriteria];
                                  u[idx] = { ...u[idx], logicOp: e.target.value as 'AND' | 'OR' };
                                  setReportCriteria(u);
                                }}
                                className="w-16 border border-[#E5E7EB] rounded-lg px-1 py-2 text-xs font-bold bg-white text-center"
                              >
                                <option value="AND">AND</option>
                                <option value="OR">OR</option>
                              </select>
                            )}
                            <select
                              value={criterion.field}
                              onChange={e => {
                                const u = [...reportCriteria];
                                const fd = availableFields.find(f => f.field === e.target.value);
                                const ops = getOperatorsForType(fd?.type || 'text');
                                u[idx] = { ...u[idx], field: e.target.value, operator: ops[0]?.value || 'equals', value: '' };
                                setReportCriteria(u);
                              }}
                              className="flex-1 min-w-[160px] border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm bg-white"
                            >
                              <option value="" disabled>Select field...</option>
                              <optgroup label="User Fields">
                                {availableFields.filter(f => !f.field.startsWith('custom:')).map(f => (
                                  <option key={f.field} value={f.field}>{f.label}</option>
                                ))}
                              </optgroup>
                              {availableFields.some(f => f.field.startsWith('custom:')) && (
                                <optgroup label="Custom Attributes">
                                  {availableFields.filter(f => f.field.startsWith('custom:')).map(f => (
                                    <option key={f.field} value={f.field}>{f.label}</option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                            <select
                              value={criterion.operator}
                              onChange={e => {
                                const u = [...reportCriteria];
                                u[idx] = { ...u[idx], operator: e.target.value };
                                if (['is_empty', 'is_not_empty'].includes(e.target.value)) {
                                  u[idx].value = '';
                                }
                                setReportCriteria(u);
                              }}
                              className="w-44 border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm bg-white"
                            >
                              {getOperatorsForType(availableFields.find(f => f.field === criterion.field)?.type || 'text').map(op => (
                                <option key={op.value} value={op.value}>{op.label}</option>
                              ))}
                            </select>
                            {renderCriterionValue(criterion, idx)}
                            <button
                              onClick={() => setReportCriteria(reportCriteria.filter((_, i) => i !== idx))}
                              className="p-2 text-[#EF4444] hover:bg-[#FEF2F2] rounded-lg transition-colors flex-shrink-0"
                            >
                              <XCircle size={18} />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => {
                            const df = availableFields[0]?.field || 'firstName';
                            const dops = getOperatorsForType(availableFields[0]?.type || 'text');
                            setReportCriteria([...reportCriteria, {
                              field: df,
                              operator: dops[0]?.value || 'equals',
                              value: '',
                              ...(reportCriteria.length > 0 ? { logicOp: 'AND' as const } : {}),
                            }]);
                          }}
                          className="flex items-center gap-2 text-sm font-bold text-[#4F46E5] hover:underline pt-2"
                        >
                          <Plus size={16} /> Add Condition
                        </button>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <ClipboardList size={20} className="text-[#4F46E5]" />
                        Display Columns
                      </h4>
                      <p className="text-sm text-[#6B7280] mb-4">Add fields from the right to choose which columns appear in the report. Drag or use arrows to reorder.</p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <h5 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-2">Selected Columns</h5>
                          <div className="border border-[#E5E7EB] rounded-xl min-h-[240px] max-h-[320px] overflow-y-auto">
                            {reportColumns.length === 0 ? (
                              <div className="p-6 text-center text-[#9CA3AF] text-sm">No columns selected — add fields from the right</div>
                            ) : (
                              <div className="divide-y divide-[#F3F4F6]">
                                {reportColumns.map((col, idx) => (
                                  <div key={col.field} className="flex items-center gap-1 px-3 py-2.5 hover:bg-[#F9FAFB] group">
                                    <span className="text-xs text-[#9CA3AF] w-5 text-center font-mono">{idx + 1}</span>
                                    <span className="text-sm font-medium flex-1 truncate">{col.label}</span>
                                    <button
                                      onClick={() => {
                                        if (idx === 0) return;
                                        const u = [...reportColumns];
                                        [u[idx - 1], u[idx]] = [u[idx], u[idx - 1]];
                                        setReportColumns(u);
                                      }}
                                      disabled={idx === 0}
                                      className="p-1 rounded hover:bg-[#EEF2FF] text-[#6B7280] hover:text-[#4F46E5] disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-[#6B7280] transition-colors"
                                      title="Move up"
                                    >
                                      <ArrowUp size={14} />
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (idx === reportColumns.length - 1) return;
                                        const u = [...reportColumns];
                                        [u[idx], u[idx + 1]] = [u[idx + 1], u[idx]];
                                        setReportColumns(u);
                                      }}
                                      disabled={idx === reportColumns.length - 1}
                                      className="p-1 rounded hover:bg-[#EEF2FF] text-[#6B7280] hover:text-[#4F46E5] disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-[#6B7280] transition-colors"
                                      title="Move down"
                                    >
                                      <ArrowDown size={14} />
                                    </button>
                                    <button
                                      onClick={() => setReportColumns(reportColumns.filter(c => c.field !== col.field))}
                                      className="p-1 rounded hover:bg-[#FEF2F2] text-[#D1D5DB] hover:text-[#EF4444] transition-colors"
                                      title="Remove"
                                    >
                                      <XCircle size={14} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div>
                          <h5 className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-2">Available Fields</h5>
                          <div className="border border-[#E5E7EB] rounded-xl min-h-[240px] max-h-[320px] overflow-y-auto">
                            {(() => {
                              const unselected = availableFields.filter(f => !reportColumns.some(c => c.field === f.field));
                              const builtIn = unselected.filter(f => !f.field.startsWith('custom:'));
                              const custom = unselected.filter(f => f.field.startsWith('custom:'));
                              if (unselected.length === 0) {
                                return <div className="p-6 text-center text-[#9CA3AF] text-sm">All fields added</div>;
                              }
                              return (
                                <div className="divide-y divide-[#F3F4F6]">
                                  {builtIn.length > 0 && (
                                    <>
                                      <div className="px-3 py-1.5 bg-[#F9FAFB] text-xs font-bold text-[#9CA3AF] uppercase tracking-wider">User Fields</div>
                                      {builtIn.map(f => (
                                        <button
                                          key={f.field}
                                          onClick={() => setReportColumns([...reportColumns, { field: f.field, label: f.label }])}
                                          className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[#EEF2FF] text-left transition-colors"
                                        >
                                          <Plus size={14} className="text-[#4F46E5] flex-shrink-0" />
                                          <span className="text-sm font-medium">{f.label}</span>
                                        </button>
                                      ))}
                                    </>
                                  )}
                                  {custom.length > 0 && (
                                    <>
                                      <div className="px-3 py-1.5 bg-[#F9FAFB] text-xs font-bold text-[#9CA3AF] uppercase tracking-wider">Custom Attributes</div>
                                      {custom.map(f => (
                                        <button
                                          key={f.field}
                                          onClick={() => setReportColumns([...reportColumns, { field: f.field, label: f.label }])}
                                          className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[#EEF2FF] text-left transition-colors"
                                        >
                                          <Plus size={14} className="text-[#4F46E5] flex-shrink-0" />
                                          <span className="text-sm font-medium">{f.label}</span>
                                        </button>
                                      ))}
                                    </>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-[#E5E7EB]">
                      <button
                        onClick={() => setReportView('list')}
                        className="px-6 py-3 border border-[#E5E7EB] rounded-xl font-bold hover:bg-[#F9FAFB]"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveReport}
                        disabled={!reportName.trim() || reportColumns.length === 0}
                        className="bg-[#4F46E5] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#4338CA] transition-colors shadow-lg shadow-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {editingReportId ? 'Update Report' : 'Save Report'}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {reportView === 'results' && reportResults && (
                <>
                  <button
                    onClick={() => setReportView('list')}
                    className="text-[#4F46E5] font-bold flex items-center gap-2 hover:underline mb-6"
                  >
                    ← Back to Reports
                  </button>

                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-3xl font-extrabold tracking-tight mb-2">{reportResults.reportName}</h2>
                      <p className="text-[#6B7280]">{reportResults.rows.length} result{reportResults.rows.length !== 1 ? 's' : ''} found</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          const cols = reportResults.columns;
                          const header = cols.map(c => `"${c.label.replace(/"/g, '""')}"`).join(',');
                          const rows = reportResults.rows.map(row =>
                            cols.map(c => {
                              const val = String(row[c.field] ?? '');
                              return `"${val.replace(/"/g, '""')}"`;
                            }).join(',')
                          );
                          const csv = [header, ...rows].join('\n');
                          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          const now = new Date();
                          const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
                          a.download = `${reportResults.reportName.replace(/[^a-zA-Z0-9 ]/g, '').trim()}_${stamp}.csv`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="bg-white text-[#4F46E5] border border-[#4F46E5] px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-[#EEF2FF] transition-colors"
                      >
                        <Download size={16} /> Export CSV
                      </button>
                      {runningReportId && (
                        <button
                          onClick={() => handleRunReport(runningReportId)}
                          className="bg-[#4F46E5] text-white px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-[#4338CA] transition-colors"
                        >
                          <Play size={16} /> Re-run
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="bg-white rounded-3xl border border-[#E5E7EB] overflow-hidden shadow-sm">
                    {reportResults.rows.length === 0 ? (
                      <div className="p-12 text-center text-[#6B7280]">
                        <Search size={48} className="mx-auto mb-4 text-[#D1D5DB]" />
                        <h3 className="text-lg font-bold text-[#374151] mb-2">No Results</h3>
                        <p className="text-sm">No applicants match the filter criteria for this report.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-[#F9FAFB]">
                              {reportResults.columns.map(col => (
                                <th key={col.field} className="px-6 py-4 text-xs font-bold text-[#6B7280] uppercase tracking-wider whitespace-nowrap">
                                  {col.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F3F4F6]">
                            {reportResults.rows.map((row, idx) => (
                              <tr key={idx} className="hover:bg-[#F9FAFB] transition-colors">
                                {reportResults.columns.map(col => (
                                  <td key={col.field} className="px-6 py-4 text-sm">
                                    {String(row[col.field] ?? '')}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      {showAddAudition && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl"
          >
            <h3 className="text-2xl font-bold mb-6">{editingAudition ? 'Edit Audition' : 'Create New Audition'}</h3>
            <form onSubmit={editingAudition ? handleEditAudition : handleAddAudition} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-[#374151] mb-1.5">Audition Title</label>
                <input
                  required
                  type="text"
                  value={newAudition.title}
                  onChange={e => setNewAudition({...newAudition, title: e.target.value})}
                  className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                  placeholder="e.g. Spring Choir Auditions 2024"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-[#374151] mb-1.5">Description</label>
                <textarea
                  value={newAudition.description}
                  onChange={e => setNewAudition({...newAudition, description: e.target.value})}
                  className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all h-24"
                  placeholder="What are you looking for?"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-[#374151] mb-1.5">Start Date</label>
                  <input
                    required
                    type="date"
                    value={newAudition.date}
                    onChange={e => setNewAudition({...newAudition, date: e.target.value})}
                    className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-[#374151] mb-1.5">Location <span className="text-[#9CA3AF] font-normal">(optional)</span></label>
                  <input
                    type="text"
                    value={newAudition.location}
                    onChange={e => setNewAudition({...newAudition, location: e.target.value})}
                    className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                    placeholder="Room 101"
                  />
                </div>
              </div>
              {editingAudition && (
                <div>
                  <label className="block text-sm font-bold text-[#374151] mb-1.5">Status</label>
                  <select
                    value={newAudition.status}
                    onChange={e => setNewAudition({...newAudition, status: e.target.value})}
                    className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all bg-white"
                  >
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-bold text-[#374151] mb-1.5">Invite Code</label>
                <input
                  required
                  type="text"
                  maxLength={31}
                  value={newAudition.inviteCode}
                  onChange={e => setNewAudition({...newAudition, inviteCode: e.target.value.replace(/[^A-Za-z0-9_-]/g, '')})}
                  className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all font-mono tracking-wider"
                  placeholder="e.g. ABC123"
                />
                <p className="text-xs text-[#9CA3AF] mt-1">Letters, numbers, underscores, and dashes only. Shared with participants to sign up.</p>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowAddAudition(false); setEditingAudition(null); }}
                  className="flex-1 px-6 py-3 border border-[#E5E7EB] rounded-xl font-bold hover:bg-[#F9FAFB]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#4F46E5] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#4338CA] shadow-lg shadow-indigo-100"
                >
                  {editingAudition ? 'Save Changes' : 'Create Audition'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {showGenerateSlots && selectedAudition && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl"
          >
            <h3 className="text-2xl font-bold mb-6">Generate Time Slots</h3>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const start = new Date(`2000-01-01T${slotConfig.startTime}`);
              const end = new Date(`2000-01-01T${slotConfig.endTime}`);
              const slotsToCreate: { auditionId: number; date: string; startTime: string; endTime: string; status: string }[] = [];
              while (start < end) {
                const slotEnd = new Date(start);
                slotEnd.setMinutes(slotEnd.getMinutes() + slotConfig.duration);
                if (slotEnd > end) break;
                slotsToCreate.push({
                  auditionId: selectedAudition.id,
                  date: slotConfig.date,
                  startTime: start.toTimeString().slice(0, 5),
                  endTime: slotEnd.toTimeString().slice(0, 5),
                  status: 'available'
                });
                start.setMinutes(start.getMinutes() + slotConfig.duration + slotConfig.padding);
              }
              await Promise.all(slotsToCreate.map(s => authFetch('/api/slots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(s)
              })));
              fetchSlots(selectedAudition.id);
              setShowGenerateSlots(false);
            }} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-[#374151] mb-1.5">Date</label>
                <input
                  required
                  type="date"
                  value={slotConfig.date}
                  onChange={e => setSlotConfig({...slotConfig, date: e.target.value})}
                  className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-[#374151] mb-1.5">Start Time</label>
                  <input
                    required
                    type="time"
                    value={slotConfig.startTime}
                    onChange={e => setSlotConfig({...slotConfig, startTime: e.target.value})}
                    className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-[#374151] mb-1.5">End Time</label>
                  <input
                    required
                    type="time"
                    value={slotConfig.endTime}
                    onChange={e => setSlotConfig({...slotConfig, endTime: e.target.value})}
                    className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-[#374151] mb-1.5">Slot Duration (minutes)</label>
                <select
                  value={[5, 10, 15, 20, 30, 45, 60].includes(slotConfig.duration) ? slotConfig.duration : 'custom'}
                  onChange={e => {
                    if (e.target.value === 'custom') {
                      setSlotConfig({...slotConfig, duration: 1});
                    } else {
                      setSlotConfig({...slotConfig, duration: parseInt(e.target.value)});
                    }
                  }}
                  className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                >
                  <option value={5}>5 minutes</option>
                  <option value={10}>10 minutes</option>
                  <option value={15}>15 minutes</option>
                  <option value={20}>20 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>60 minutes</option>
                  <option value="custom">Custom...</option>
                </select>
                {![5, 10, 15, 20, 30, 45, 60].includes(slotConfig.duration) && (
                  <input
                    required
                    type="number"
                    min={1}
                    max={480}
                    value={slotConfig.duration}
                    onChange={e => setSlotConfig({...slotConfig, duration: parseInt(e.target.value) || 1})}
                    className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 mt-2 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                    placeholder="Enter minutes"
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-bold text-[#374151] mb-1.5">Padding Between Slots (minutes)</label>
                <select
                  value={[0, 5, 10, 15, 20, 30].includes(slotConfig.padding) ? slotConfig.padding : 'custom'}
                  onChange={e => {
                    if (e.target.value === 'custom') {
                      setSlotConfig({...slotConfig, padding: 1});
                    } else {
                      setSlotConfig({...slotConfig, padding: parseInt(e.target.value)});
                    }
                  }}
                  className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                >
                  <option value={0}>No padding</option>
                  <option value={5}>5 minutes</option>
                  <option value={10}>10 minutes</option>
                  <option value={15}>15 minutes</option>
                  <option value={20}>20 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value="custom">Custom...</option>
                </select>
                {![0, 5, 10, 15, 20, 30].includes(slotConfig.padding) && (
                  <input
                    required
                    type="number"
                    min={1}
                    max={120}
                    value={slotConfig.padding}
                    onChange={e => setSlotConfig({...slotConfig, padding: parseInt(e.target.value) || 1})}
                    className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 mt-2 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                    placeholder="Enter minutes"
                  />
                )}
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowGenerateSlots(false)}
                  className="flex-1 px-6 py-3 border border-[#E5E7EB] rounded-xl font-bold hover:bg-[#F9FAFB]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#4F46E5] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#4338CA] shadow-lg shadow-indigo-100"
                >
                  Generate Slots
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {evaluatingSlotId !== null && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full"
          >
            <h3 className="text-xl font-bold text-[#111827] mb-6">Evaluate Audition</h3>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-[#374151] mb-1.5">Score (1-10)</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={evalScore}
                  onChange={e => setEvalScore(e.target.value)}
                  className="w-full border border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#4F46E5] focus:border-transparent outline-none"
                  placeholder="Enter score"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-[#374151] mb-1.5">Feedback</label>
                <textarea
                  value={evalFeedback}
                  onChange={e => setEvalFeedback(e.target.value)}
                  rows={3}
                  className="w-full border border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#4F46E5] focus:border-transparent outline-none resize-none"
                  placeholder="Enter feedback"
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={evalPass}
                  onChange={e => setEvalPass(e.target.checked)}
                  className="w-5 h-5 rounded border-[#D1D5DB] text-[#4F46E5] focus:ring-[#4F46E5]"
                />
                <span className="text-sm font-bold text-[#374151]">Pass to callback</span>
              </label>
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setEvaluatingSlotId(null)}
                className="flex-1 bg-[#F3F4F6] text-[#111827] py-3 rounded-xl font-bold hover:bg-[#E5E7EB] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const s = parseInt(evalScore);
                  if (!s || s < 1 || s > 10) return;
                  handleCompleteAudition(evaluatingSlotId, s, evalFeedback, evalPass);
                  setEvaluatingSlotId(null);
                }}
                className="flex-1 bg-[#4F46E5] text-white py-3 rounded-xl font-bold hover:bg-[#4338CA] transition-colors shadow-lg shadow-indigo-100"
              >
                Submit
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {showUserDetails && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl"
          >
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#EEF2FF] text-[#4F46E5] rounded-2xl flex items-center justify-center font-bold text-xl">
                  {(editingUserDetails ? editUserForm.firstName : showUserDetails.firstName).charAt(0) || '?'}
                </div>
                <div>
                  <h3 className="text-2xl font-bold">
                    {editingUserDetails ? `${editUserForm.firstName} ${editUserForm.lastName}` : `${showUserDetails.firstName} ${showUserDetails.lastName}`}
                  </h3>
                </div>
              </div>
              <button
                onClick={() => { setShowUserDetails(null); setEditingUserDetails(false); }}
                className="text-[#6B7280] hover:text-[#111827]"
              >
                <XCircle size={24} />
              </button>
            </div>

            {!editingUserDetails ? (
              <>
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-1">Email</p>
                      <p className="font-medium">{showUserDetails.email}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-1">Phone</p>
                      <p className="font-medium">{showUserDetails.phone || 'N/A'}</p>
                    </div>
                  </div>

                  {showUserDetails.customFieldValues && showUserDetails.customFieldValues.length > 0 && (
                    <div className="pt-4 border-t border-[#E5E7EB]">
                      <p className="text-xs font-bold text-[#4F46E5] uppercase tracking-wider mb-3">Vocal Attributes</p>
                      <div className="grid grid-cols-1 gap-3">
                        {showUserDetails.customFieldValues.map(cfv => {
                          const attr = customAttributes.find(a => a.id === cfv.customAttributeId);
                          if (!attr) return null;
                          let displayValue: string;
                          if (attr.type === 'boolean') {
                            displayValue = cfv.value === 'true' ? 'Yes' : 'No';
                          } else if (attr.type === 'multiselect') {
                            try { displayValue = (JSON.parse(cfv.value) as string[]).join(', '); } catch { displayValue = cfv.value; }
                          } else {
                            displayValue = cfv.value;
                          }
                          return (
                            <div key={cfv.id} className="flex justify-between items-center py-2 border-b border-[#F3F4F6] last:border-0">
                              <span className="text-sm font-medium text-[#6B7280]">{attr.label}</span>
                              <div className="text-right">
                                <span className="text-sm font-bold text-[#111827]">{displayValue}</span>
                                <p className="text-[10px] text-[#9CA3AF] mt-0.5">
                                  {new Date(cfv.updatedAt).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 mt-8">
                  <button
                    onClick={() => { setShowUserDetails(null); setEditingUserDetails(false); }}
                    className="flex-1 bg-[#F3F4F6] text-[#111827] py-3 rounded-xl font-bold hover:bg-[#E5E7EB] transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      setEditUserForm({
                        firstName: showUserDetails.firstName,
                        lastName: showUserDetails.lastName,
                        phone: showUserDetails.phone || '',
                        customFieldValues: customAttributes.map(attr => {
                          const existing = showUserDetails.customFieldValues?.find(cf => cf.customAttributeId === attr.id);
                          return { customAttributeId: attr.id, value: existing?.value ?? '' };
                        }),
                      });
                      setEditingUserDetails(true);
                    }}
                    className="flex-1 bg-[#4F46E5] text-white py-3 rounded-xl font-bold hover:bg-[#4338CA] transition-colors flex items-center justify-center gap-2"
                  >
                    <Pencil size={16} /> Edit
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-1">First Name</label>
                      <input
                        type="text"
                        value={editUserForm.firstName}
                        onChange={e => setEditUserForm({ ...editUserForm, firstName: e.target.value })}
                        className="w-full border border-[#E5E7EB] rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-1">Last Name</label>
                      <input
                        type="text"
                        value={editUserForm.lastName}
                        onChange={e => setEditUserForm({ ...editUserForm, lastName: e.target.value })}
                        className="w-full border border-[#E5E7EB] rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-1">Email</label>
                    <p className="text-sm font-medium text-[#9CA3AF] px-1">{showUserDetails.email}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-1">Phone</label>
                    <input
                      type="text"
                      value={editUserForm.phone}
                      onChange={e => setEditUserForm({ ...editUserForm, phone: e.target.value })}
                      className="w-full border border-[#E5E7EB] rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all text-sm"
                    />
                  </div>

                  {customAttributes.length > 0 && (
                    <div className="pt-4 border-t border-[#E5E7EB]">
                      <p className="text-xs font-bold text-[#4F46E5] uppercase tracking-wider mb-3">Vocal Attributes</p>
                      <div className="space-y-3">
                        {customAttributes.map(attr => {
                          const cfEntry = editUserForm.customFieldValues.find(cf => cf.customAttributeId === attr.id);
                          const val = cfEntry?.value ?? '';
                          const updateCf = (newVal: string) => {
                            setEditUserForm(prev => ({
                              ...prev,
                              customFieldValues: prev.customFieldValues.map(cf =>
                                cf.customAttributeId === attr.id ? { ...cf, value: newVal } : cf
                              ),
                            }));
                          };
                          const options = parseOptions(attr.options);
                          return (
                            <div key={attr.id}>
                              <label className="block text-sm font-medium text-[#6B7280] mb-1">{attr.label}</label>
                              {attr.type === 'boolean' ? (
                                <select value={val} onChange={e => updateCf(e.target.value)} className="w-full border border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-[#4F46E5] outline-none">
                                  <option value="">—</option>
                                  <option value="true">Yes</option>
                                  <option value="false">No</option>
                                </select>
                              ) : attr.type === 'select' ? (
                                <select value={val} onChange={e => updateCf(e.target.value)} className="w-full border border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-[#4F46E5] outline-none">
                                  <option value="">—</option>
                                  {options.map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                              ) : attr.type === 'multiselect' ? (
                                <div className="flex flex-wrap gap-2 p-2 border border-[#E5E7EB] rounded-xl">
                                  {options.map(o => {
                                    let selected: string[] = [];
                                    try { selected = val ? JSON.parse(val) : []; } catch { /* ignore */ }
                                    const isChecked = selected.includes(o);
                                    return (
                                      <label key={o} className="flex items-center gap-1.5 text-sm cursor-pointer px-2 py-1 rounded-lg hover:bg-[#F9FAFB]">
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => {
                                            const next = isChecked ? selected.filter(s => s !== o) : [...selected, o];
                                            updateCf(JSON.stringify(next));
                                          }}
                                          className="w-3.5 h-3.5 rounded border-[#D1D5DB] text-[#4F46E5]"
                                        />
                                        {o}
                                      </label>
                                    );
                                  })}
                                </div>
                              ) : (
                                <input
                                  type={attr.type === 'number' ? 'number' : attr.type === 'date' ? 'date' : 'text'}
                                  value={val}
                                  onChange={e => updateCf(e.target.value)}
                                  className="w-full border border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#4F46E5] outline-none"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 mt-8">
                  <button
                    onClick={() => setEditingUserDetails(false)}
                    className="flex-1 bg-[#F3F4F6] text-[#111827] py-3 rounded-xl font-bold hover:bg-[#E5E7EB] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={savingUserDetails || !editUserForm.firstName.trim() || !editUserForm.lastName.trim()}
                    onClick={async () => {
                      setSavingUserDetails(true);
                      try {
                        const cfToSend = editUserForm.customFieldValues.filter(cf => cf.value !== '');
                        await authFetch(`/api/audition-users/${showUserDetails.auditionUserId}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            firstName: editUserForm.firstName,
                            lastName: editUserForm.lastName,
                            phone: editUserForm.phone,
                            customFieldValues: cfToSend,
                          }),
                        });
                        const updated: AuditionUser = {
                          ...showUserDetails,
                          firstName: editUserForm.firstName,
                          lastName: editUserForm.lastName,
                          phone: editUserForm.phone,
                          customFieldValues: cfToSend.map(cf => {
                            const prev = showUserDetails.customFieldValues?.find(p => p.customAttributeId === cf.customAttributeId);
                            return { id: prev?.id ?? 0, customAttributeId: cf.customAttributeId, value: cf.value, updatedAt: new Date().toISOString() };
                          }),
                        };
                        setShowUserDetails(updated);
                        if (vocalistAuditionId) {
                          setVocalistUsers(prev => prev.map(u => u.auditionUserId === updated.auditionUserId ? updated : u));
                        }
                        setEditingUserDetails(false);
                      } catch (err) {
                        console.error('Failed to save:', err);
                      } finally {
                        setSavingUserDetails(false);
                      }
                    }}
                    className="flex-1 bg-[#4F46E5] text-white py-3 rounded-xl font-bold hover:bg-[#4338CA] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {savingUserDetails ? <Loader2 size={16} className="animate-spin" /> : null}
                    Save
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
      {showScheduleCallback && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl"
          >
            <h3 className="text-2xl font-bold mb-2">Schedule Callback</h3>
            {(() => {
              const cbUser = callbackUsers.find(u => u.userId === showScheduleCallback.userId);
              return (
                <p className="text-[#6B7280] text-sm mb-6">
                  Set a date and time for {cbUser?.firstName} {cbUser?.lastName}'s callback.
                </p>
              );
            })()}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-[#374151] mb-1.5">Date & Time</label>
                <input
                  type="datetime-local"
                  value={scheduleDateTime}
                  onChange={e => setScheduleDateTime(e.target.value)}
                  className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowScheduleCallback(null)}
                  className="flex-1 px-6 py-3 border border-[#E5E7EB] rounded-xl font-bold hover:bg-[#F9FAFB]"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (scheduleDateTime) {
                      const formatted = new Date(scheduleDateTime).toLocaleString(undefined, {
                        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
                        hour: 'numeric', minute: '2-digit'
                      });
                      await handleUpdateCallback(showScheduleCallback.id, { scheduledTime: formatted });
                    }
                    setShowScheduleCallback(null);
                  }}
                  className="flex-1 bg-[#4F46E5] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#4338CA] shadow-lg shadow-indigo-100"
                >
                  Save Schedule
                </button>
              </div>
              {showScheduleCallback.scheduledTime && (
                <button
                  onClick={async () => {
                    await handleUpdateCallback(showScheduleCallback.id, { scheduledTime: '' });
                    setShowScheduleCallback(null);
                  }}
                  className="w-full text-center text-sm text-[#EF4444] font-medium hover:underline"
                >
                  Clear scheduled time
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
