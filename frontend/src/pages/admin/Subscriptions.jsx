import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Phone, Trash2, RefreshCw, X, Save, PauseCircle, PlayCircle, RepeatIcon } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import { subscriptionsAPI } from '../../utils/api';
import { formatDate } from '../../utils/helpers';
import toast from 'react-hot-toast';

const FREQUENCIES = [
  { key: 'weekly',   label: 'Weekly',    desc: 'Every 7 days' },
  { key: 'biweekly', label: 'Bi-weekly', desc: 'Every 14 days' },
  { key: 'monthly',  label: 'Monthly',   desc: 'Every 30 days' },
];

// Must match the timeSlot format generated in NewBooking (to12h(start) - to12h(end))
const TIME_SLOTS = [
  '07:00 AM - 08:00 AM',
  '08:00 AM - 09:00 AM',
  '09:00 AM - 10:00 AM',
  '10:00 AM - 11:00 AM',
  '11:00 AM - 12:00 PM',
  '12:00 PM - 01:00 PM',
  '01:00 PM - 02:00 PM',
  '02:00 PM - 03:00 PM',
  '03:00 PM - 04:00 PM',
  '04:00 PM - 05:00 PM',
  '05:00 PM - 06:00 PM',
  '06:00 PM - 07:00 PM',
  '07:00 PM - 08:00 PM',
];

