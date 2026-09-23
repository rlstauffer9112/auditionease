import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  ArrowUp,
  ArrowDown,
  XCircle,
  ClipboardList,
  Filter,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface CustomAttribute {
  id: number;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multiselect';
  options: string;
  required: boolean;
  order: number;
  divisionId: number | null;
}

interface AttributeSet {
  id: number;
  name: string;
  attributeIds: number[];
  divisionId: number | null;
  createdAt: string;
}

interface Props {
  divisionId: number;
  authFetch: (url: string, opts?: RequestInit) => Promise<Response>;
}

export function DivisionAttributesEditor({ divisionId, authFetch }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'attributes' | 'sets'>('attributes');
  const [attributes, setAttributes] = useState<CustomAttribute[]>([]);
  const [sets, setSets] = useState<AttributeSet[]>([]);
  const [loading, setLoading] = useState(false);

  const [newAttr, setNewAttr] = useState({ label: '', type: 'text' as CustomAttribute['type'], options: '', required: false });

  const [newSetName, setNewSetName] = useState('');
  const [newSetAttrIds, setNewSetAttrIds] = useState<number[]>([]);
  const [editingSet, setEditingSet] = useState<AttributeSet | null>(null);
  const [editSetName, setEditSetName] = useState('');
  const [editSetAttrIds, setEditSetAttrIds] = useState<number[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [attrRes, setsRes] = await Promise.all([
        authFetch('/api/custom-attributes'),
        authFetch('/api/attribute-sets'),
      ]);
      const allAttrs: CustomAttribute[] = await attrRes.json();
      const allSets: AttributeSet[] = await setsRes.json();
      setAttributes(allAttrs.filter(a => a.divisionId === divisionId));
      setSets(allSets.filter(s => s.divisionId === divisionId));
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (expanded) fetchData();
  }, [expanded, divisionId]);

  const handleAddAttribute = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...newAttr,
        divisionId,
        options: (newAttr.type === 'select' || newAttr.type === 'multiselect')
          ? JSON.stringify(newAttr.options.split(',').map(o => o.trim()).filter(Boolean))
          : newAttr.options,
      };
      const res = await authFetch('/api/custom-attributes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        fetchData();
        setNewAttr({ label: '', type: 'text', options: '', required: false });
      }
    } catch {}
  };

  const handleDeleteAttribute = async (id: number) => {
    if (!confirm('Are you sure? This will remove this attribute from future forms.')) return;
    try {
      const res = await authFetch(`/api/custom-attributes/${id}`, { method: 'DELETE' });
      if (res.ok) fetchData();
    } catch {}
  };

  const handleReorderAttribute = async (id: number, direction: 'up' | 'down') => {
    const idx = attributes.findIndex(a => a.id === id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= attributes.length) return;
    const reordered = [...attributes];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    setAttributes(reordered);
    try {
      await authFetch('/api/custom-attributes/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: reordered.map(a => a.id) }),
      });
    } catch {
      fetchData();
    }
  };

  const handleAddSet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSetName.trim()) return;
    try {
      const res = await authFetch('/api/attribute-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSetName.trim(), attributeIds: newSetAttrIds, divisionId }),
      });
      if (res.ok) {
        fetchData();
        setNewSetName('');
        setNewSetAttrIds([]);
      }
    } catch {}
  };

  const handleUpdateSet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSet || !editSetName.trim()) return;
    try {
      const res = await authFetch(`/api/attribute-sets/${editingSet.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editSetName.trim(), attributeIds: editSetAttrIds }),
      });
      if (res.ok) {
        fetchData();
        setEditingSet(null);
      }
    } catch {}
  };

  const handleDeleteSet = async (id: number) => {
    if (!confirm('Delete this attribute set? Auditions using it will revert to showing all attributes.')) return;
    try {
      const res = await authFetch(`/api/attribute-sets/${id}`, { method: 'DELETE' });
      if (res.ok) fetchData();
    } catch {}
  };

  return (
    <div className="mt-4 ml-11">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[#4F46E5] text-xs font-medium hover:underline flex items-center gap-1"
      >
        <ClipboardList size={12} />
        Audition Attributes
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {expanded && (
        <div className="mt-3 border border-[#E5E7EB] rounded-2xl p-5 bg-[#FAFAFA]">
          <div className="flex gap-1 mb-4 bg-[#F3F4F6] p-1 rounded-xl w-fit">
            <button
              onClick={() => setActiveTab('attributes')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'attributes' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#6B7280] hover:text-[#374151]'
              }`}
            >
              <ClipboardList size={13} />
              Attributes
            </button>
            <button
              onClick={() => setActiveTab('sets')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'sets' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#6B7280] hover:text-[#374151]'
              }`}
            >
              <Filter size={13} />
              Attribute Sets
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-[#4F46E5]" size={20} />
            </div>
          ) : activeTab === 'attributes' ? (
            <div>
              <form onSubmit={handleAddAttribute} className="mb-4 p-4 bg-white rounded-xl border border-[#E5E7EB]">
                <h4 className="text-sm font-bold mb-3">Add Attribute</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#6B7280] uppercase mb-1">Label</label>
                    <input
                      required
                      type="text"
                      value={newAttr.label}
                      onChange={e => setNewAttr({ ...newAttr, label: e.target.value })}
                      className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm"
                      placeholder="e.g. Voice Part"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#6B7280] uppercase mb-1">Type</label>
                    <select
                      value={newAttr.type}
                      onChange={e => setNewAttr({ ...newAttr, type: e.target.value as CustomAttribute['type'] })}
                      className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm bg-white"
                    >
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="date">Date</option>
                      <option value="boolean">Yes/No</option>
                      <option value="select">Dropdown (Select One)</option>
                      <option value="multiselect">Dropdown (Select Multiple)</option>
                    </select>
                  </div>
                </div>
                {(newAttr.type === 'select' || newAttr.type === 'multiselect') && (
                  <div className="mt-3">
                    <label className="block text-xs font-bold text-[#6B7280] uppercase mb-1">Options (comma separated)</label>
                    <input
                      type="text"
                      value={newAttr.options}
                      onChange={e => setNewAttr({ ...newAttr, options: e.target.value })}
                      className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm"
                      placeholder="Option 1, Option 2"
                    />
                  </div>
                )}
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`div-attr-required-${divisionId}`}
                      checked={newAttr.required}
                      onChange={e => setNewAttr({ ...newAttr, required: e.target.checked })}
                    />
                    <label htmlFor={`div-attr-required-${divisionId}`} className="text-xs font-medium">Required</label>
                  </div>
                  <button
                    type="submit"
                    className="bg-[#4F46E5] text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#4338CA] transition-colors flex items-center gap-1.5"
                  >
                    <Plus size={14} />
                    Add
                  </button>
                </div>
              </form>

              {attributes.length === 0 ? (
                <p className="text-xs text-[#6B7280] text-center py-4">No attributes for this division yet.</p>
              ) : (
                <div className="space-y-2">
                  {attributes.map((attr, idx) => (
                    <div key={attr.id} className="bg-white p-3 rounded-xl border border-[#E5E7EB] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                          <button
                            onClick={() => handleReorderAttribute(attr.id, 'up')}
                            disabled={idx === 0}
                            className="p-0.5 text-[#6B7280] hover:text-[#111827] disabled:opacity-25 transition-colors"
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            onClick={() => handleReorderAttribute(attr.id, 'down')}
                            disabled={idx === attributes.length - 1}
                            className="p-0.5 text-[#6B7280] hover:text-[#111827] disabled:opacity-25 transition-colors"
                          >
                            <ArrowDown size={13} />
                          </button>
                        </div>
                        <div>
                          <p className="font-bold text-sm">{attr.label}</p>
                          <p className="text-xs text-[#6B7280] uppercase tracking-wider">
                            {attr.type === 'select' ? 'Dropdown (Select One)' : attr.type === 'multiselect' ? 'Dropdown (Select Multiple)' : attr.type}
                            {attr.required ? ' • Required' : ''}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteAttribute(attr.id)}
                        className="p-1.5 text-[#EF4444] hover:bg-[#FEF2F2] rounded-lg transition-colors"
                      >
                        <XCircle size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <form onSubmit={editingSet ? handleUpdateSet : handleAddSet} className="mb-4 p-4 bg-white rounded-xl border border-[#E5E7EB]">
                <h4 className="text-sm font-bold mb-3">{editingSet ? 'Edit Attribute Set' : 'Create Attribute Set'}</h4>
                <div>
                  <label className="block text-xs font-bold text-[#6B7280] uppercase mb-1">Set Name</label>
                  <input
                    required
                    type="text"
                    value={editingSet ? editSetName : newSetName}
                    onChange={e => editingSet ? setEditSetName(e.target.value) : setNewSetName(e.target.value)}
                    className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm"
                    placeholder="e.g. Vocal Audition Fields"
                  />
                </div>
                {attributes.length === 0 ? (
                  <p className="text-xs text-[#6B7280] mt-3">No attributes for this division yet. Create some in the Attributes tab first.</p>
                ) : (
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-[#6B7280] uppercase">Select Attributes</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const allIds = attributes.map(a => a.id);
                            editingSet ? setEditSetAttrIds(allIds) : setNewSetAttrIds(allIds);
                          }}
                          className="text-[10px] text-[#4F46E5] hover:underline font-medium"
                        >Select All</button>
                        <button
                          type="button"
                          onClick={() => editingSet ? setEditSetAttrIds([]) : setNewSetAttrIds([])}
                          className="text-[10px] text-[#4F46E5] hover:underline font-medium"
                        >Clear All</button>
                      </div>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto border border-[#E5E7EB] rounded-lg p-2">
                      {attributes.map(attr => {
                        const selected = editingSet ? editSetAttrIds.includes(attr.id) : newSetAttrIds.includes(attr.id);
                        return (
                          <label key={attr.id} className="flex items-center gap-2 cursor-pointer hover:bg-[#F9FAFB] p-1.5 rounded-lg">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={e => {
                                if (editingSet) {
                                  setEditSetAttrIds(e.target.checked ? [...editSetAttrIds, attr.id] : editSetAttrIds.filter(id => id !== attr.id));
                                } else {
                                  setNewSetAttrIds(e.target.checked ? [...newSetAttrIds, attr.id] : newSetAttrIds.filter(id => id !== attr.id));
                                }
                              }}
                              className="rounded"
                            />
                            <span className="text-xs font-medium">{attr.label}</span>
                            <span className="text-xs text-[#9CA3AF] ml-auto">{attr.type === 'select' ? 'Dropdown' : attr.type === 'multiselect' ? 'Multi-select' : attr.type}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="flex gap-2 mt-3">
                  {editingSet && (
                    <button
                      type="button"
                      onClick={() => setEditingSet(null)}
                      className="flex-1 px-3 py-2 border border-[#E5E7EB] rounded-lg text-xs font-bold hover:bg-[#F9FAFB] transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={attributes.length === 0}
                    className="flex-1 bg-[#4F46E5] text-white py-2 rounded-lg text-xs font-bold hover:bg-[#4338CA] transition-colors disabled:opacity-50"
                  >
                    {editingSet ? 'Save Changes' : 'Create Set'}
                  </button>
                </div>
              </form>

              {sets.length === 0 ? (
                <p className="text-xs text-[#6B7280] text-center py-4">No attribute sets for this division yet.</p>
              ) : (
                <div className="space-y-2">
                  {sets.map(set => (
                    <div key={set.id} className="bg-white p-4 rounded-xl border border-[#E5E7EB]">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-bold text-sm">{set.name}</p>
                          <p className="text-xs text-[#6B7280]">{set.attributeIds.length} attribute{set.attributeIds.length !== 1 ? 's' : ''}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingSet(set);
                              setEditSetName(set.name);
                              setEditSetAttrIds([...set.attributeIds]);
                            }}
                            className="p-1.5 text-[#6B7280] hover:text-[#4F46E5] hover:bg-[#EEF2FF] rounded-lg transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteSet(set.id)}
                            className="p-1.5 text-[#EF4444] hover:bg-[#FEF2F2] rounded-lg transition-colors"
                          >
                            <XCircle size={13} />
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {set.attributeIds.map(attrId => {
                          const attr = attributes.find(a => a.id === attrId);
                          return attr ? (
                            <span key={attrId} className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#F3F4F6] text-xs font-medium text-[#374151]">
                              {attr.label}
                            </span>
                          ) : null;
                        })}
                        {set.attributeIds.length === 0 && (
                          <span className="text-xs text-[#9CA3AF] italic">No attributes selected</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
