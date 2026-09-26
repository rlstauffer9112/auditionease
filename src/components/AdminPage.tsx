import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { BarChart3, Users, Calendar, CreditCard, Mail, Clock, TrendingUp, Activity } from 'lucide-react';

interface AdminStats {
  totalUsers: number;
  totalAuditions: number;
  totalSubscriptions: number;
  totalInviteSignups: number;
  totalSlots: number;
  bookedSlots: number;
  completedSlots: number;
  totalRounds: number;
  openRounds: number;
  closedRounds: number;
  totalEvaluations: number;
  subscriptionsByPlan: { plan: string; count: number }[];
  auditionsByStatus: { status: string; count: number }[];
  recentUsers: { id: number; firstName: string; lastName: string; email: string; createdAt: string }[];
  usersCreatedLast30Days: number;
  auditionsCreatedLast30Days: number;
}

interface AdminPageProps {
  authFetch: (url: string, opts?: RequestInit) => Promise<Response>;
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4 sm:p-6 shadow-sm min-w-0">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
        <span className="text-sm text-[#6B7280] font-medium">{label}</span>
      </div>
      <p className="text-2xl sm:text-3xl font-extrabold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-[#9CA3AF] mt-1">{sub}</p>}
    </div>
  );
}

export function AdminPage({ authFetch }: AdminPageProps) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    authFetch('/api/admin/stats')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load admin stats');
        const data = await res.json();
        setStats(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-[#4F46E5] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 p-6 rounded-2xl border border-red-200">
        {error}
      </div>
    );
  }

  if (!stats) return null;

  const slotUtilization = stats.totalSlots > 0
    ? Math.round((stats.bookedSlots + stats.completedSlots) / stats.totalSlots * 100)
    : 0;

  return (
    <motion.div
      key="admin"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-6xl mx-auto"
    >
      <div className="mb-6 sm:mb-10">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">Admin Dashboard</h2>
        <p className="text-[#6B7280]">System-wide statistics and platform health.</p>
      </div>

      {/* Primary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard icon={Users} label="Total Users" value={stats.totalUsers} sub={`${stats.usersCreatedLast30Days} in last 30 days`} color="bg-[#4F46E5]" />
        <StatCard icon={Calendar} label="Total Auditions" value={stats.totalAuditions} sub={`${stats.auditionsCreatedLast30Days} in last 30 days`} color="bg-[#059669]" />
        <StatCard icon={CreditCard} label="Active Subscriptions" value={stats.totalSubscriptions} color="bg-[#D97706]" />
        <StatCard icon={Mail} label="Invite Signups" value={stats.totalInviteSignups} color="bg-[#7C3AED]" />
      </div>

      {/* Slot & round stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <StatCard icon={Clock} label="Total Slots" value={stats.totalSlots} sub={`${slotUtilization}% utilization`} color="bg-[#0891B2]" />
        <StatCard icon={Activity} label="Booked Slots" value={stats.bookedSlots} color="bg-[#2563EB]" />
        <StatCard icon={TrendingUp} label="Completed Slots" value={stats.completedSlots} color="bg-[#16A34A]" />
        <StatCard icon={BarChart3} label="Rounds" value={stats.totalRounds} sub={`${stats.openRounds} open / ${stats.closedRounds} closed · ${stats.totalEvaluations} evaluations`} color="bg-[#DC2626]" />
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
        {/* Subscriptions by plan */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-sm">
          <h3 className="text-lg font-bold mb-4">Subscriptions by Plan</h3>
          {stats.subscriptionsByPlan.length === 0 ? (
            <p className="text-sm text-[#9CA3AF]">No active subscriptions</p>
          ) : (
            <div className="space-y-3">
              {stats.subscriptionsByPlan.map((item) => (
                <div key={item.plan} className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">{item.plan}</span>
                  <span className="text-sm font-bold bg-[#F3F4F6] px-3 py-1 rounded-lg">{item.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Auditions by status */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-sm">
          <h3 className="text-lg font-bold mb-4">Auditions by Status</h3>
          {stats.auditionsByStatus.length === 0 ? (
            <p className="text-sm text-[#9CA3AF]">No auditions</p>
          ) : (
            <div className="space-y-3">
              {stats.auditionsByStatus.map((item) => (
                <div key={item.status} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      item.status === 'open' ? 'bg-green-500' :
                      item.status === 'closed' ? 'bg-red-500' :
                      'bg-gray-400'
                    }`} />
                    <span className="text-sm font-medium capitalize">{item.status}</span>
                  </div>
                  <span className="text-sm font-bold bg-[#F3F4F6] px-3 py-1 rounded-lg">{item.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent users */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-[#E5E7EB]">
          <h3 className="text-lg font-bold">Recent Users</h3>
        </div>
        <table className="w-full table-fixed sm:table-auto">
          <thead>
            <tr className="bg-[#F9FAFB]">
              <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-bold text-[#6B7280] uppercase tracking-wider">ID</th>
              <th className="px-4 sm:px-6 py-3 text-left text-xs font-bold text-[#6B7280] uppercase tracking-wider">Name</th>
              <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-bold text-[#6B7280] uppercase tracking-wider">Email</th>
              <th className="w-28 sm:w-auto px-4 sm:px-6 py-3 text-left text-xs font-bold text-[#6B7280] uppercase tracking-wider">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB]">
            {stats.recentUsers.map((u) => (
              <tr key={u.id} className="hover:bg-[#F9FAFB] transition-colors">
                <td className="hidden sm:table-cell px-6 py-4 text-sm text-[#9CA3AF]">#{u.id}</td>
                <td className="px-4 sm:px-6 py-4 text-sm font-medium">
                  <span className="block truncate sm:whitespace-normal">{u.firstName} {u.lastName}</span>
                  <span className="block sm:hidden text-xs font-normal text-[#6B7280] truncate">{u.email}</span>
                </td>
                <td className="hidden sm:table-cell px-6 py-4 text-sm text-[#6B7280]">{u.email}</td>
                <td className="px-4 sm:px-6 py-4 text-sm text-[#6B7280]">
                  {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
