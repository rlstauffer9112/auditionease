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
import { Link2, Copy, Check } from 'lucide-react';
import { LogOut } from 'lucide-react';

// --- Types ---
interface PerformerCustomFieldValue {
  id: number;
  customAttributeId: number;
  value: string;
  updatedAt: string;
}

interface Performer {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  notes: string;
  customFieldValues: PerformerCustomFieldValue[];
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
}

interface AuditionSlot {
  id: number;
  auditionId: number;
  performerId: number | null;
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
  performerId: number;
  scheduledTime: string;
  notes: string;
  finalDecision: 'accepted' | 'rejected' | 'pending';
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
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
  const [activeTab, setActiveTab] = useState<'auditions' | 'performers' | 'callbacks' | 'settings'>('auditions');
  const [auditions, setAuditions] = useState<Audition[]>([]);
  const [performers, setPerformers] = useState<Performer[]>([]);
  const [customAttributes, setCustomAttributes] = useState<CustomAttribute[]>([]);
  const [selectedAudition, setSelectedAudition] = useState<Audition | null>(null);
  const [slots, setSlots] = useState<AuditionSlot[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [showAddAudition, setShowAddAudition] = useState(false);
  const [showAddPerformer, setShowAddPerformer] = useState(false);
  const [showGenerateSlots, setShowGenerateSlots] = useState(false);
  const [slotConfig, setSlotConfig] = useState({ date: '', startTime: '09:00', endTime: '17:00', duration: 15, padding: 0 });
  const [newAudition, setNewAudition] = useState({ title: '', description: '', date: '', location: '', inviteCode: '' });
  const [newPerformer, setNewPerformer] = useState({ firstName: '', lastName: '', email: '', phone: '', notes: '' });
  const [performerCustomData, setPerformerCustomData] = useState<Record<string, any>>({});

  // Settings states
  const [setupTab, setSetupTab] = useState<'general' | 'attributes'>('general');
  const [newAttr, setNewAttr] = useState({ label: '', type: 'text' as any, options: '', required: false });

  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  const [showPerformerDetails, setShowPerformerDetails] = useState<Performer | null>(null);
  const [performerSearch, setPerformerSearch] = useState('');
  const [evaluatingSlotId, setEvaluatingSlotId] = useState<number | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [evalScore, setEvalScore] = useState('');
  const [evalFeedback, setEvalFeedback] = useState('');
  const [evalPass, setEvalPass] = useState(false);
  const [editingPerformer, setEditingPerformer] = useState<Performer | null>(null);
  const [editPerformerData, setEditPerformerData] = useState({ firstName: '', lastName: '', email: '', phone: '', notes: '' });
  const [editPerformerCustomData, setEditPerformerCustomData] = useState<Record<string, any>>({});

  // Callback states
  const [callbacksData, setCallbacksData] = useState<Callback[]>([]);
  const [callbackAuditionId, setCallbackAuditionId] = useState<number | null>(null);
  const [callbackSlots, setCallbackSlots] = useState<AuditionSlot[]>([]);
  const [showScheduleCallback, setShowScheduleCallback] = useState<Callback | null>(null);
  const [scheduleDateTime, setScheduleDateTime] = useState('');

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

  const fetchData = async () => {
    setLoading(true);
    try {
      const [audRes, perfRes, attrRes] = await Promise.all([
        authFetch('/api/auditions'),
        authFetch('/api/performers'),
        authFetch('/api/custom-attributes')
      ]);
      const audData = await audRes.json();
      const perfData = await perfRes.json();
      const attrData = await attrRes.json();
      setAuditions(audData);
      setPerformers(perfData);
      setCustomAttributes(attrData);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSlots = async (auditionId: number) => {
    try {
      const res = await authFetch(`/api/auditions/${auditionId}/slots`);
      const data = await res.json();
      setSlots(data);
    } catch (err) {
      console.error('Error fetching slots:', err);
    }
  };

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
        setNewAudition({ title: '', description: '', date: '', location: '', inviteCode: '' });
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create audition');
      }
    } catch (err) {
      console.error('Error adding audition:', err);
    }
  };

