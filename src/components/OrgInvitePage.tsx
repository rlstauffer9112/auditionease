import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Building2, Loader2, CheckCircle, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface OrgInvitePageProps {
  token: string;
}

export const OrgInvitePage: React.FC<OrgInvitePageProps> = ({ token }) => {
  const { loginWithToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [orgName, setOrgName] = useState('');
  const [role, setRole] = useState('');
  const [needsProfile, setNeedsProfile] = useState(false);
  const [alreadyAccepted, setAlreadyAccepted] = useState(false);
  const [error, setError] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    fetch(`/api/org-invite/${token}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else if (data.alreadyAccepted) {
          setAlreadyAccepted(true);
          setOrgName(data.orgName);
        } else {
          setOrgName(data.orgName);
          setRole(data.role);
          setNeedsProfile(data.needsProfile);
        }
      })
      .catch(() => setError('Failed to load invite'))
      .finally(() => setLoading(false));
  }, [token]);

  async function accept() {
    if (needsProfile && (!firstName.trim() || !lastName.trim())) return;
    setAccepting(true);
    setError('');
    try {
      const res = await fetch(`/api/org-invite/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAccepted(true);
      loginWithToken(data.sessionToken, data.user);
      setTimeout(() => {
        window.history.pushState({}, '', '/');
        window.location.reload();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to accept invite');
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#4F46E5]" size={32} />
      </div>
    );
  }

  if (error && !orgName) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl border border-[#E5E7EB] shadow-sm p-8 max-w-md w-full text-center"
        >
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Building2 size={32} className="text-red-500" />
          </div>
          <h2 className="text-xl font-extrabold mb-2">Invalid Invite</h2>
          <p className="text-[#6B7280]">{error}</p>
        </motion.div>
      </div>
    );
  }

  if (alreadyAccepted) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl border border-[#E5E7EB] shadow-sm p-8 max-w-md w-full text-center"
        >
          <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={32} className="text-green-500" />
          </div>
          <h2 className="text-xl font-extrabold mb-2">Already Accepted</h2>
          <p className="text-[#6B7280]">You've already accepted the invitation to <strong>{orgName}</strong>.</p>
          <button
            onClick={() => { window.history.pushState({}, '', '/'); window.location.reload(); }}
            className="mt-6 bg-[#4F46E5] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#4338CA] transition-colors"
          >
            Go to Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl border border-[#E5E7EB] shadow-sm p-8 max-w-md w-full text-center"
        >
          <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={32} className="text-green-500" />
          </div>
          <h2 className="text-xl font-extrabold mb-2">Welcome!</h2>
          <p className="text-[#6B7280]">You've joined <strong>{orgName}</strong>. Redirecting to your dashboard...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl border border-[#E5E7EB] shadow-sm p-8 max-w-md w-full"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#EEF2FF] rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Building2 size={32} className="text-[#4F46E5]" />
          </div>
          <h2 className="text-xl font-extrabold mb-2">You're Invited!</h2>
          <p className="text-[#6B7280]">
            You've been invited to join <strong>{orgName}</strong> as {role === 'admin' ? 'an Admin' : 'a Manager'}.
          </p>
        </div>

        {needsProfile && (
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-[#374151] mb-1">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#374151] mb-1">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5] focus:border-transparent"
              />
            </div>
          </div>
        )}

        {error && <p className="text-red-600 text-sm mb-4 text-center">{error}</p>}

        <button
          onClick={accept}
          disabled={accepting || (needsProfile && (!firstName.trim() || !lastName.trim()))}
          className="w-full bg-[#4F46E5] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#4338CA] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {accepting ? <Loader2 className="animate-spin" size={18} /> : <UserPlus size={18} />}
          Accept Invitation
        </button>
      </motion.div>
    </div>
  );
};