// 24h "HH:MM" → "HH:MM AM/PM"
const to12h = (t) => {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  const period = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${String(h).padStart(2, '0')}:${m} ${period}`;
};

const buildSlot = (start, end) =>
  start && end ? `${to12h(start)} - ${to12h(end)}` : '';

const STATUS_CONFIG = {
  active:    { color: 'bg-green-100 text-green-700',  dot: 'bg-green-500',  label: 'Active' },
  paused:    { color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500', label: 'Paused' },
  cancelled: { color: 'bg-red-100 text-red-600',      dot: 'bg-red-400',    label: 'Cancelled' },
};

// ─── Add Subscription Modal ───────────────────────────────────────────────────
function AddModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    name: '', phone: '', service: '', address: '', preferredTime: '',
    frequency: 'biweekly', price: '', startDate: '', notes: '',
    businessId: 'cleancruisers',
  });
  const [saving, setSaving] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd]     = useState('');
  const [isCustomTime, setIsCustomTime] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // When custom times change, update preferredTime in form
  const handleCustomTime = (start, end) => {
    const s = start !== undefined ? start : customStart;
    const e = end   !== undefined ? end   : customEnd;
    if (start !== undefined) setCustomStart(s);
    if (end   !== undefined) setCustomEnd(e);
    set('preferredTime', buildSlot(s, e));
  };

  const handleSlotSelect = (val) => {
    if (val === '__custom__') {
      setIsCustomTime(true);
      set('preferredTime', buildSlot(customStart, customEnd));
    } else {
      setIsCustomTime(false);
      setCustomStart('');
      setCustomEnd('');
      set('preferredTime', val);
    }
  };

  const submit = async () => {
    if (!form.name || !form.phone || !form.service || !form.startDate) {
      toast.error('Name, phone, service and start date are required');
      return;
    }
    setSaving(true);
    try {
      await subscriptionsAPI.create({ ...form, price: form.price ? Number(form.price) : 0 });
      toast.success('Subscription created');
      onSaved();
      onClose();
    } catch {
      toast.error('Failed to create subscription');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-900">New Subscription</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Customer Name *</label>
              <input value={form.name} onChange={(e) => set('name', e.target.value)}
                placeholder="Name" className="input-field text-sm w-full" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Phone *</label>
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)}
                placeholder="91XXXXXXXXXX" className="input-field text-sm w-full" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Service *</label>
            <input value={form.service} onChange={(e) => set('service', e.target.value)}
              placeholder="e.g. Car Wash - Sedan" className="input-field text-sm w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Frequency *</label>
              <select value={form.frequency} onChange={(e) => set('frequency', e.target.value)}
                className="input-field text-sm w-full">
                {FREQUENCIES.map((f) => (
                  <option key={f.key} value={f.key}>{f.label} — {f.desc}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Price per visit (₹)</label>
              <input type="number" value={form.price} onChange={(e) => set('price', e.target.value)}
                placeholder="0" className="input-field text-sm w-full" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Start Date *</label>
              <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)}
                className="input-field text-sm w-full" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Preferred Time Slot</label>
              <select
                value={isCustomTime ? '__custom__' : form.preferredTime}
                onChange={(e) => handleSlotSelect(e.target.value)}
                className="input-field text-sm w-full"
              >
                <option value="">Flexible (any time)</option>
                {TIME_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
                <option value="__custom__">Custom time...</option>
              </select>
              {isCustomTime && (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="time"
                    value={customStart}
                    onChange={(e) => handleCustomTime(e.target.value, undefined)}
                    className="input-field text-sm flex-1"
                  />
                  <span className="text-gray-400 text-xs">→</span>
                  <input
                    type="time"
                    value={customEnd}
                    onChange={(e) => handleCustomTime(undefined, e.target.value)}
                    className="input-field text-sm flex-1"
                  />
                </div>
              )}
              {isCustomTime && form.preferredTime && (
                <p className="text-xs text-primary-600 mt-1 font-medium">{form.preferredTime}</p>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Address</label>
            <input value={form.address} onChange={(e) => set('address', e.target.value)}
              placeholder="Customer's address" className="input-field text-sm w-full" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Business</label>
            <select value={form.businessId} onChange={(e) => set('businessId', e.target.value)}
              className="input-field text-sm w-full">
              <option value="cleancruisers">CleanCruisers</option>
              <option value="sofashine">SofaShine</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Notes</label>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)}
              rows={2} placeholder="Any special instructions..." className="input-field text-sm w-full resize-none" />
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} className="btn-ghost flex-1 border border-gray-200 text-sm">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary flex-1 text-sm gap-2">
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Create Subscription'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Subscription Card ────────────────────────────────────────────────────────
function SubCard({ sub, onUpdate, onDelete }) {
  const cfg = STATUS_CONFIG[sub.status];
  const freqLabel = FREQUENCIES.find((f) => f.key === sub.frequency)?.label || sub.frequency;
  const dueDate = new Date(sub.nextDueDate);
  const today = new Date();
  const daysUntil = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
  const isDueSoon = daysUntil <= 2 && sub.status === 'active';

  const toggleStatus = () => {
    const newStatus = sub.status === 'active' ? 'paused' : 'active';
    onUpdate(sub._id, { status: newStatus });
  };

  return (
    <div className={`bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow ${isDueSoon ? 'border-orange-300' : 'border-gray-200'}`}>
      {isDueSoon && (
        <div className="text-xs bg-orange-50 text-orange-600 font-medium px-2 py-1 rounded-lg mb-3">
          ⚡ Due {daysUntil <= 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`}
        </div>
      )}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="font-semibold text-gray-900 text-sm">{sub.name}</div>
          <div className="flex items-center gap-1 text-gray-400 text-xs mt-0.5">
            <Phone className="w-3 h-3" />{sub.phone}
          </div>
        </div>
        <button onClick={() => onDelete(sub._id)}
          className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="text-xs text-gray-600 mb-1">🚗 {sub.service}</div>
      {sub.address && <div className="text-xs text-gray-400 mb-1 line-clamp-1">📍 {sub.address}</div>}
      {sub.preferredTime && <div className="text-xs text-gray-400 mb-1">🕐 {sub.preferredTime}</div>}
      {sub.price > 0 && <div className="text-xs text-gray-500 mb-2">💰 ₹{sub.price}/visit</div>}

      <div className="flex items-center gap-1 mt-3 mb-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg?.color}`}>
          {cfg?.label}
        </span>
        <span className="text-xs text-gray-400 ml-1">{freqLabel}</span>
        <span className="text-xs text-gray-300 ml-auto">{sub.businessId}</span>
      </div>

      <div className="text-xs text-gray-500 mb-3">
        📅 Next due: <span className={`font-medium ${isDueSoon ? 'text-orange-600' : 'text-gray-700'}`}>
          {formatDate(sub.nextDueDate)}
        </span>
      </div>

      <button
        onClick={toggleStatus}
        className={`w-full text-xs font-semibold py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5
          ${sub.status === 'active'
            ? 'bg-yellow-50 hover:bg-yellow-100 text-yellow-700 border border-yellow-200'
            : 'bg-green-50 hover:bg-green-100 text-green-700 border border-green-200'
          }`}
      >
        {sub.status === 'active'
          ? <><PauseCircle className="w-3.5 h-3.5" /> Pause</>
          : <><PlayCircle className="w-3.5 h-3.5" /> Resume</>
        }
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Subscriptions() {
  const [subs, setSubs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [subsRes, statsRes] = await Promise.all([
        subscriptionsAPI.getAll(),
        subscriptionsAPI.getStats(),
      ]);
      setSubs(subsRes.data.data);
      setStats(statsRes.data.data);
    } catch {
      toast.error('Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleUpdate = async (id, data) => {
    try {
      await subscriptionsAPI.update(id, data);
      setSubs((prev) => prev.map((s) => s._id === id ? { ...s, ...data } : s));
      toast.success('Updated');
    } catch {
      toast.error('Failed to update');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this subscription?')) return;
    try {
      await subscriptionsAPI.delete(id);
      setSubs((prev) => prev.filter((s) => s._id !== id));
      toast.success('Deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const filtered = filter === 'all' ? subs : subs.filter((s) => s.status === filter);

  return (
    <AdminLayout title="Subscriptions">
      {showAdd && <AddModal onClose={() => setShowAdd(false)} onSaved={fetchData} />}

      {/* Stats */}
      <div className="flex flex-wrap gap-3 mb-6">
        {[
          { label: 'Total',    value: stats?.total ?? 0,               color: 'text-gray-900' },
          { label: 'Active',   value: stats?.byStatus?.active ?? 0,    color: 'text-green-700' },
          { label: 'Paused',   value: stats?.byStatus?.paused ?? 0,    color: 'text-yellow-700' },
          { label: 'Due soon', value: stats?.dueSoon ?? 0,             color: 'text-orange-600' },
        ].map((s) => (
          <div key={s.label} className="card px-4 py-3 flex items-center gap-3">
            <RepeatIcon className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-600">{s.label}</span>
            <span className={`font-bold ${s.color}`}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex gap-2">
          {['all', 'active', 'paused', 'cancelled'].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium capitalize transition-colors
                ${filter === f ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {f}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={fetchData} disabled={loading} className="btn-ghost border border-gray-200 text-sm gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-sm gap-2">
            <Plus className="w-4 h-4" /> Add Subscription
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <RepeatIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No subscriptions yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((sub) => (
            <SubCard key={sub._id} sub={sub} onUpdate={handleUpdate} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
