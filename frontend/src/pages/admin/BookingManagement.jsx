import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, Filter, ChevronLeft, ChevronRight, X, Check,
  UserCheck, RefreshCw, Calendar, Clock, Ban,
} from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/AdminLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import { bookingsAPI, staffAPI } from '../../utils/api';
import { formatCurrency, formatDate, formatDateTime, STATUS_CONFIG, SERVICE_ICONS } from '../../utils/helpers';

// ── Time helpers (same as NewBooking) ─────────────────────────────────────────
const PRESETS = [
  { label: '7–8 AM',   start: '07:00', end: '08:00' },
  { label: '8–9 AM',   start: '08:00', end: '09:00' },
  { label: '9–10 AM',  start: '09:00', end: '10:00' },
  { label: '10–11 AM', start: '10:00', end: '11:00' },
  { label: '11–12 PM', start: '11:00', end: '12:00' },
  { label: '12–1 PM',  start: '12:00', end: '13:00' },
  { label: '1–2 PM',   start: '13:00', end: '14:00' },
  { label: '2–3 PM',   start: '14:00', end: '15:00' },
  { label: '3–4 PM',   start: '15:00', end: '16:00' },
  { label: '4–5 PM',   start: '16:00', end: '17:00' },
  { label: '5–6 PM',   start: '17:00', end: '18:00' },
  { label: '6–7 PM',   start: '18:00', end: '19:00' },
  { label: '7–8 PM',   start: '19:00', end: '20:00' },
];

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

