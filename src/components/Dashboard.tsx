import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import {
  Plus,
  Calendar,
  MapPin,
  Clock,
  Users,
  Loader2,
  CheckCircle2,
  ChevronRight,
  X,
  Mic2,
  FolderTree,
  Building2,
} from 'lucide-react';
import { DivisionAttributesEditor } from './DivisionAttributesEditor';

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

interface AuditionSlot {
  id: number;
  auditionId: number;
  userId: number | null;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
}

interface MyAudition {
  id: number;
  title: string;
  description: string;
  date: string;
  location: string;
  status: string;
  slot: AuditionSlot | null;
}

interface OwnedAudition {
  id: number;
  title: string;
  description: string;
  date: string;
  location: string;
  status: 'open' | 'closed' | 'completed';
  inviteCode: string;
  divisionId: number | null;
  divisionTitle: string | null;
  createdAt: string;
  userCount: number;
  openSlots: number;
  filledSlots: number;
}

interface DashboardProps {
  ownedAuditions: OwnedAudition[];
  myAuditions: MyAudition[];
  authFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  onNavigate: (tab: string) => void;
  onSelectAudition: (audition: OwnedAudition) => void;
  onCreateAudition: () => void;
  onRefresh: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  ownedAuditions,
  myAuditions,
  authFetch,
  onNavigate,
  onSelectAudition,
  onCreateAudition,
  onRefresh,
}) => {
  const { user } = useAuth();
  const [slotPickerAuditionId, setSlotPickerAuditionId] = useState<number | null>(null);
  const [availableSlots, setAvailableSlots] = useState<AuditionSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [bookingSlotId, setBookingSlotId] = useState<number | null>(null);
  const [cancellingAuditionId, setCancellingAuditionId] = useState<number | null>(null);
  const [myDivisions, setMyDivisions] = useState<{ id: number; title: string; orgName: string; createdAt: string }[]>([]);

  useEffect(() => {
    authFetch('/api/my-divisions')
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setMyDivisions(data); })
      .catch(() => {});
  }, []);

  const openSlotPicker = async (auditionId: number) => {
    setSlotPickerAuditionId(auditionId);
    setSlotsLoading(true);
    try {
      const res = await authFetch(`/api/auditions/${auditionId}/available-slots`);
      const data = await res.json();
      setAvailableSlots(data);
    } catch (err) {
      console.error('Error fetching slots:', err);
    } finally {
      setSlotsLoading(false);
    }
  };

  const bookSlot = async (auditionId: number, slotId: number) => {
    setBookingSlotId(slotId);
    try {
      const res = await authFetch(`/api/auditions/${auditionId}/book-slot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId }),
      });
      if (res.ok) {
        onRefresh();
        setSlotPickerAuditionId(null);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to book slot');
      }
    } catch (err) {
      console.error('Error booking slot:', err);
    } finally {
      setBookingSlotId(null);
    }
  };

  const cancelSlot = async (auditionId: number) => {
    setCancellingAuditionId(auditionId);
    try {
      const res = await authFetch(`/api/auditions/${auditionId}/cancel-slot`, {
        method: 'POST',
      });
      if (res.ok) {
        onRefresh();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to cancel slot');
      }
    } catch (err) {
      console.error('Error cancelling slot:', err);
    } finally {
      setCancellingAuditionId(null);
    }
  };

  const slotsByDate = availableSlots.reduce<Record<string, AuditionSlot[]>>((groups, slot) => {
    const key = slot.date || 'Unscheduled';
    if (!groups[key]) groups[key] = [];
    groups[key].push(slot);
    return groups;
  }, {});

  const statusBadge = (status: string) => (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex-shrink-0 ${
      status === 'open' ? 'bg-[#ECFDF5] text-[#10B981]' :
      status === 'closed' ? 'bg-[#FEF3C7] text-[#D97706]' :
      'bg-[#F3F4F6] text-[#6B7280]'
    }`}>
      {status}
    </span>
  );

  return (
    <>
      <motion.div
        key="dashboard"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="max-w-5xl mx-auto"
      >
        <div className="mb-10">
          <h2 className="text-3xl font-extrabold tracking-tight mb-2">
            Welcome back, {user?.firstName}!
          </h2>
          <p className="text-[#6B7280]">Here's an overview of your auditions and activity.</p>
        </div>

        {myAuditions.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-xl font-bold text-[#111827]">Auditions You've Joined</h3>
                <p className="text-sm text-[#6B7280]">Auditions you've signed up for via invite link.</p>
              </div>
            </div>
            <div className="space-y-4">
              {myAuditions.map(audition => (
                <div
                  key={audition.id}
                  className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden p-5"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-[#ECFDF5] text-[#10B981] rounded-xl flex-shrink-0">
                        <Calendar size={18} />
                      </div>
                      <div>
                        <h4 className="font-bold text-[#111827]">{audition.title}</h4>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-[#6B7280]">
                          {audition.date && (
                            <span className="flex items-center gap-1">
                              <Calendar size={12} className="text-[#4F46E5]" />
                              {new Date(audition.date + 'T00:00').toLocaleDateString(undefined, {
                                weekday: 'short', month: 'short', day: 'numeric'
                              })}
                            </span>
                          )}
                          {audition.location && (
                            <span className="flex items-center gap-1">
                              <MapPin size={12} className="text-[#4F46E5]" />
                              {audition.location}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {statusBadge(audition.status)}
                  </div>

                  <div className="mt-4 pt-4 border-t border-[#F3F4F6]">
                    {audition.slot ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-[#ECFDF5] rounded-xl">
                            <CheckCircle2 size={18} className="text-[#10B981]" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-[#10B981] uppercase tracking-wider mb-0.5">Your Time Slot</p>
                            <p className="font-bold text-sm text-[#111827]">
                              {new Date(audition.slot.date + 'T00:00').toLocaleDateString(undefined, {
                                weekday: 'short', month: 'short', day: 'numeric'
                              })}
                              {' '}&middot;{' '}
                              {formatTime(audition.slot.startTime)} &ndash; {formatTime(audition.slot.endTime)}
                            </p>
                          </div>
                        </div>
                        {audition.status === 'open' && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openSlotPicker(audition.id)}
                              className="px-3 py-1.5 border border-[#E5E7EB] rounded-xl text-xs font-bold text-[#4F46E5] hover:bg-[#EEF2FF] transition-colors"
                            >
                              Change
                            </button>
                            <button
                              onClick={() => cancelSlot(audition.id)}
                              disabled={cancellingAuditionId === audition.id}
                              className="px-3 py-1.5 border border-[#E5E7EB] rounded-xl text-xs font-bold text-[#EF4444] hover:bg-[#FEF2F2] transition-colors disabled:opacity-50"
                            >
                              {cancellingAuditionId === audition.id ? <Loader2 size={14} className="animate-spin" /> : 'Cancel'}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-[#FEF3C7] rounded-xl">
                            <Clock size={18} className="text-[#D97706]" />
                          </div>
                          <p className="text-sm font-medium text-[#6B7280]">No time slot selected</p>
                        </div>
                        {audition.status === 'open' && (
                          <button
                            onClick={() => openSlotPicker(audition.id)}
                            className="px-4 py-2 bg-[#4F46E5] text-white rounded-xl text-xs font-bold hover:bg-[#4338CA] transition-colors shadow-sm"
                          >
                            Sign Up for Time Slot
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {myDivisions.length > 0 && (
          <div className="mb-10">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-xl font-bold text-[#111827]">My Divisions</h3>
                <p className="text-sm text-[#6B7280]">Divisions you manage within your organization.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myDivisions.map(div => (
                <div
                  key={div.id}
                  className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-sm"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-[#EEF2FF] text-[#4F46E5] rounded-xl flex-shrink-0">
                      <FolderTree size={18} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-[#111827] truncate">{div.title}</h4>
                      <p className="text-xs text-[#6B7280] flex items-center gap-1 mt-0.5">
                        <Building2 size={11} />
                        {div.orgName}
                      </p>
                    </div>
                  </div>
                  <DivisionAttributesEditor divisionId={div.id} authFetch={authFetch} />
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-xl font-bold text-[#111827]">Your Auditions</h3>
              <p className="text-sm text-[#6B7280]">Auditions you've created and manage.</p>
            </div>
            <button
              onClick={() => onNavigate('auditions')}
              className="text-sm font-bold text-[#4F46E5] hover:underline flex items-center gap-1"
            >
              View All <ChevronRight size={16} />
            </button>
          </div>

          {ownedAuditions.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-[#E5E7EB] text-center shadow-sm">
              <Mic2 size={40} className="mx-auto mb-3 text-[#D1D5DB]" />
              <h4 className="text-lg font-bold text-[#374151] mb-2">No Auditions Yet</h4>
              <p className="text-sm text-[#6B7280] mb-5">Create your first audition and invite applicants to sign up.</p>
              <button
                onClick={onCreateAudition}
                className="bg-[#4F46E5] text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-[#4338CA] transition-colors shadow-lg shadow-indigo-100 inline-flex items-center gap-2"
              >
                <Plus size={18} />
                Create Audition
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ownedAuditions.slice(0, 6).map(audition => (
                <button
                  key={audition.id}
                  onClick={() => onSelectAudition(audition)}
                  className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-sm text-left hover:border-[#4F46E5] hover:shadow-md transition-all group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-[#EEF2FF] text-[#4F46E5] rounded-xl flex-shrink-0">
                        <Mic2 size={18} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-[#111827] truncate group-hover:text-[#4F46E5] transition-colors">{audition.title}</h4>
                        {audition.date && (
                          <p className="text-xs text-[#6B7280] mt-0.5">
                            {new Date(audition.date + 'T00:00').toLocaleDateString(undefined, {
                              weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                    {statusBadge(audition.status)}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[#6B7280]">
                    <span className="flex items-center gap-1">
                      <Users size={13} />
                      {audition.userCount} applicant{audition.userCount !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={13} />
                      {audition.openSlots} open / {audition.filledSlots} filled
                    </span>
                    {audition.divisionTitle && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-[#EEF2FF] text-[#4F46E5] rounded-full font-medium">
                        <FolderTree size={11} />
                        {audition.divisionTitle}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {slotPickerAuditionId !== null && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-lg rounded-3xl shadow-2xl max-h-[80vh] flex flex-col"
            >
              <div className="flex items-center justify-between p-6 border-b border-[#E5E7EB]">
                <h3 className="text-xl font-bold">Choose a Time Slot</h3>
                <button
                  onClick={() => setSlotPickerAuditionId(null)}
                  className="p-1.5 text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1">
                {slotsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-[#4F46E5]" />
                  </div>
                ) : Object.keys(slotsByDate).length === 0 ? (
                  <div className="text-center py-12 text-[#6B7280]">
                    <Clock size={40} className="mx-auto mb-3 text-[#D1D5DB]" />
                    <p className="font-bold text-[#374151] mb-1">No Slots Available</p>
                    <p className="text-sm">There are no available time slots for this audition right now.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {(Object.entries(slotsByDate) as [string, AuditionSlot[]][]).sort(([a], [b]) => a.localeCompare(b)).map(([date, dateSlots]) => (
                      <div key={date}>
                        <p className="text-xs font-bold text-[#4F46E5] uppercase tracking-wider mb-3 flex items-center gap-2">
                          <Calendar size={14} />
                          {date === 'Unscheduled' ? date : new Date(date + 'T00:00').toLocaleDateString(undefined, {
                            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                          })}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {dateSlots.sort((a, b) => a.startTime.localeCompare(b.startTime)).map(slot => {
                            const isMySlot = slot.userId === user?.id && slot.status === 'booked';
                            const isBooking = bookingSlotId === slot.id;
                            return (
                              <button
                                key={slot.id}
                                disabled={isMySlot || isBooking}
                                onClick={() => bookSlot(slotPickerAuditionId, slot.id)}
                                className={`p-3 rounded-xl border text-left transition-all ${
                                  isMySlot
                                    ? 'bg-[#EEF2FF] border-[#4F46E5] cursor-default'
                                    : 'border-[#E5E7EB] hover:border-[#4F46E5] hover:bg-[#F9FAFB] cursor-pointer'
                                } ${isBooking ? 'opacity-50' : ''}`}
                              >
                                <p className="font-bold text-sm text-[#111827]">
                                  {formatTime(slot.startTime)} &ndash; {formatTime(slot.endTime)}
                                </p>
                                {isMySlot && (
                                  <p className="text-xs font-bold text-[#4F46E5] mt-1 flex items-center gap-1">
                                    <CheckCircle2 size={12} /> Current slot
                                  </p>
                                )}
                                {isBooking && (
                                  <Loader2 size={14} className="animate-spin text-[#4F46E5] mt-1" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
