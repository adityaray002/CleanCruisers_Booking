import React, { useState, useEffect, useCallback } from 'react';
import { Search, Filter, ChevronLeft, ChevronRight, X, Check, UserCheck, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/AdminLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import { bookingsAPI, staffAPI } from '../../utils/api';
import { formatCurrency, formatDate, formatDateTime, STATUS_CONFIG, SERVICE_ICONS } from '../../utils/helpers';

const STATUSES = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
const SERVICE_TYPES = ['sofa_cleaning', 'deep_cleaning', 'car_cleaning', 'carpet_cleaning', 'bathroom_cleaning', 'kitchen_cleaning', 'general_cleaning'];

export default function BookingManagement() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const LIMIT = 15;

  const [filters, setFilters] = useState({ search: '', status: '', serviceType: '', date: '' });
  const [activeFilters, setActiveFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);

  // Modal state
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [updating, setUpdating] = useState(false);
  const [updateData, setUpdateData] = useState({ status: '', assignedStaff: '', adminNotes: '' });

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await bookingsAPI.getAll({ ...activeFilters, page, limit: LIMIT });
      setBookings(res.data.data);
      setTotal(res.data.total);
    } catch (err) {
      toast.error('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [activeFilters, page]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const applyFilters = () => {
    setActiveFilters({ ...filters });
    setPage(1);
    setShowFilters(false);
  };

  const clearFilters = () => {
    setFilters({ search: '', status: '', serviceType: '', date: '' });
    setActiveFilters({});
    setPage(1);
  };

  const openModal = async (booking) => {
    setSelectedBooking(booking);
    setUpdateData({
      status: booking.status,
      assignedStaff: booking.assignedStaff?._id || '',
      adminNotes: booking.adminNotes || '',
    });
    // Load available staff
    try {
      const res = await staffAPI.getAll({ active: true });
      setStaffList(res.data.data);
    } catch {}
  };

  const closeModal = () => setSelectedBooking(null);

  const handleUpdate = async () => {
    if (!selectedBooking) return;
    setUpdating(true);
    try {
      const payload = {};
      if (updateData.status !== selectedBooking.status) payload.status = updateData.status;
      if (updateData.assignedStaff !== (selectedBooking.assignedStaff?._id || '')) payload.assignedStaff = updateData.assignedStaff || null;
      if (updateData.adminNotes !== (selectedBooking.adminNotes || '')) payload.adminNotes = updateData.adminNotes;

      if (Object.keys(payload).length === 0) {
        toast('No changes to save');
        closeModal();
        return;
      }

      await bookingsAPI.update(selectedBooking._id, payload);
      toast.success('Booking updated successfully');
      closeModal();
      fetchBookings();
    } catch (err) {
      toast.error('Failed to update booking');
    } finally {
      setUpdating(false);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);
  const activeFilterCount = Object.values(activeFilters).filter(Boolean).length;

  return (
    <AdminLayout title="Bookings">
      {/* Top bar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {/* Search */}
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

        <button onClick={fetchBookings} className="btn-ghost border border-gray-200 text-sm gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="card p-4 mb-4 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label text-xs">Status</label>
              <select className="input-field text-sm py-2" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                <option value="">All statuses</option>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs">Service Type</label>
              <select className="input-field text-sm py-2" value={filters.serviceType} onChange={(e) => setFilters((f) => ({ ...f, serviceType: e.target.value }))}>
                <option value="">All services</option>
                {SERVICE_TYPES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs">Date</label>
              <input type="date" className="input-field text-sm py-2" value={filters.date} onChange={(e) => setFilters((f) => ({ ...f, date: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={applyFilters} className="btn-primary text-sm py-2">Apply Filters</button>
            <button onClick={clearFilters} className="btn-ghost border border-gray-200 text-sm py-2 gap-1">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        </div>
      )}

      {/* Table */}
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
                  {['Booking', 'Customer', 'Service', 'Scheduled', 'Staff', 'Amount', 'Status', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
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
                      <div className="text-xs text-gray-400">{b.timeSlot?.split(' - ')[0]}</div>
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
                      <span className={`badge-${b.status}`}>
                        {STATUS_CONFIG[b.status]?.label}
                      </span>
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
                      No bookings found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {selectedBooking && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
              <div>
                <h3 className="font-semibold text-gray-900">Edit Booking</h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{selectedBooking.bookingId}</p>
              </div>
              <button onClick={closeModal} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Booking summary */}
              <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Customer</span>
                  <span className="font-medium">{selectedBooking.customerName} · {selectedBooking.customerPhone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Service</span>
                  <span className="font-medium">{SERVICE_ICONS[selectedBooking.serviceType]} {selectedBooking.serviceLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Scheduled</span>
                  <span className="font-medium">{formatDate(selectedBooking.scheduledDate)} · {selectedBooking.timeSlot}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Amount</span>
                  <span className="font-bold text-primary-600">{formatCurrency(selectedBooking.totalAmount)}</span>
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="label">Booking Status</label>
                <select
                  className="input-field"
                  value={updateData.status}
                  onChange={(e) => setUpdateData((d) => ({ ...d, status: e.target.value }))}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS_CONFIG[s]?.emoji} {STATUS_CONFIG[s]?.label || s}</option>
                  ))}
                </select>
              </div>

              {/* Staff assignment */}
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
                    <option key={s._id} value={s._id}>
                      {s.name} · {s.phone} · ⭐{s.rating}
                    </option>
                  ))}
                </select>
              </div>

              {/* Admin notes */}
              <div>
                <label className="label">Admin Notes</label>
                <textarea
                  className="input-field resize-none"
                  rows={3}
                  placeholder="Internal notes about this booking..."
                  value={updateData.adminNotes}
                  onChange={(e) => setUpdateData((d) => ({ ...d, adminNotes: e.target.value }))}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={closeModal} className="btn-ghost flex-1 border border-gray-200 justify-center">
                  Cancel
                </button>
                <button onClick={handleUpdate} disabled={updating} className="btn-primary flex-1 justify-center">
                  {updating ? <><LoadingSpinner size="sm" /> Saving...</> : <><Check className="w-4 h-4" /> Save Changes</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
