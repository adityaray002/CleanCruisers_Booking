import React, { useEffect, useState, useCallback } from 'react';
import {
  Users, Search, Phone, TrendingUp, AlertCircle,
  RefreshCw, ChevronRight, Tag, X, Save, ArrowLeft,
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import { customersAPI } from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/helpers';
import toast from 'react-hot-toast';

const TAGS = ['vip', 'regular', 'new', 'inactive', 'sofa', 'at-risk'];

const TAG_STYLES = {
  vip: 'bg-yellow-100 text-yellow-800',
  regular: 'bg-blue-100 text-blue-800',
  new: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-600',
  sofa: 'bg-purple-100 text-purple-800',
  'at-risk': 'bg-red-100 text-red-700',
};

// ─── Customer Detail Panel ────────────────────────────────────────────────────
function CustomerDetail({ phone, onBack }) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await customersAPI.getOne(phone);
        const c = res.data.data;
        setCustomer(c);
        setNotes(c.notes || '');
        setTags(c.tags || []);
      } catch {
        toast.error('Failed to load customer');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [phone]);

  const toggleTag = (tag) =>
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);

  const save = async () => {
    setSaving(true);
    try {
      await customersAPI.update(phone, { tags, notes });
      toast.success('Customer updated');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <AdminLayout title="Customer Detail">
      <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
    </AdminLayout>
  );

  if (!customer) return null;

  return (
    <AdminLayout title="Customer Detail">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-5">
        <ArrowLeft className="w-4 h-4" /> Back to Customers
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left — Profile */}
        <div className="lg:col-span-1 space-y-4">
          {/* Info card */}
          <div className="card p-5">
            <div className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-xl mb-3">
              {customer.name?.[0]?.toUpperCase() || '?'}
            </div>
            <h2 className="text-lg font-bold text-gray-900">{customer.name}</h2>
            <div className="flex items-center gap-2 text-gray-500 text-sm mt-1">
              <Phone className="w-3.5 h-3.5" />
              {customer.phone}
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-xl font-bold text-gray-900">{customer.totalBookings}</div>
                <div className="text-xs text-gray-500">Bookings</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-xl font-bold text-gray-900">{formatCurrency(customer.totalSpend)}</div>
                <div className="text-xs text-gray-500">Total Spent</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-xl font-bold text-green-700">{customer.completedJobs}</div>
                <div className="text-xs text-gray-500">Completed</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="text-xl font-bold text-red-600">{customer.cancelledJobs}</div>
                <div className="text-xs text-gray-500">Cancelled</div>
              </div>
            </div>

            <div className="mt-3 text-xs text-gray-400">
              Last service: {formatDate(customer.lastServiceDate) || '—'}
            </div>
          </div>

          {/* Tags */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Tag className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-semibold text-gray-700">Tags</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                    tags.includes(tag)
                      ? `${TAG_STYLES[tag]} border-transparent`
                      : 'bg-white border-gray-200 text-gray-400 hover:border-gray-400'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="card p-5">
            <div className="text-sm font-semibold text-gray-700 mb-2">Admin Notes</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Add notes about this customer..."
              className="w-full text-sm border border-gray-200 rounded-lg p-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
            <button
              onClick={save}
              disabled={saving}
              className="mt-2 flex items-center gap-2 btn-primary text-sm w-full justify-center"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Right — Booking History */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Booking History</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {(customer.bookings || []).map((b) => (
                <div key={b._id} className="px-5 py-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="font-mono text-xs text-primary-600 mb-1">{b.bookingId}</div>
                    <div className="text-sm font-medium text-gray-900">{b.serviceLabel}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {formatDate(b.scheduledDate)} · {b.timeSlot}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-semibold text-gray-900">{formatCurrency(b.totalAmount)}</div>
                    <span className={`badge-${b.status} text-xs`}>{b.status}</span>
                  </div>
                </div>
              ))}
              {!customer.bookings?.length && (
                <div className="px-5 py-10 text-center text-sm text-gray-400">No bookings found</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

// ─── Customer List ────────────────────────────────────────────────────────────
export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState('');
  const [atRisk, setAtRisk] = useState(false);
  const [selectedPhone, setSelectedPhone] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (activeTag) params.tag = activeTag;
      if (atRisk) params.atRisk = 'true';

      const [custRes, statsRes] = await Promise.all([
        customersAPI.getAll(params),
        customersAPI.getStats(),
      ]);
      setCustomers(custRes.data.data);
      setStats(statsRes.data.data);
    } catch {
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [search, activeTag, atRisk]);

  useEffect(() => {
    const t = setTimeout(fetchData, search ? 400 : 0);
    return () => clearTimeout(t);
  }, [fetchData]);

  if (selectedPhone) {
    return <CustomerDetail phone={selectedPhone} onBack={() => setSelectedPhone(null)} />;
  }

  return (
    <AdminLayout title="Customers">
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Customers', value: stats?.total ?? '—', icon: Users, color: 'bg-blue-100 text-blue-600' },
          { label: 'Repeat Customers', value: stats?.repeat ?? '—', icon: TrendingUp, color: 'bg-green-100 text-green-600' },
          { label: 'At-Risk (60d)', value: stats?.inactive ?? '—', icon: AlertCircle, color: 'bg-red-100 text-red-600' },
          { label: 'New (1 booking)', value: stats ? stats.total - stats.repeat : '—', icon: Users, color: 'bg-purple-100 text-purple-600' },
        ].map((s) => (
          <div key={s.label} className="card p-5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${s.color}`}>
              <s.icon className="w-5 h-5" />
            </div>
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            <div className="text-sm text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
          </div>

          <button
            onClick={() => { setAtRisk((v) => !v); setActiveTag(''); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
              atRisk ? 'bg-red-50 border-red-300 text-red-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            At-Risk Only
          </button>

          <button
            onClick={fetchData}
            disabled={loading}
            className="btn-ghost border border-gray-200 text-sm gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Tag filters */}
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            onClick={() => setActiveTag('')}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              !activeTag ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-500 hover:border-gray-400'
            }`}
          >
            All
          </button>
          {TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => { setActiveTag(tag === activeTag ? '' : tag); setAtRisk(false); }}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                activeTag === tag
                  ? `${TAG_STYLES[tag]} border-transparent`
                  : 'border-gray-200 text-gray-500 hover:border-gray-400'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-20"><LoadingSpinner size="lg" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Customer', 'Phone', 'Bookings', 'Total Spent', 'Last Service', 'Tags', ''].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr
                    key={c.phone}
                    className="border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedPhone(c.phone)}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-semibold text-sm flex-shrink-0">
                          {c.name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <span className="font-medium text-gray-900">{c.name}</span>
                        {c.isInactive && (
                          <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">at-risk</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{c.phone}</td>
                    <td className="px-5 py-3 font-medium text-gray-900">{c.totalBookings}</td>
                    <td className="px-5 py-3 font-medium text-gray-900">{formatCurrency(c.totalSpend)}</td>
                    <td className="px-5 py-3 text-gray-500">{formatDate(c.lastServiceDate) || '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(c.tags || []).map((tag) => (
                          <span key={tag} className={`text-xs px-2 py-0.5 rounded-full font-medium ${TAG_STYLES[tag]}`}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </td>
                  </tr>
                ))}
                {!customers.length && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-gray-400">
                      No customers found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