  const handleAddPerformer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const customFieldValues = customAttributes
        .filter(attr => performerCustomData[attr.label] !== undefined && performerCustomData[attr.label] !== '')
        .map(attr => ({
          customAttributeId: attr.id,
          value: typeof performerCustomData[attr.label] === 'object'
            ? JSON.stringify(performerCustomData[attr.label])
            : String(performerCustomData[attr.label]),
        }));
      const res = await authFetch('/api/performers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newPerformer, customFieldValues })
      });
      if (res.ok) {
        fetchData();
        setShowAddPerformer(false);
        setNewPerformer({ firstName: '', lastName: '', email: '', phone: '', notes: '' });
        setPerformerCustomData({});
      }
    } catch (err) {
      console.error('Error adding performer:', err);
    }
  };

  const startEditPerformer = (performer: Performer) => {
    setEditPerformerData({
      firstName: performer.firstName,
      lastName: performer.lastName,
      email: performer.email,
      phone: performer.phone || '',
      notes: performer.notes || '',
    });
    const customData: Record<string, any> = {};
    if (performer.customFieldValues) {
      for (const cfv of performer.customFieldValues) {
        const attr = customAttributes.find(a => a.id === cfv.customAttributeId);
        if (attr) {
          if (attr.type === 'boolean') {
            customData[attr.label] = cfv.value === 'true';
          } else if (attr.type === 'multiselect') {
            try { customData[attr.label] = JSON.parse(cfv.value); } catch { customData[attr.label] = []; }
          } else {
            customData[attr.label] = cfv.value;
          }
        }
      }
    }
    setEditPerformerCustomData(customData);
    setEditingPerformer(performer);
    setShowPerformerDetails(null);
  };

  const handleEditPerformer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPerformer) return;
    try {
      const customFieldValues = customAttributes
        .filter(attr => editPerformerCustomData[attr.label] !== undefined && editPerformerCustomData[attr.label] !== '')
        .map(attr => ({
          customAttributeId: attr.id,
          value: typeof editPerformerCustomData[attr.label] === 'object'
            ? JSON.stringify(editPerformerCustomData[attr.label])
            : String(editPerformerCustomData[attr.label]),
        }));
      const res = await authFetch(`/api/performers/${editingPerformer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editPerformerData, customFieldValues })
      });
      if (res.ok) {
        fetchData();
        setEditingPerformer(null);
      }
    } catch (err) {
      console.error('Error updating performer:', err);
    }
  };

  const filteredPerformers = performers.filter(p => {
    if (!performerSearch.trim()) return true;
    const q = performerSearch.trim().toLowerCase();
    return p.firstName.toLowerCase().startsWith(q) ||
           p.lastName.toLowerCase().startsWith(q) ||
           p.email.toLowerCase().startsWith(q);
  });

  const handleAddAttribute = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await authFetch('/api/custom-attributes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAttr)
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
  };

  const handleBookSlot = async (slotId: number, performerId: number) => {
    try {
      const res = await authFetch(`/api/slots/${slotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ performerId, status: 'booked' })
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
          if (slot && slot.performerId) {
            await authFetch('/api/callbacks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                auditionId: selectedAudition.id,
                performerId: slot.performerId,
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
    } catch (err) {
      console.error('Error fetching callbacks:', err);
    }
  };

  const handleSelectCallbackAudition = (auditionId: number) => {
    setCallbackAuditionId(auditionId);
    fetchCallbacksForAudition(auditionId);
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
    if (!confirm('Remove this vocalist from callbacks?')) return;
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
    const slot = callbackSlots.find(s => s.performerId === cb.performerId && s.status === 'completed');
    return slot?.score ?? null;
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
            onClick={() => setActiveTab('performers')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'performers' ? 'bg-[#4F46E5] text-white shadow-lg shadow-indigo-100' : 'text-[#6B7280] hover:bg-[#F3F4F6]'}`}
          >
            <Users size={20} />
            <span className="font-medium">Vocalists</span>
          </button>
          <button 
            onClick={() => setActiveTab('callbacks')}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'callbacks' ? 'bg-[#4F46E5] text-white shadow-lg shadow-indigo-100' : 'text-[#6B7280] hover:bg-[#F3F4F6]'}`}
          >
            <Trophy size={20} />
            <span className="font-medium">Sections</span>
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
                  <p className="text-[#6B7280]">Schedule slots, track vocalists, and manage section placement.</p>
                </div>
                <button 
                  onClick={() => { setNewAudition({ title: '', description: '', date: '', location: '', inviteCode: generateInviteCode() }); setShowAddAudition(true); }}
                  className="bg-[#4F46E5] text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-[#4338CA] transition-colors shadow-lg shadow-indigo-100"
                >
                  <Plus size={20} />
                  New Audition
                </button>
              </div>

              {!selectedAudition ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {auditions.map(audition => (
                    <div 
                      key={audition.id}
                      onClick={() => handleSelectAudition(audition)}
                      className="bg-white p-6 rounded-3xl border border-[#E5E7EB] hover:border-[#4F46E5] transition-all cursor-pointer group shadow-sm hover:shadow-xl"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-[#EEF2FF] text-[#4F46E5] rounded-2xl group-hover:bg-[#4F46E5] group-hover:text-white transition-colors">
                          <Mic2 size={24} />
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${audition.status === 'open' ? 'bg-[#ECFDF5] text-[#10B981]' : 'bg-[#F3F4F6] text-[#6B7280]'}`}>
                          {audition.status}
                        </span>
                      </div>
                      <h3 className="text-xl font-bold mb-2">{audition.title}</h3>
                      <p className="text-[#6B7280] text-sm mb-6 line-clamp-2">{audition.description}</p>
                      <div className="flex items-center gap-4 text-sm text-[#6B7280] font-medium">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={16} />
                          {audition.date}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock size={16} />
                          {audition.location}
                        </div>
                      </div>
                    </div>
                  ))}
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
                            {dateSlots.sort((a, b) => a.startTime.localeCompare(b.startTime)).map(slot => (
                              <div key={slot.id} className={`flex items-center justify-between p-4 rounded-2xl border ${slot.status === 'closed' ? 'bg-[#F3F4F6] border-[#E5E7EB] opacity-60' : 'bg-[#F9FAFB] border-[#F3F4F6]'}`}>
                                <div className="flex items-center gap-6">
                                  {!slot.performerId && (
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
                                  ) : slot.performerId ? (
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 bg-[#4F46E5] rounded-full flex items-center justify-center text-white text-xs font-bold">
                                        {performers.find(p => p.id === slot.performerId)?.firstName.charAt(0)}
                                      </div>
                                      <div>
                                        <p className="font-bold text-sm">{performers.find(p => p.id === slot.performerId)?.firstName} {performers.find(p => p.id === slot.performerId)?.lastName}</p>
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-[#9CA3AF] text-sm italic">No vocalist assigned</span>
                                  )}
                                </div>

                                <div className="flex items-center gap-3">
                                  {slot.status === 'available' && (
                                    <select
                                      onChange={(e) => handleBookSlot(slot.id, parseInt(e.target.value))}
                                      className="text-sm border border-[#E5E7EB] rounded-lg px-3 py-1.5 bg-white font-medium"
                                      defaultValue=""
                                    >
                                      <option value="" disabled>Assign Vocalist</option>
                                      {performers.map(p => (
                                        <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
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
                            ))}
                          </div>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'performers' && (
            <motion.div 
              key="performers"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-5xl mx-auto"
            >
              <div className="flex justify-between items-center mb-10">
                <div>
                  <h2 className="text-3xl font-extrabold tracking-tight mb-2">Vocalist Directory</h2>
                  <p className="text-[#6B7280]">Manage your singers and their audition history.</p>
                </div>
                <button 
                  onClick={() => setShowAddPerformer(true)}
                  className="bg-[#4F46E5] text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-[#4338CA] transition-colors shadow-lg shadow-indigo-100"
                >
                  <UserPlus size={20} />
                  Add Vocalist
                </button>
              </div>

              <div className="relative mb-6">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={performerSearch}
                  onChange={e => setPerformerSearch(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 border border-[#E5E7EB] rounded-xl focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all bg-white"
                />
              </div>

              <div className="bg-white rounded-3xl border border-[#E5E7EB] overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F9FAFB] border-bottom border-[#E5E7EB]">
                      <th className="px-6 py-4 text-xs font-bold text-[#6B7280] uppercase tracking-wider">Name</th>
                      <th className="px-6 py-4 text-xs font-bold text-[#6B7280] uppercase tracking-wider">Contact</th>
                      <th className="px-6 py-4 text-xs font-bold text-[#6B7280] uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F3F4F6]">
                    {filteredPerformers.map(performer => (
                      <tr key={performer.id} onClick={() => setShowPerformerDetails(performer)} className="hover:bg-[#F9FAFB] transition-colors group cursor-pointer">
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-[#EEF2FF] text-[#4F46E5] rounded-xl flex items-center justify-center font-bold">
                              {performer.firstName.charAt(0)}
                            </div>
                            <span className="font-bold text-[#111827]">{performer.firstName} {performer.lastName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="text-sm">
                            <p className="text-[#111827] font-medium">{performer.email}</p>
                            <p className="text-[#6B7280]">{performer.phone}</p>
                          </div>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <ChevronRight size={20} className="text-[#6B7280] group-hover:text-[#4F46E5] transition-colors" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                              <p className="text-sm font-medium">No vocalists</p>
                            </div>
                          ) : (
                            statusCallbacks.map(cb => {
                              const performer = performers.find(p => p.id === cb.performerId);
                              const score = getScoreForCallback(cb);
                              return (
                                <div key={cb.id} className="bg-white p-4 rounded-2xl border border-[#E5E7EB] shadow-sm space-y-3">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 bg-[#EEF2FF] text-[#4F46E5] rounded-xl flex items-center justify-center font-bold text-sm">
                                      {performer?.firstName?.charAt(0) || '?'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-bold text-sm truncate">{performer?.firstName} {performer?.lastName}</p>
                                      <p className="text-xs text-[#6B7280] truncate">{performer?.email}</p>
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
                  Vocalist Attributes
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
            <h3 className="text-2xl font-bold mb-6">Create New Audition</h3>
            <form onSubmit={handleAddAudition} className="space-y-4">
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
                  <label className="block text-sm font-bold text-[#374151] mb-1.5">Location</label>
                  <input 
                    required
                    type="text" 
                    value={newAudition.location}
                    onChange={e => setNewAudition({...newAudition, location: e.target.value})}
                    className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                    placeholder="Room 101"
                  />
                </div>
              </div>
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
                  onClick={() => setShowAddAudition(false)}
                  className="flex-1 px-6 py-3 border border-[#E5E7EB] rounded-xl font-bold hover:bg-[#F9FAFB]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#4F46E5] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#4338CA] shadow-lg shadow-indigo-100"
                >
                  Create Audition
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

      {showAddPerformer && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl"
          >
            <h3 className="text-2xl font-bold mb-6">Register Vocalist</h3>
            <form onSubmit={handleAddPerformer} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-[#374151] mb-1.5">First Name</label>
                  <input
                    required
                    type="text"
                    value={newPerformer.firstName}
                    onChange={e => setNewPerformer({...newPerformer, firstName: e.target.value})}
                    className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-[#374151] mb-1.5">Last Name</label>
                  <input
                    required
                    type="text"
                    value={newPerformer.lastName}
                    onChange={e => setNewPerformer({...newPerformer, lastName: e.target.value})}
                    className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-[#374151] mb-1.5">Email Address</label>
                <input 
                  required
                  type="email" 
                  value={newPerformer.email}
                  onChange={e => setNewPerformer({...newPerformer, email: e.target.value})}
                  className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-[#374151] mb-1.5">Phone Number</label>
                <input 
                  type="tel" 
                  value={newPerformer.phone}
                  onChange={e => setNewPerformer({...newPerformer, phone: e.target.value})}
                  className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                />
              </div>
              {customAttributes.length > 0 && (
                <div className="pt-4 border-t border-[#E5E7EB] space-y-4">
                  <h4 className="font-bold text-[#4F46E5] text-sm uppercase tracking-wider">Vocal Attributes</h4>
                  <div className="max-h-60 overflow-y-auto pr-2 grid grid-cols-1 gap-4">
                    {customAttributes.map(attr => (
                      <div key={attr.id}>
                        <label className="block text-sm font-bold text-[#374151] mb-1.5">
                          {attr.label} {attr.required && <span className="text-[#EF4444]">*</span>}
                        </label>
                        {attr.type === 'text' && (
                          <input 
                            type="text"
                            required={attr.required}
                            onChange={e => setPerformerCustomData({...performerCustomData, [attr.label]: e.target.value})}
                            className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm"
                          />
                        )}
                        {attr.type === 'number' && (
                          <input 
                            type="number"
                            required={attr.required}
                            onChange={e => setPerformerCustomData({...performerCustomData, [attr.label]: e.target.value})}
                            className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm"
                          />
                        )}
                        {attr.type === 'date' && (
                          <input 
                            type="date"
                            required={attr.required}
                            onChange={e => setPerformerCustomData({...performerCustomData, [attr.label]: e.target.value})}
                            className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm"
                          />
                        )}
                        {attr.type === 'boolean' && (
                          <select 
                            required={attr.required}
                            onChange={e => setPerformerCustomData({...performerCustomData, [attr.label]: e.target.value === 'true'})}
                            className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm bg-white"
                          >
                            <option value="">Select...</option>
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select>
                        )}
                        {attr.type === 'select' && (
                          <select
                            required={attr.required}
                            onChange={e => setPerformerCustomData({...performerCustomData, [attr.label]: e.target.value})}
                            className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm bg-white"
                          >
                            <option value="">Select...</option>
                            {attr.options.split(',').map(opt => (
                              <option key={opt.trim()} value={opt.trim()}>{opt.trim()}</option>
                            ))}
                          </select>
                        )}
                        {attr.type === 'multiselect' && (
                          <div className="space-y-2 border border-[#E5E7EB] rounded-xl px-4 py-3">
                            {attr.options.split(',').map(opt => {
                              const trimmed = opt.trim();
                              const selected: string[] = performerCustomData[attr.label] || [];
                              return (
                                <label key={trimmed} className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={selected.includes(trimmed)}
                                    onChange={e => {
                                      const updated = e.target.checked
                                        ? [...selected, trimmed]
                                        : selected.filter((v: string) => v !== trimmed);
                                      setPerformerCustomData({...performerCustomData, [attr.label]: updated});
                                    }}
                                    className="rounded border-[#E5E7EB]"
                                  />
                                  <span className="text-sm">{trimmed}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddPerformer(false)}
                  className="flex-1 px-6 py-3 border border-[#E5E7EB] rounded-xl font-bold hover:bg-[#F9FAFB]"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-[#4F46E5] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#4338CA] shadow-lg shadow-indigo-100"
                >
                  Save Vocalist
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
                <label className="block text-sm font-bold text-[#374151] mb-1.5">Score (1–10)</label>
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

      {showPerformerDetails && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl"
          >
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#EEF2FF] text-[#4F46E5] rounded-2xl flex items-center justify-center font-bold text-xl">
                  {showPerformerDetails.firstName.charAt(0)}
                </div>
                <div>
                  <h3 className="text-2xl font-bold">{showPerformerDetails.firstName} {showPerformerDetails.lastName}</h3>
                </div>
              </div>
              <button 
                onClick={() => setShowPerformerDetails(null)}
                className="text-[#6B7280] hover:text-[#111827]"
              >
                <XCircle size={24} />
              </button>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-1">Email</p>
                  <p className="font-medium">{showPerformerDetails.email}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-1">Phone</p>
                  <p className="font-medium">{showPerformerDetails.phone || 'N/A'}</p>
                </div>
              </div>

              {showPerformerDetails.customFieldValues && showPerformerDetails.customFieldValues.length > 0 && (
                <div className="pt-4 border-t border-[#E5E7EB]">
                  <p className="text-xs font-bold text-[#4F46E5] uppercase tracking-wider mb-3">Vocal Attributes</p>
                  <div className="grid grid-cols-1 gap-3">
                    {showPerformerDetails.customFieldValues.map(cfv => {
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
                onClick={() => setShowPerformerDetails(null)}
                className="flex-1 bg-[#F3F4F6] text-[#111827] py-3 rounded-xl font-bold hover:bg-[#E5E7EB] transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => startEditPerformer(showPerformerDetails)}
                className="flex-1 bg-[#4F46E5] text-white py-3 rounded-xl font-bold hover:bg-[#4338CA] transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
              >
                <Pencil size={16} />
                Edit
              </button>
            </div>
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
            <p className="text-[#6B7280] text-sm mb-6">
              Set a date and time for {performers.find(p => p.id === showScheduleCallback.performerId)?.firstName} {performers.find(p => p.id === showScheduleCallback.performerId)?.lastName}'s callback.
            </p>
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
      {editingPerformer && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl"
          >
            <h3 className="text-2xl font-bold mb-6">Edit Vocalist</h3>
            <form onSubmit={handleEditPerformer} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-[#374151] mb-1.5">First Name</label>
                  <input
                    required
                    type="text"
                    value={editPerformerData.firstName}
                    onChange={e => setEditPerformerData({...editPerformerData, firstName: e.target.value})}
                    className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-[#374151] mb-1.5">Last Name</label>
                  <input
                    required
                    type="text"
                    value={editPerformerData.lastName}
                    onChange={e => setEditPerformerData({...editPerformerData, lastName: e.target.value})}
                    className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-[#374151] mb-1.5">Email Address</label>
                <input
                  required
                  type="email"
                  value={editPerformerData.email}
                  onChange={e => setEditPerformerData({...editPerformerData, email: e.target.value})}
                  className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-[#374151] mb-1.5">Phone Number</label>
                <input
                  type="tel"
                  value={editPerformerData.phone}
                  onChange={e => setEditPerformerData({...editPerformerData, phone: e.target.value})}
                  className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#4F46E5] outline-none transition-all"
                />
              </div>
              {customAttributes.length > 0 && (
                <div className="pt-4 border-t border-[#E5E7EB] space-y-4">
                  <h4 className="font-bold text-[#4F46E5] text-sm uppercase tracking-wider">Vocal Attributes</h4>
                  <div className="max-h-60 overflow-y-auto pr-2 grid grid-cols-1 gap-4">
                    {customAttributes.map(attr => (
                      <div key={attr.id}>
                        <label className="block text-sm font-bold text-[#374151] mb-1.5">
                          {attr.label} {attr.required && <span className="text-[#EF4444]">*</span>}
                        </label>
                        {attr.type === 'text' && (
                          <input
                            type="text"
                            required={attr.required}
                            value={editPerformerCustomData[attr.label] ?? ''}
                            onChange={e => setEditPerformerCustomData({...editPerformerCustomData, [attr.label]: e.target.value})}
                            className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm"
                          />
                        )}
                        {attr.type === 'number' && (
                          <input
                            type="number"
                            required={attr.required}
                            value={editPerformerCustomData[attr.label] ?? ''}
                            onChange={e => setEditPerformerCustomData({...editPerformerCustomData, [attr.label]: e.target.value})}
                            className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm"
                          />
                        )}
                        {attr.type === 'date' && (
                          <input
                            type="date"
                            required={attr.required}
                            value={editPerformerCustomData[attr.label] ?? ''}
                            onChange={e => setEditPerformerCustomData({...editPerformerCustomData, [attr.label]: e.target.value})}
                            className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm"
                          />
                        )}
                        {attr.type === 'boolean' && (
                          <select
                            required={attr.required}
                            value={editPerformerCustomData[attr.label] === true ? 'true' : editPerformerCustomData[attr.label] === false ? 'false' : ''}
                            onChange={e => setEditPerformerCustomData({...editPerformerCustomData, [attr.label]: e.target.value === 'true'})}
                            className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm bg-white"
                          >
                            <option value="">Select...</option>
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select>
                        )}
                        {attr.type === 'select' && (
                          <select
                            required={attr.required}
                            value={editPerformerCustomData[attr.label] ?? ''}
                            onChange={e => setEditPerformerCustomData({...editPerformerCustomData, [attr.label]: e.target.value})}
                            className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm bg-white"
                          >
                            <option value="">Select...</option>
                            {attr.options.split(',').map(opt => (
                              <option key={opt.trim()} value={opt.trim()}>{opt.trim()}</option>
                            ))}
                          </select>
                        )}
                        {attr.type === 'multiselect' && (
                          <div className="space-y-2 border border-[#E5E7EB] rounded-xl px-4 py-3">
                            {attr.options.split(',').map(opt => {
                              const trimmed = opt.trim();
                              const selected: string[] = editPerformerCustomData[attr.label] || [];
                              return (
                                <label key={trimmed} className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={selected.includes(trimmed)}
                                    onChange={e => {
                                      const updated = e.target.checked
                                        ? [...selected, trimmed]
                                        : selected.filter((v: string) => v !== trimmed);
                                      setEditPerformerCustomData({...editPerformerCustomData, [attr.label]: updated});
                                    }}
                                    className="rounded border-[#E5E7EB]"
                                  />
                                  <span className="text-sm">{trimmed}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingPerformer(null)}
                  className="flex-1 px-6 py-3 border border-[#E5E7EB] rounded-xl font-bold hover:bg-[#F9FAFB]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#4F46E5] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#4338CA] shadow-lg shadow-indigo-100"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