const to24h = (t12) => {
  if (!t12) return '';
  const parts = t12.trim().split(' ');
  const period = parts[1];
  const [hStr, mStr] = parts[0].split(':');
  let h = parseInt(hStr, 10);
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${mStr}`;
};

const ACTIVE_STATUSES = ['pending', 'confirmed', 'in_progress', 'completed'];
const ALL_STATUSES    = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];

export default function BookingManagement() {
  // ── Tab ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'cancelled'

  // ── Data ──────────────────────────────────────────────────────────────────
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const LIMIT = 15;

  const [filters, setFilters]           = useState({ search: '', status: '', date: '' });
  const [activeFilters, setActiveFilters] = useState({});
  const [showFilters, setShowFilters]   = useState(false);

  // ── Modal ─────────────────────────────────────────────────────────────────
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [staffList, setStaffList]             = useState([]);
  const [updating, setUpdating]               = useState(false);
  const [updateData, setUpdateData]           = useState({
    status: '', assignedStaff: '', adminNotes: '',
    scheduledDate: '', startTime: '', endTime: '',
  });

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...activeFilters, page, limit: LIMIT };
      if (activeTab === 'cancelled') {
        params.status = 'cancelled';
      } else {
        // Active tab: exclude cancelled (unless admin explicitly filters a status)
        if (!activeFilters.status) params.excludeCancelled = 'true';
      }
      const res = await bookingsAPI.getAll(params);
      setBookings(res.data.data);
      setTotal(res.data.total);
    } catch {
      toast.error('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [activeFilters, page, activeTab]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  // Reset page when tab changes
  useEffect(() => { setPage(1); setActiveFilters({}); setFilters({ search: '', status: '', date: '' }); }, [activeTab]);

  const applyFilters = () => { setActiveFilters({ ...filters }); setPage(1); setShowFilters(false); };
  const clearFilters = () => { setFilters({ search: '', status: '', date: '' }); setActiveFilters({}); setPage(1); };

  // ── Modal open/close ──────────────────────────────────────────────────────
  const openModal = async (booking) => {
    setSelectedBooking(booking);
    // Parse existing timeSlot "HH:MM AM - HH:MM PM" → 24h for the pickers
    const parts = booking.timeSlot?.split(' - ') || [];
    setUpdateData({
      status:        booking.status,
      assignedStaff: booking.assignedStaff?._id || '',
      adminNotes:    booking.adminNotes || '',
      scheduledDate: booking.scheduledDate ? booking.scheduledDate.split('T')[0] : '',
      startTime:     parts[0] ? to24h(parts[0].trim()) : '',
      endTime:       parts[1] ? to24h(parts[1].trim()) : '',
    });
    try {
      const res = await staffAPI.getAll({ active: true });
      setStaffList(res.data.data);
    } catch {}
  };

  const closeModal = () => setSelectedBooking(null);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleUpdate = async () => {
    if (!selectedBooking) return;
    setUpdating(true);
    try {
      const payload = {};

      if (updateData.status !== selectedBooking.status)
        payload.status = updateData.status;

      if (updateData.assignedStaff !== (selectedBooking.assignedStaff?._id || ''))
        payload.assignedStaff = updateData.assignedStaff || 'unassigned';

      if (updateData.adminNotes !== (selectedBooking.adminNotes || ''))
        payload.adminNotes = updateData.adminNotes;

      // Reschedule — check if date or time changed
      const origDate = selectedBooking.scheduledDate?.split('T')[0] || '';
      const origSlot = selectedBooking.timeSlot || '';
      const newSlot  = updateData.startTime && updateData.endTime
        ? `${to12h(updateData.startTime)} - ${to12h(updateData.endTime)}`
        : origSlot;

      if (updateData.scheduledDate && updateData.scheduledDate !== origDate)
        payload.scheduledDate = new Date(updateData.scheduledDate).toISOString();

      if (newSlot !== origSlot)
        payload.timeSlot = newSlot;

      if (Object.keys(payload).length === 0) {
        toast('No changes to save');
        closeModal();
        return;
      }

      await bookingsAPI.update(selectedBooking._id, payload);
      toast.success('Booking updated');
      closeModal();
      fetchBookings();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update booking');
    } finally {
      setUpdating(false);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);
  const activeFilterCount = Object.values(activeFilters).filter(Boolean).length;
  const isCancelledTab = activeTab === 'cancelled';

  return (
    <AdminLayout title="Bookings">

      {/* ── Tabs ── */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('active')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'active'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Active Bookings
        </button>
        <button
          onClick={() => setActiveTab('cancelled')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'cancelled'
              ? 'bg-white text-red-600 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Ban className="w-4 h-4" />
          Cancelled
        </button>
      </div>

      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input-field pl-9 py-2.5 text-sm"
            placeholder="Search by name, phone, booking ID..."
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
          />
        </div>

        {!isCancelledTab && (
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`btn-ghost border gap-2 text-sm ${activeFilterCount > 0 ? 'border-primary-300 text-primary-600 bg-primary-50' : 'border-gray-200'}`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-primary-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        )}

        <button onClick={fetchBookings} className="btn-ghost border border-gray-200 text-sm gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ── Filter panel (active tab only) ── */}
      {showFilters && !isCancelledTab && (
        <div className="card p-4 mb-4 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label text-xs">Status</label>
              <select className="input-field text-sm py-2" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                <option value="">All active</option>
                {ACTIVE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs">Date</label>
              <input type="date" className="input-field text-sm py-2" value={filters.date} onChange={(e) => setFilters((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="flex items-end gap-2">
              <button onClick={applyFilters} className="btn-primary text-sm py-2 flex-1">Apply</button>
              <button onClick={clearFilters} className="btn-ghost border border-gray-200 text-sm py-2 gap-1 flex-1">
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-500">{total} booking{total !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {isCancelledTab
                    ? ['Booking', 'Customer', 'Service', 'Was Scheduled', 'Cancelled On', 'Reason', ''].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))
                    : ['Booking', 'Customer', 'Service', 'Scheduled', 'Staff', 'Amount', 'Status', ''].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))
                  }
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => isCancelledTab ? (
                  /* ── Cancelled row ── */
                  <tr key={b._id} className="border-b border-gray-50 hover:bg-red-50/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-red-500 font-medium">{b.bookingId}</div>
                      <div className="text-xs text-gray-400">{formatDate(b.createdAt)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{b.customerName}</div>
                      <div className="text-xs text-gray-400">{b.customerPhone}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-700">{b.serviceLabel}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      <div>{formatDate(b.scheduledDate)}</div>
                      <div className="text-xs text-gray-400">{b.timeSlot}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                      {b.cancelledAt ? formatDateTime(b.cancelledAt) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-48">
                      {b.cancellationReason || <span className="text-gray-300">No reason given</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openModal(b)}
                        className="text-xs text-primary-600 hover:underline font-medium px-2 py-1 rounded hover:bg-primary-50 transition-colors"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ) : (
                  /* ── Active row ── */
                  <tr key={b._id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-primary-600 font-medium">{b.bookingId}</div>
                      <div className="text-xs text-gray-400">{formatDate(b.createdAt)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{b.customerName}</div>
                      <div className="text-xs text-gray-400">{b.customerPhone}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span>{SERVICE_ICONS[b.serviceType]}</span>
                        <span className="text-gray-700">{b.serviceLabel}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      <div>{formatDate(b.scheduledDate)}</div>
                      <div className="text-xs text-gray-400">{b.timeSlot}</div>
                    </td>
                    <td className="px-4 py-3">
                      {b.assignedStaff ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center text-xs text-primary-700 font-semibold">
                            {b.assignedStaff.name[0]}
                          </div>
                          <span className="text-gray-700 text-xs">{b.assignedStaff.name}</span>
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(b.totalAmount)}</td>
                    <td className="px-4 py-3">
                      <span className={`badge-${b.status}`}>{STATUS_CONFIG[b.status]?.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openModal(b)}
                        className="text-xs text-primary-600 hover:underline font-medium px-2 py-1 rounded hover:bg-primary-50 transition-colors"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {bookings.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-16 text-center text-gray-400">
                      {isCancelledTab ? 'No cancelled bookings' : 'No bookings found'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Edit / View Modal ── */}
      {selectedBooking && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <div>
                <h3 className="font-semibold text-gray-900">
                  {isCancelledTab ? 'Cancelled Booking' : 'Edit Booking'}
                </h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{selectedBooking.bookingId}</p>
              </div>
              <button onClick={closeModal} className="p-2 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Summary */}
              <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Customer</span>
                  <span className="font-medium">{selectedBooking.customerName} · {selectedBooking.customerPhone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Service</span>
                  <span className="font-medium">{selectedBooking.serviceLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Amount</span>
                  <span className="font-bold text-primary-600">{formatCurrency(selectedBooking.totalAmount)}</span>
                </div>
                {isCancelledTab && selectedBooking.cancellationReason && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Reason</span>
                    <span className="font-medium text-red-600">{selectedBooking.cancellationReason}</span>
                  </div>
                )}
              </div>

              {/* ── RESCHEDULE section (active tab only) ── */}
              {!isCancelledTab && (
                <div className="border border-amber-200 rounded-xl p-4 space-y-3 bg-amber-50/40">
                  <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Reschedule
                    <span className="font-normal text-amber-600 ml-1">
                      — current: {formatDate(selectedBooking.scheduledDate)} · {selectedBooking.timeSlot}
                    </span>
                  </p>

                  {/* Date */}
                  <div>
                    <label className="label text-xs">New Date</label>
                    <input
                      type="date"
                      className="input-field text-sm"
                      value={updateData.scheduledDate}
                      onChange={(e) => setUpdateData((d) => ({ ...d, scheduledDate: e.target.value }))}
                    />
                  </div>

                  {/* Time presets */}
                  <div>
                    <label className="label text-xs mb-1">New Time Slot</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {PRESETS.map((p) => {
                        const isActive = updateData.startTime === p.start && updateData.endTime === p.end;
                        return (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => setUpdateData((d) => ({ ...d, startTime: p.start, endTime: p.end }))}
                            className={`px-2.5 py-1 text-xs rounded-lg border transition-all ${
                              isActive
                                ? 'bg-primary-600 text-white border-primary-600'
                                : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400 hover:bg-primary-50'
                            }`}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <input
                          type="time"
                          className="input-field text-sm"
                          value={updateData.startTime}
                          onChange={(e) => setUpdateData((d) => ({ ...d, startTime: e.target.value }))}
                        />
                        <p className="text-[10px] text-gray-400 mt-0.5 pl-1">Start</p>
                      </div>
                      <span className="text-gray-400 text-sm pb-4">→</span>
                      <div className="flex-1">
                        <input
                          type="time"
                          className="input-field text-sm"
                          value={updateData.endTime}
                          onChange={(e) => setUpdateData((d) => ({ ...d, endTime: e.target.value }))}
                        />
                        <p className="text-[10px] text-gray-400 mt-0.5 pl-1">End</p>
                      </div>
                    </div>
                    {updateData.startTime && updateData.endTime && (
                      <p className="text-xs text-primary-600 font-medium mt-1.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        New slot: {to12h(updateData.startTime)} – {to12h(updateData.endTime)}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Status (active tab only) */}
              {!isCancelledTab && (
                <div>
                  <label className="label">Booking Status</label>
                  <select
                    className="input-field"
                    value={updateData.status}
                    onChange={(e) => setUpdateData((d) => ({ ...d, status: e.target.value }))}
                  >
                    {ALL_STATUSES.map((s) => (
                      <option key={s} value={s}>{STATUS_CONFIG[s]?.emoji} {STATUS_CONFIG[s]?.label || s}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Staff assignment (active tab only) */}
              {!isCancelledTab && (
                <div>
                  <label className="label flex items-center gap-2">
                    <UserCheck className="w-4 h-4" /> Assign Staff
                  </label>
                  <select
                    className="input-field"
                    value={updateData.assignedStaff}
                    onChange={(e) => setUpdateData((d) => ({ ...d, assignedStaff: e.target.value }))}
                  >
                    <option value="">— Unassigned —</option>
                    {staffList.filter((s) => s.isActive).map((s) => (
                      <option key={s._id} value={s._id}>{s.name} · {s.phone} · ⭐{s.rating}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Admin notes */}
              <div>
                <label className="label">Admin Notes</label>
                <textarea
                  className="input-field resize-none"
                  rows={3}
                  placeholder="Internal notes..."
                  value={updateData.adminNotes}
                  readOnly={isCancelledTab}
                  onChange={(e) => !isCancelledTab && setUpdateData((d) => ({ ...d, adminNotes: e.target.value }))}
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <button onClick={closeModal} className="btn-ghost flex-1 border border-gray-200 justify-center">
                  {isCancelledTab ? 'Close' : 'Cancel'}
                </button>
                {!isCancelledTab && (
                  <button onClick={handleUpdate} disabled={updating} className="btn-primary flex-1 justify-center">
                    {updating ? <><LoadingSpinner size="sm" /> Saving...</> : <><Check className="w-4 h-4" /> Save Changes</>}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
