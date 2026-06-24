import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus, Phone, Search, Trash2, RefreshCw, ChevronDown, X, Save,
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import { leadsAPI } from '../../utils/api';
import { formatDate } from '../../utils/helpers';
import toast from 'react-hot-toast';

const STAGES = [
  { key: 'new',       label: 'New Enquiry',  color: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500' },
  { key: 'quoted',    label: 'Quote Sent',   color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  { key: 'follow_up', label: 'Follow Up',    color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  { key: 'booked',    label: 'Booked ✓',     color: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  { key: 'lost',      label: 'Lost',         color: 'bg-red-100 text-red-600',      dot: 'bg-red-400' },
];

const SOURCES = ['phone', 'whatsapp', 'website', 'walkin', 'referral', 'google_ads', 'meta_ads'];

const stageConfig = Object.fromEntries(STAGES.map((s) => [s.key, s]));

// ─── Add Lead Modal ───────────────────────────────────────────────────────────
function AddLeadModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    name: '', phone: '', serviceInterest: '', quotedAmount: '',
    source: 'phone', notes: '', followUpDate: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error('Name and phone are required');
      return;
    }
    setSaving(true);
    try {
      await leadsAPI.create({
        ...form,
        quotedAmount: form.quotedAmount ? Number(form.quotedAmount) : 0,
      });
      toast.success('Lead added');
      onSaved();
      onClose();
    } catch {
      toast.error('Failed to add lead');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Add New Lead</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Name *</label>
              <input value={form.name} onChange={(e) => set('name', e.target.value)}
                placeholder="Customer name" className="input-field text-sm w-full" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Phone *</label>
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)}
                placeholder="98XXXXXXXX" className="input-field text-sm w-full" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Service Interest</label>
            <input value={form.serviceInterest} onChange={(e) => set('serviceInterest', e.target.value)}
              placeholder="e.g. Sofa Cleaning, Deep Clean..." className="input-field text-sm w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Quoted Amount (₹)</label>
              <input type="number" value={form.quotedAmount} onChange={(e) => set('quotedAmount', e.target.value)}
                placeholder="0" className="input-field text-sm w-full" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Source</label>
              <select value={form.source} onChange={(e) => set('source', e.target.value)}
                className="input-field text-sm w-full">
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Follow-up Date</label>
            <input type="date" value={form.followUpDate} onChange={(e) => set('followUpDate', e.target.value)}
              className="input-field text-sm w-full" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Notes</label>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)}
              rows={2} placeholder="Any details..." className="input-field text-sm w-full resize-none" />
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} className="btn-ghost flex-1 border border-gray-200 text-sm">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary flex-1 text-sm gap-2">
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Add Lead'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Lead Card ────────────────────────────────────────────────────────────────
function LeadCard({ lead, onStageChange, onDelete, onConfirm }) {
  const [confirming, setConfirming] = React.useState(false);
  const cfg = stageConfig[lead.stage];

  const handleConfirm = async () => {
    if (!window.confirm(`Confirm booking for ${lead.name}? WhatsApp confirmation will be sent.`)) return;
    setConfirming(true);
    try {
      await onConfirm(lead._id);
    } finally {
      setConfirming(false);
    }
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="font-semibold text-gray-900 text-sm">{lead.name}</div>
          <div className="flex items-center gap-1 text-gray-400 text-xs mt-0.5">
            <Phone className="w-3 h-3" />{lead.phone}
          </div>
        </div>
        <button onClick={() => onDelete(lead._id)}
          className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {lead.serviceInterest && (
        <div className="text-xs text-gray-500 mb-2">🧹 {lead.serviceInterest}</div>
      )}
      {lead.quotedAmount > 0 && (
        <div className="text-xs text-gray-500 mb-2">💰 Quoted: ₹{lead.quotedAmount}</div>
      )}
      {lead.followUpDate && (
        <div className="text-xs text-orange-500 mb-2">📅 Follow up: {formatDate(lead.followUpDate)}</div>
      )}
      {lead.notes && (
        <div className="text-xs text-gray-400 mb-2 line-clamp-2">{lead.notes}</div>
      )}

      <div className="flex items-center gap-1 mt-3">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg?.color}`}>
          {cfg?.label}
        </span>
        <span className="text-xs text-gray-300 ml-auto">{lead.source}</span>
      </div>

      {lead.source === 'whatsapp' && lead.stage !== 'booked' && lead.stage !== 'lost' && (
        <button
          onClick={handleConfirm}
          disabled={confirming}
          className="mt-2 w-full text-xs bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-semibold py-1.5 rounded-lg transition-colors"
        >
          {confirming ? 'Sending...' : '✅ Confirm & Notify Customer'}
        </button>
      )}

      <select
        value={lead.stage}
        onChange={(e) => onStageChange(lead._id, e.target.value)}
        className="mt-2 w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-300 text-gray-600"
      >
        {STAGES.map((s) => (
          <option key={s.key} value={s.key}>{s.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Main Leads Page ──────────────────────────────────────────────────────────
export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [leadsRes, statsRes] = await Promise.all([
        leadsAPI.getAll(search ? { search } : {}),
        leadsAPI.getStats(),
      ]);
      setLeads(leadsRes.data.data);
      setStats(statsRes.data.data);
    } catch {
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(fetchData, search ? 400 : 0);
    return () => clearTimeout(t);
  }, [fetchData]);

  const handleStageChange = async (id, stage) => {
    try {
      await leadsAPI.update(id, { stage });
      setLeads((prev) => prev.map((l) => l._id === id ? { ...l, stage } : l));
      toast.success('Stage updated');
    } catch {
      toast.error('Failed to update');
    }
  };

  const handleConfirm = async (id) => {
    try {
      await leadsAPI.confirm(id);
      setLeads((prev) => prev.map((l) => l._id === id ? { ...l, stage: 'booked' } : l));
      toast.success('Booking confirmed! WhatsApp sent to customer.');
    } catch {
      toast.error('Failed to confirm booking');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this lead?')) return;
    try {
      await leadsAPI.delete(id);
      setLeads((prev) => prev.filter((l) => l._id !== id));
      toast.success('Lead deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const leadsByStage = (stageKey) => leads.filter((l) => l.stage === stageKey);

  return (
    <AdminLayout title="Leads">
      {showAdd && <AddLeadModal onClose={() => setShowAdd(false)} onSaved={fetchData} />}

      {/* Stats */}
      <div className="flex flex-wrap gap-3 mb-6">
        {STAGES.map((s) => (
          <div key={s.key} className="card px-4 py-3 flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
            <span className="text-sm text-gray-600">{s.label}</span>
            <span className="font-bold text-gray-900">{stats?.byStage?.[s.key] ?? 0}</span>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search leads by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300"
          />
        </div>
        <button onClick={fetchData} disabled={loading} className="btn-ghost border border-gray-200 text-sm gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-sm gap-2">
          <Plus className="w-4 h-4" /> Add Lead
        </button>
      </div>

      {/* Kanban columns */}
      {loading ? (
        <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {STAGES.map((stage) => (
            <div key={stage.key}>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-3 ${stage.color}`}>
                <div className={`w-2 h-2 rounded-full ${stage.dot}`} />
                <span className="text-xs font-semibold">{stage.label}</span>
                <span className="ml-auto text-xs font-bold">{leadsByStage(stage.key).length}</span>
              </div>
              <div className="space-y-3">
                {leadsByStage(stage.key).map((lead) => (
                  <LeadCard
                    key={lead._id}
                    lead={lead}
                    onStageChange={handleStageChange}
                    onDelete={handleDelete}
                    onConfirm={handleConfirm}
                  />
                ))}
                {leadsByStage(stage.key).length === 0 && (
                  <div className="text-xs text-gray-300 text-center py-6 border-2 border-dashed border-gray-100 rounded-xl">
                    No leads
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
