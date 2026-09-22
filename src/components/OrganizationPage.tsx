import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Building2,
  Users,
  FolderTree,
  Save,
  Plus,
  Pencil,
  Trash2,
  Mail,
  Loader2,
  Check,
  X,
  UserPlus,
  ChevronDown,
  Shield,
  UserCog,
} from 'lucide-react';
import { DivisionAttributesEditor } from './DivisionAttributesEditor';

interface OrgUser {
  id: number;
  userId: number;
  role: 'admin' | 'manager';
  status: 'pending' | 'accepted';
  invitedAt: string;
  acceptedAt: string | null;
  firstName: string;
  lastName: string;
  email: string;
}

interface Division {
  id: number;
  title: string;
  createdAt: string;
  managers: { userId: number; firstName: string; lastName: string; email: string }[];
}

interface Organization {
  id: number;
  name: string;
  ownerId: number;
  createdAt: string;
}

interface Props {
  authFetch: (url: string, opts?: RequestInit) => Promise<Response>;
}

export function OrganizationPage({ authFetch }: Props) {
  const [activeTab, setActiveTab] = useState<'settings' | 'divisions' | 'users'>('settings');
  const [org, setOrg] = useState<Organization | null>(null);
  const [orgRole, setOrgRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgName, setOrgName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Create org state
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Divisions state
  const [divisionsList, setDivisionsList] = useState<Division[]>([]);
  const [divisionsLoading, setDivisionsLoading] = useState(false);
  const [showAddDivision, setShowAddDivision] = useState(false);
  const [newDivisionTitle, setNewDivisionTitle] = useState('');
  const [editingDivision, setEditingDivision] = useState<Division | null>(null);
  const [editDivisionTitle, setEditDivisionTitle] = useState('');
  const [divisionSaving, setDivisionSaving] = useState(false);
  const [deletingDivisionId, setDeletingDivisionId] = useState<number | null>(null);
  const [assignManagerDivId, setAssignManagerDivId] = useState<number | null>(null);
  const [assignManagerUserId, setAssignManagerUserId] = useState('');

  // Users state
  const [members, setMembers] = useState<OrgUser[]>([]);
  const [owner, setOwner] = useState<{ id: number; firstName: string; lastName: string; email: string } | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'manager'>('manager');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  const isOwnerOrAdmin = orgRole === 'owner' || orgRole === 'admin';

  useEffect(() => { fetchOrg(); }, []);

  async function fetchOrg() {
    setLoading(true);
    try {
      const res = await authFetch('/api/organization');
      const data = await res.json();
      setOrg(data.organization);
      setOrgRole(data.role);
      if (data.organization) setOrgName(data.organization.name);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  async function createOrg() {
    if (!createName.trim()) return;
    setCreating(true);
    setCreateError('');
    try {
      const res = await authFetch('/api/organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: createName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOrg(data.organization);
      setOrgRole('owner');
      setOrgName(data.organization.name);
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create organization');
    } finally {
      setCreating(false);
    }
  }

  async function saveOrgName() {
    if (!orgName.trim()) return;
    setSaving(true);
    setSaveMessage('');
    try {
      const res = await authFetch('/api/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOrg(data.organization);
      setSaveMessage('Saved!');
      setTimeout(() => setSaveMessage(''), 2000);
    } catch (err: any) {
      setSaveMessage(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function fetchDivisions() {
    setDivisionsLoading(true);
    try {
      const res = await authFetch('/api/organization/divisions');
      const data = await res.json();
      setDivisionsList(data.divisions || []);
    } catch {
    } finally {
      setDivisionsLoading(false);
    }
  }

  async function createDivision() {
    if (!newDivisionTitle.trim()) return;
    setDivisionSaving(true);
    try {
      const res = await authFetch('/api/organization/divisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newDivisionTitle.trim() }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setNewDivisionTitle('');
      setShowAddDivision(false);
      fetchDivisions();
    } catch {
    } finally {
      setDivisionSaving(false);
    }
  }

  async function updateDivision() {
    if (!editingDivision || !editDivisionTitle.trim()) return;
    setDivisionSaving(true);
    try {
      await authFetch(`/api/organization/divisions/${editingDivision.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editDivisionTitle.trim() }),
      });
      setEditingDivision(null);
      fetchDivisions();
    } catch {
    } finally {
      setDivisionSaving(false);
    }
  }

  async function deleteDivision(id: number) {
    setDeletingDivisionId(id);
    try {
      await authFetch(`/api/organization/divisions/${id}`, { method: 'DELETE' });
      fetchDivisions();
    } catch {
    } finally {
      setDeletingDivisionId(null);
    }
  }

  async function assignManager(divId: number) {
    if (!assignManagerUserId) return;
    try {
      const res = await authFetch(`/api/organization/divisions/${divId}/managers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerId: parseInt(assignManagerUserId) }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setAssignManagerDivId(null);
      setAssignManagerUserId('');
      fetchDivisions();
    } catch {
    }
  }

  async function removeManager(divId: number, managerId: number) {
    try {
      await authFetch(`/api/organization/divisions/${divId}/managers/${managerId}`, { method: 'DELETE' });
      fetchDivisions();
    } catch {
    }
  }

  async function fetchUsers() {
    setUsersLoading(true);
    try {
      const res = await authFetch('/api/organization/users');
      const data = await res.json();
      setMembers(data.members || []);
      setOwner(data.owner || null);
    } catch {
    } finally {
      setUsersLoading(false);
    }
  }

  async function inviteUser() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError('');
    setInviteSuccess('');
    try {
      const res = await authFetch('/api/organization/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setInviteSuccess(`Invitation sent to ${inviteEmail.trim()}`);
      setInviteEmail('');
      setInviteRole('manager');
      fetchUsers();
      setTimeout(() => setInviteSuccess(''), 3000);
    } catch (err: any) {
      setInviteError(err.message || 'Failed to send invite');
    } finally {
      setInviting(false);
    }
  }

  async function removeUser(orgUserId: number) {
    try {
      await authFetch(`/api/organization/users/${orgUserId}`, { method: 'DELETE' });
      fetchUsers();
    } catch {
    }
  }

  async function updateUserRole(orgUserId: number, role: 'admin' | 'manager') {
    try {
      await authFetch(`/api/organization/users/${orgUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      fetchUsers();
    } catch {
    }
  }

  useEffect(() => {
    if (org && activeTab === 'divisions') fetchDivisions();
    if (org && activeTab === 'users') fetchUsers();
  }, [activeTab, org]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-[#4F46E5]" size={32} />
      </div>
    );
  }

  if (!org) {
    return (
      <motion.div
        key="create-org"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-lg mx-auto mt-20"
      >
        <div className="bg-white rounded-3xl border border-[#E5E7EB] shadow-sm p-8 text-center">
          <div className="w-16 h-16 bg-[#EEF2FF] rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Building2 size={32} className="text-[#4F46E5]" />
          </div>
          <h2 className="text-2xl font-extrabold mb-2">Create Your Organization</h2>
          <p className="text-[#6B7280] mb-6">Set up your organization to manage divisions, invite team members, and assign roles.</p>
          <input
            type="text"
            placeholder="Organization name"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createOrg()}
            className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 mb-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5] focus:border-transparent"
          />
          {createError && <p className="text-red-600 text-sm mb-4">{createError}</p>}
          <button
            onClick={createOrg}
            disabled={creating || !createName.trim()}
            className="w-full bg-[#4F46E5] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#4338CA] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {creating ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
            Create Organization
          </button>
        </div>
      </motion.div>
    );
  }

  const tabs = [
    { key: 'settings' as const, label: 'General', icon: Building2 },
    { key: 'divisions' as const, label: 'Divisions', icon: FolderTree },
    { key: 'users' as const, label: 'Users', icon: Users },
  ];

  const acceptedManagers = members.filter(m => m.role === 'manager' && m.status === 'accepted');

  return (
    <motion.div
      key="organization"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-5xl mx-auto"
    >
      <div className="mb-10">
        <h2 className="text-3xl font-extrabold tracking-tight mb-2">Organization</h2>
        <p className="text-[#6B7280]">Manage your organization settings, divisions, and team members.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#F3F4F6] rounded-2xl p-1 mb-8 w-fit">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-white text-[#111827] shadow-sm'
                : 'text-[#6B7280] hover:text-[#374151]'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* General Settings Tab */}
        {activeTab === 'settings' && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="bg-white rounded-3xl border border-[#E5E7EB] shadow-sm p-8">
              <h3 className="text-lg font-bold mb-6">General Settings</h3>
              <div className="max-w-md">
                <label className="block text-sm font-medium text-[#374151] mb-2">Organization Name</label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  disabled={!isOwnerOrAdmin}
                  className="w-full border border-[#E5E7EB] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5] focus:border-transparent disabled:bg-[#F9FAFB] disabled:text-[#9CA3AF]"
                />
                {isOwnerOrAdmin && (
                  <div className="flex items-center gap-3 mt-4">
                    <button
                      onClick={saveOrgName}
                      disabled={saving || !orgName.trim() || orgName === org.name}
                      className="bg-[#4F46E5] text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-[#4338CA] transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                      Save
                    </button>
                    {saveMessage && (
                      <span className={`text-sm font-medium ${saveMessage === 'Saved!' ? 'text-green-600' : 'text-red-600'}`}>
                        {saveMessage}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Divisions Tab */}
        {activeTab === 'divisions' && (
          <motion.div
            key="divisions"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="bg-white rounded-3xl border border-[#E5E7EB] shadow-sm p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold">Divisions</h3>
                {isOwnerOrAdmin && (
                  <button
                    onClick={() => setShowAddDivision(true)}
                    className="bg-[#4F46E5] text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-[#4338CA] transition-colors flex items-center gap-2"
                  >
                    <Plus size={16} />
                    Add Division
                  </button>
                )}
              </div>

              {showAddDivision && (
                <div className="mb-6 p-4 bg-[#F9FAFB] rounded-2xl border border-[#E5E7EB]">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="Division name"
                      value={newDivisionTitle}
                      onChange={(e) => setNewDivisionTitle(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && createDivision()}
                      className="flex-1 border border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5] focus:border-transparent"
                      autoFocus
                    />
                    <button
                      onClick={createDivision}
                      disabled={divisionSaving || !newDivisionTitle.trim()}
                      className="bg-[#4F46E5] text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-[#4338CA] disabled:opacity-50 flex items-center gap-2"
                    >
                      {divisionSaving ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                      Add
                    </button>
                    <button
                      onClick={() => { setShowAddDivision(false); setNewDivisionTitle(''); }}
                      className="text-[#6B7280] hover:text-[#374151] px-3 py-2.5 rounded-xl hover:bg-[#F3F4F6]"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              )}

              {divisionsLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="animate-spin text-[#4F46E5]" size={24} />
                </div>
              ) : divisionsList.length === 0 ? (
                <p className="text-[#6B7280] text-center py-10">No divisions yet. Add your first division to get started.</p>
              ) : (
                <div className="space-y-3">
                  {divisionsList.map(div => (
                    <div key={div.id} className="border border-[#E5E7EB] rounded-2xl p-5 hover:border-[#C7D2FE] transition-colors">
                      {editingDivision?.id === div.id ? (
                        <div className="flex gap-3">
                          <input
                            type="text"
                            value={editDivisionTitle}
                            onChange={(e) => setEditDivisionTitle(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && updateDivision()}
                            className="flex-1 border border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5] focus:border-transparent"
                            autoFocus
                          />
                          <button
                            onClick={updateDivision}
                            disabled={divisionSaving}
                            className="bg-[#4F46E5] text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-[#4338CA] disabled:opacity-50"
                          >
                            {divisionSaving ? <Loader2 className="animate-spin" size={16} /> : 'Save'}
                          </button>
                          <button
                            onClick={() => setEditingDivision(null)}
                            className="text-[#6B7280] hover:text-[#374151] px-3"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-[#EEF2FF] text-[#4F46E5] rounded-xl">
                                <FolderTree size={16} />
                              </div>
                              <span className="font-bold text-[#111827]">{div.title}</span>
                            </div>
                            {isOwnerOrAdmin && (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => { setEditingDivision(div); setEditDivisionTitle(div.title); }}
                                  className="text-[#6B7280] hover:text-[#4F46E5] p-1.5 rounded-lg hover:bg-[#EEF2FF] transition-colors"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  onClick={() => deleteDivision(div.id)}
                                  disabled={deletingDivisionId === div.id}
                                  className="text-[#6B7280] hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                >
                                  {deletingDivisionId === div.id ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                                </button>
                              </div>
                            )}
                          </div>
                          {/* Managers */}
                          <div className="ml-11">
                            {div.managers.length > 0 && (
                              <div className="flex flex-wrap gap-2 mb-2">
                                {div.managers.map(m => (
                                  <span key={m.userId} className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#F3F4F6] rounded-lg text-xs font-medium text-[#374151]">
                                    <UserCog size={12} />
                                    {m.firstName} {m.lastName}
                                    {isOwnerOrAdmin && (
                                      <button
                                        onClick={() => removeManager(div.id, m.userId)}
                                        className="ml-1 text-[#9CA3AF] hover:text-red-500"
                                      >
                                        <X size={12} />
                                      </button>
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}
                            {isOwnerOrAdmin && (
                              assignManagerDivId === div.id ? (
                                <div className="flex gap-2 mt-2">
                                  <select
                                    value={assignManagerUserId}
                                    onChange={(e) => setAssignManagerUserId(e.target.value)}
                                    className="flex-1 border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm"
                                  >
                                    <option value="">Select a manager...</option>
                                    {acceptedManagers
                                      .filter(m => !div.managers.some(dm => dm.userId === m.userId))
                                      .map(m => (
                                        <option key={m.userId} value={m.userId}>{m.firstName} {m.lastName} ({m.email})</option>
                                      ))}
                                  </select>
                                  <button
                                    onClick={() => assignManager(div.id)}
                                    disabled={!assignManagerUserId}
                                    className="bg-[#4F46E5] text-white px-3 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
                                  >
                                    Assign
                                  </button>
                                  <button
                                    onClick={() => { setAssignManagerDivId(null); setAssignManagerUserId(''); }}
                                    className="text-[#6B7280] hover:text-[#374151] px-2"
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setAssignManagerDivId(div.id)}
                                  className="text-[#4F46E5] text-xs font-medium hover:underline flex items-center gap-1 mt-1"
                                >
                                  <UserPlus size={12} />
                                  Assign Manager
                                </button>
                              )
                            )}
                            <DivisionAttributesEditor divisionId={div.id} authFetch={authFetch} />
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <motion.div
            key="users"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="bg-white rounded-3xl border border-[#E5E7EB] shadow-sm p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold">Team Members</h3>
                {isOwnerOrAdmin && (
                  <button
                    onClick={() => setShowInvite(!showInvite)}
                    className="bg-[#4F46E5] text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-[#4338CA] transition-colors flex items-center gap-2"
                  >
                    <Mail size={16} />
                    Invite User
                  </button>
                )}
              </div>

              {showInvite && (
                <div className="mb-6 p-5 bg-[#F9FAFB] rounded-2xl border border-[#E5E7EB]">
                  <h4 className="font-bold text-sm mb-3">Send Invitation</h4>
                  <div className="flex gap-3">
                    <input
                      type="email"
                      placeholder="Email address"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="flex-1 border border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5] focus:border-transparent"
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as 'admin' | 'manager')}
                      className="border border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm bg-white"
                    >
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={inviteUser}
                      disabled={inviting || !inviteEmail.trim()}
                      className="bg-[#4F46E5] text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-[#4338CA] disabled:opacity-50 flex items-center gap-2"
                    >
                      {inviting ? <Loader2 className="animate-spin" size={16} /> : <Mail size={16} />}
                      Send
                    </button>
                  </div>
                  {inviteError && <p className="text-red-600 text-sm mt-2">{inviteError}</p>}
                  {inviteSuccess && <p className="text-green-600 text-sm mt-2">{inviteSuccess}</p>}
                </div>
              )}

              {usersLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="animate-spin text-[#4F46E5]" size={24} />
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Owner row */}
                  {owner && (
                    <div className="flex items-center justify-between p-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-2xl">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-[#F59E0B] rounded-full flex items-center justify-center text-white text-xs font-bold">
                          {owner.firstName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-sm">{owner.firstName} {owner.lastName}</p>
                          <p className="text-xs text-[#6B7280]">{owner.email}</p>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#FEF3C7] text-[#92400E] rounded-lg text-xs font-bold">
                        <Shield size={12} />
                        Owner
                      </span>
                    </div>
                  )}

                  {/* Members */}
                  {members.map(m => (
                    <div key={m.id} className={`flex items-center justify-between p-4 rounded-2xl border ${m.status === 'pending' ? 'bg-[#F9FAFB] border-dashed border-[#D1D5DB]' : 'border-[#E5E7EB]'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold ${m.status === 'pending' ? 'bg-[#9CA3AF]' : m.role === 'admin' ? 'bg-[#4F46E5]' : 'bg-[#059669]'}`}>
                          {m.firstName ? m.firstName.charAt(0) : m.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-sm">
                            {m.firstName ? `${m.firstName} ${m.lastName}` : m.email}
                            {m.status === 'pending' && <span className="ml-2 text-xs text-[#9CA3AF] font-normal">(Pending)</span>}
                          </p>
                          <p className="text-xs text-[#6B7280]">{m.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {isOwnerOrAdmin ? (
                          <select
                            value={m.role}
                            onChange={(e) => updateUserRole(m.id, e.target.value as 'admin' | 'manager')}
                            className="border border-[#E5E7EB] rounded-lg px-3 py-1.5 text-xs font-medium bg-white"
                          >
                            <option value="admin">Admin</option>
                            <option value="manager">Manager</option>
                          </select>
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold ${m.role === 'admin' ? 'bg-[#EEF2FF] text-[#4F46E5]' : 'bg-[#ECFDF5] text-[#059669]'}`}>
                            {m.role === 'admin' ? <Shield size={12} /> : <UserCog size={12} />}
                            {m.role === 'admin' ? 'Admin' : 'Manager'}
                          </span>
                        )}
                        {isOwnerOrAdmin && (
                          <button
                            onClick={() => removeUser(m.id)}
                            className="text-[#9CA3AF] hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {members.length === 0 && (
                    <p className="text-[#6B7280] text-center py-10">No team members yet. Invite users to join your organization.</p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
