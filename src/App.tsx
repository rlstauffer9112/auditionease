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
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthPage } from './components/AuthPage';
import { VerifyPage } from './components/VerifyPage';
import { LandingPage } from './components/LandingPage';
import { LogOut } from 'lucide-react';

// --- Types ---
interface Performer {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  notes: string;
  customFields: string; // JSON string
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
  const [newAudition, setNewAudition] = useState({ title: '', description: '', date: '', location: '' });
  const [newPerformer, setNewPerformer] = useState({ firstName: '', lastName: '', email: '', phone: '', notes: '' });
  const [performerCustomData, setPerformerCustomData] = useState<Record<string, any>>({});

  // Settings states
  const [setupTab, setSetupTab] = useState<'general' | 'attributes'>('general');
  const [newAttr, setNewAttr] = useState({ label: '', type: 'text' as any, options: '', required: false });

  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  const [showPerformerDetails, setShowPerformerDetails] = useState<Performer | null>(null);

  const navigateToLogin = () => {
    window.history.pushState({}, '', '/login');
    setCurrentPath('/login');
  };

  const navigateToHome = () => {
    window.history.pushState({}, '', '/');
    setCurrentPath('/');
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
        fetch('/api/auditions'),
        fetch('/api/performers'),
        fetch('/api/custom-attributes')
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
      const res = await fetch(`/api/auditions/${auditionId}/slots`);
      const data = await res.json();
      setSlots(data);
    } catch (err) {
      console.error('Error fetching slots:', err);
    }
  };

  const handleAddAudition = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auditions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAudition)
      });
      if (res.ok) {
        fetchData();
        setShowAddAudition(false);
        setNewAudition({ title: '', description: '', date: '', location: '' });
      }
    } catch (err) {
      console.error('Error adding audition:', err);
    }
  };

  const handleAddPerformer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/performers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newPerformer,
          customFields: JSON.stringify(performerCustomData)
        })
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

  const handleAddAttribute = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/custom-attributes', {
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
      const res = await fetch(`/api/custom-attributes/${id}`, { method: 'DELETE' });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Error deleting attribute:', err);
    }
  };

  const handleSelectAudition = (audition: Audition) => {
    setSelectedAudition(audition);
    fetchSlots(audition.id);
  };

  const handleBookSlot = async (slotId: number, performerId: number) => {
    try {
      const res = await fetch(`/api/slots/${slotId}`, {
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
      const res = await fetch(`/api/slots/${slotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, feedback, passedToCallback, status: 'completed' })
      });
      if (res.ok && selectedAudition) {
        fetchSlots(selectedAudition.id);
        if (passedToCallback) {
          const slot = slots.find(s => s.id === slotId);
          if (slot && slot.performerId) {
            await fetch('/api/callbacks', {
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
                  onClick={() => setShowAddAudition(true)}
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
                                          await fetch(`/api/slots/${slot.id}`, {
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
                                        const score = prompt("Enter score (1-10):");
                                        const feedback = prompt("Enter feedback:");
                                        const pass = confirm("Pass to callback?");
                                        if (score) handleCompleteAudition(slot.id, parseInt(score), feedback || '', pass);
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
                    {performers.map(performer => (
                      <tr key={performer.id} className="hover:bg-[#F9FAFB] transition-colors group">
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
                          <button 
                            onClick={() => setShowPerformerDetails(performer)}
                            className="text-[#6B7280] hover:text-[#4F46E5] transition-colors"
                          >
                            <ChevronRight size={20} />
                          </button>
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
              <div className="mb-10">
                <h2 className="text-3xl font-extrabold tracking-tight mb-2">Section Placement</h2>
                <p className="text-[#6B7280]">Final decisions for singers who passed the initial round.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {['pending', 'accepted', 'rejected'].map(status => (
                  <div key={status} className="flex flex-col gap-4">
                    <div className="flex items-center justify-between px-2">
                      <h3 className="font-bold uppercase tracking-widest text-xs text-[#6B7280]">{status}</h3>
                      <span className="bg-[#E5E7EB] text-[#4B5563] px-2 py-0.5 rounded-md text-[10px] font-bold">0</span>
                    </div>
                    <div className="bg-[#F3F4F6] p-4 rounded-3xl min-h-[400px] border-2 border-dashed border-[#E5E7EB]">
                      <div className="flex flex-col items-center justify-center h-full text-[#9CA3AF] gap-2">
                        <Search size={32} strokeWidth={1.5} />
                        <p className="text-sm font-medium">No vocalists yet</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
                            <option value="select">Dropdown</option>
                          </select>
                        </div>
                        {newAttr.type === 'select' && (
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
                      customAttributes.map(attr => (
                        <div key={attr.id} className="bg-white p-4 rounded-2xl border border-[#E5E7EB] flex items-center justify-between">
                          <div>
                            <p className="font-bold">{attr.label}</p>
                            <p className="text-xs text-[#6B7280] uppercase tracking-wider">{attr.type} {attr.required ? '• Required' : ''}</p>
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
              await Promise.all(slotsToCreate.map(s => fetch('/api/slots', {
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

              {showPerformerDetails.customFields && (
                <div className="pt-4 border-t border-[#E5E7EB]">
                  <p className="text-xs font-bold text-[#4F46E5] uppercase tracking-wider mb-3">Vocal Attributes</p>
                  <div className="grid grid-cols-1 gap-3">
                    {Object.entries(JSON.parse(showPerformerDetails.customFields)).map(([label, value]) => (
                      <div key={label} className="flex justify-between items-center py-2 border-b border-[#F3F4F6] last:border-0">
                        <span className="text-sm font-medium text-[#6B7280]">{label}</span>
                        <span className="text-sm font-bold text-[#111827]">
                          {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button 
              onClick={() => setShowPerformerDetails(null)}
              className="w-full mt-8 bg-[#F3F4F6] text-[#111827] py-3 rounded-xl font-bold hover:bg-[#E5E7EB] transition-colors"
            >
              Close
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
