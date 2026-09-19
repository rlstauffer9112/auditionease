import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import {
  Music,
  Calendar,
  MapPin,
  Clock,
  Loader2,
  LogOut,
  CheckCircle2,
  ChevronDown,
  X,
} from 'lucide-react';

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

export const ApplicantDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [myAuditions, setMyAuditions] = useState<MyAudition[]>([]);
  const [loading, setLoading] = useState(true);
  const [slotPickerAuditionId, setSlotPickerAuditionId] = useState<number | null>(null);
  const [availableSlots, setAvailableSlots] = useState<AuditionSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [bookingSlotId, setBookingSlotId] = useState<number | null>(null);
  const [cancellingAuditionId, setCancellingAuditionId] = useState<number | null>(null);

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

  const fetchMyAuditions = async () => {
    try {
      const res = await authFetch('/api/my-auditions');
      const data = await res.json();
      setMyAuditions(data);
    } catch (err) {
      console.error('Error fetching my auditions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyAuditions();
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
        await fetchMyAuditions();
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
        await fetchMyAuditions();
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <Loader2 className="w-8 h-8 text-[#4F46E5] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans">
      <header className="bg-white border-b border-[#E5E7EB] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#4F46E5] rounded-xl flex items-center justify-center text-white">
              <Music size={24} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">AuditionEase</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-bold">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-[#6B7280]">{user?.email}</p>
            </div>
            <button
              onClick={logout}
              className="p-2 text-[#6B7280] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Sign Out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-10">
          <h2 className="text-3xl font-extrabold tracking-tight mb-2">My Auditions</h2>
          <p className="text-[#6B7280]">View your upcoming auditions and manage your time slots.</p>
        </div>

        {myAuditions.length === 0 ? (
          <div className="bg-white p-16 rounded-3xl border border-[#E5E7EB] text-center shadow-sm">
            <Calendar size={48} className="mx-auto mb-4 text-[#D1D5DB]" />
            <h3 className="text-lg font-bold text-[#374151] mb-2">No Auditions Yet</h3>
            <p className="text-sm text-[#6B7280]">You haven't signed up for any auditions. Use an invite link to register.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {myAuditions.map(audition => (
              <motion.div
                key={audition.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl border border-[#E5E7EB] shadow-sm overflow-hidden"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-[#111827] mb-1">{audition.title}</h3>
                      {audition.description && (
                        <p className="text-sm text-[#6B7280] mb-3">{audition.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-4 text-sm text-[#6B7280]">
                        {audition.date && (
                          <span className="flex items-center gap-1.5">
                            <Calendar size={14} className="text-[#4F46E5]" />
                            {new Date(audition.date + 'T00:00').toLocaleDateString(undefined, {
                              weekday: 'short', year: 'numeric', month: 'long', day: 'numeric'
                            })}
                          </span>
                        )}
                        {audition.location && (
                          <span className="flex items-center gap-1.5">
                            <MapPin size={14} className="text-[#4F46E5]" />
                            {audition.location}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex-shrink-0 ${
                      audition.status === 'open' ? 'bg-[#ECFDF5] text-[#10B981]' :
                      audition.status === 'closed' ? 'bg-[#FEF3C7] text-[#D97706]' :
                      'bg-[#F3F4F6] text-[#6B7280]'
                    }`}>
                      {audition.status}
                    </span>
                  </div>

                  <div className="mt-5 pt-5 border-t border-[#F3F4F6]">
                    {audition.slot ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-[#ECFDF5] rounded-xl">
                            <CheckCircle2 size={20} className="text-[#10B981]" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-[#10B981] uppercase tracking-wider mb-0.5">Your Time Slot</p>
                            <p className="font-bold text-[#111827]">
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
                              className="px-4 py-2 border border-[#E5E7EB] rounded-xl text-sm font-bold text-[#4F46E5] hover:bg-[#EEF2FF] transition-colors"
                            >
                              Change Time Slot
                            </button>
                            <button
                              onClick={() => cancelSlot(audition.id)}
                              disabled={cancellingAuditionId === audition.id}
                              className="px-4 py-2 border border-[#E5E7EB] rounded-xl text-sm font-bold text-[#EF4444] hover:bg-[#FEF2F2] transition-colors disabled:opacity-50"
                            >
                              {cancellingAuditionId === audition.id ? <Loader2 size={16} className="animate-spin" /> : 'Cancel Time Slot'}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-[#FEF3C7] rounded-xl">
                            <Clock size={20} className="text-[#D97706]" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[#6B7280]">No time slot selected</p>
                          </div>
                        </div>
                        {audition.status === 'open' && (
                          <button
                            onClick={() => openSlotPicker(audition.id)}
                            className="px-5 py-2.5 bg-[#4F46E5] text-white rounded-xl text-sm font-bold hover:bg-[#4338CA] transition-colors shadow-lg shadow-indigo-100"
                          >
                            Sign Up for Time Slot
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>

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
    </div>
  );
};
