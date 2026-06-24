import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus, Phone, Search, Trash2, RefreshCw, X, Save, Calendar,
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

// ─── Convert to Booking Modal ─────────────────────────────────────────────────
function ConvertToBookingModal({ lead, onClose, onConverted }) {
  const toInputDate = (d) => d ? new Date(d).toISOString().split('T')[0] : '';

  const [form, setForm] = useState({
    scheduledDate: toInputDate(lead.scheduledDate),
    timeSlot:      lead.timeSlot  || '',
    address:       lead.address   || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSkip = async () => {
    try {
      await leadsAPI.update(lead._id, { stage: 'booked' });
      onConverted(lead._id, null);
      toast.success('Moved to Booked');
      onClose();
    } catch {
      toast.error('Failed to update stage');
    }
  };

  const handleSubmit = async () => {
    if (!form.scheduledDate || !form.timeSlot.trim() || !form.address.trim()) {
      toast.error('Date, time slot, and address are required');
      return;
    }
    setSaving(true);
    try {
      const res = await leadsAPI.convert(lead._id, form);
      onConverted(lead._id, res.data.data.booking);
      toast.success(`Booking ${res.data.data.booking.bookingId} created & scheduled!`);
      onClose();
    } catch {
      toast.error('Failed to create booking');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-green-600" />
            <h3 className="font-semibold text-gray-900">Schedule Booking</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <div className="font-medium text-gray-900">{lead.name}</div>
            <div className="text-gray-500 text-xs">{lead.phone}</div>
            {lead.serviceInterest && <div className="text-gray-600">🧹 {lead.serviceInterest}</div>}
            {lead.quotedAmount > 0 && <div className="text-gray-600">💰 ₹{lead.quotedAmount}</div>}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Service Date *</label>
            <input type="date" value={form.scheduledDate}
              onChange={(e) => set('scheduledDate', e.target.value)}
              className="input-field text-sm w-full" />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Time Slot *</label>
            <input value={form.timeSlot}
              onChange={(e) => set('timeSlot', e.target.value)}
              placeholder="e.g. 10:00 AM - 12:00 PM"
              className="input-field text-sm w-full" />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Address *</label>
            <textarea value={form.address}
              onChange={(e) => set('address', e.target.value)}
              rows={2} placeholder="Full address..."
              className="input-field text-sm w-full resize-none" />
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={handleSkip}
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-500 hover:bg-gray-50 transition-colors">
            Skip (Stage Only)
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="btn-primary flex-1 text-sm gap-2">
            <Save className="w-4 h-4" />
            {saving ? 'Creating...' : 'Create Booking'}
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
      {lead.scheduledDate && (
        <div className="text-xs text-blue-500 mb-2">📅 {formatDate(lead.scheduledDate)}{lead.timeSlot ? ` · ${lead.timeSlot}` : ''}</div>
      )}
      {lead.address && (
        <div className="text-xs text-gray-500 mb-2 line-clamp-1">📍 {lead.address}</div>
      )}
      {lead.notes && (
        <div className="text-xs text-gray-400 mb-2 line-clamp-2">{lead.notes}</div>
      )}
      {lead.convertedBookingId && (
        <div className="text-xs text-green-600 mb-2 font-medium">✅ Booking scheduled</div>
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
  const [bookingModal, setBookingModal] = useState(null); // lead to convert

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
    if (stage === 'booked') {
      const lead = leads.find((l) => l._id === id);
      setBookingModal(lead);
      return;
    }
    try {
      await leadsAPI.update(id, { stage });
      setLeads((prev) => prev.map((l) => l._id === id ? { ...l, stage } : l));
      toast.success('Stage updated');
    } catch {
      toast.error('Failed to update');
    }
  };

  const handleBookingConverted = (id, booking) => {
    setLeads((prev) => prev.map((l) =>
      l._id === id
        ? { ...l, stage: 'booked', ...(booking && { convertedBookingId: booking._id }) }
        : l
    ));
    fetchData(); // refresh stats
  };

  const openWhatsApp = (lead) => {
    const digits = String(lead.phone || '').replace(/\D/g, '');
    const phone = digits.length === 10 ? `91${digits}` : digits;
    const parts = [
      `✅ *Booking Confirmed!*`,
      ``,
      `Namaste *${lead.name}*! 🙏`,
      ``,
      `Aapki booking confirm ho gayi hai.`,
      ``,
      lead.serviceInterest ? `🧹 Service: ${lead.serviceInterest}` : null,
      lead.scheduledDate   ? `📅 Date: ${new Date(lead.scheduledDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : null,
      lead.timeSlot        ? `🕐 Time: ${lead.timeSlot}` : null,
      lead.address         ? `📍 Address: ${lead.address}` : null,
      lead.quotedAmount    ? `💰 Amount: ₹${lead.quotedAmount}` : null,
      ``,
      `Hamaari team aapke paas pahunchegi. Koi sawaal ho toh yahan message karein. 🙏`,
      ``,
      `_Thank you for choosing SofaShine!_`,
    ].filter((l) => l !== null).join('\n');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(parts)}`, '_blank');
  };

  const handleConfirm = async (id) => {
    const lead = leads.find((l) => l._id === id);
    try {
      const res = await leadsAPI.confirm(id);
      setLeads((prev) => prev.map((l) => l._id === id ? { ...l, stage: 'booked' } : l));
      if (res.data.bookingCreated) {
        toast.success('Booking confirmed & scheduled automatically!');
      } else if (res.data.whatsappSent) {
        toast.success('Booking confirmed! WhatsApp message sent to customer.');
      } else {
        toast.success('Booking confirmed!');
        toast(
          () => (
            <span style={{ fontSize: 13 }}>
              Auto-message fail (24h window).{' '}
              <button
                onClick={() => lead && openWhatsApp(lead)}
                style={{ color: '#25D366', fontWeight: 600, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                📲 Open WhatsApp Chat
              </button>
            </span>
          ),
          { icon: '⚠️', duration: 12000 }
        );
      }
      fetchData();
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
      {bookingModal && (
        <ConvertToBookingModal
          lead={bookingModal}
          onClose={() => setBookingModal(null)}
          onConverted={handleBookingConverted}
        />
      )}

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
