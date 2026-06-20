import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays, TrendingUp, Users, CheckCircle, Clock, XCircle,
  ArrowRight, RefreshCw, AlertCircle, UserPlus, Contact,
} from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import { bookingsAPI, customersAPI, leadsAPI } from '../../utils/api';
import { formatCurrency, formatDate, STATUS_CONFIG, SERVICE_ICONS } from '../../utils/helpers';

const PERIOD_OPTIONS = [
  { label: '7 days', value: '7' },
  { label: '30 days', value: '30' },
  { label: '90 days', value: '90' },
];

export default function Dashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [recentBookings, setRecentBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30');
  const [crmStats, setCrmStats] = useState(null);
  const [leadStats, setLeadStats] = useState(null);
  const [topCustomers, setTopCustomers] = useState([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [analyticsRes, bookingsRes, crmRes, leadRes] = await Promise.all([
        bookingsAPI.getAnalytics(period),
        bookingsAPI.getAll({ limit: 8, sort: '-createdAt' }),
        customersAPI.getStats(),
        leadsAPI.getStats(),
      ]);
      setAnalytics(analyticsRes.data.data);
      setRecentBookings(bookingsRes.data.data);
      setCrmStats(crmRes.data.data);
      setTopCustomers(crmRes.data.data.topCustomers || []);
      setLeadStats(leadRes.data.data);
    } catch (err) {
      console.error('Dashboard fetch failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [period]);

  const stats = analytics ? [
    {
      label: 'Total Revenue',
      value: formatCurrency(analytics.totalRevenue),
      icon: TrendingUp,
      color: 'green',
      sub: `${analytics.totalCompletedBookings} completed jobs`,
    },
    {
      label: 'Total Bookings',
      value: analytics.totalBookings,
      icon: CalendarDays,
      color: 'blue',
      sub: `${analytics.todayBookings} today`,
    },
    {
      label: 'Pending',
      value: analytics.pendingBookings,
      icon: Clock,
      color: 'yellow',
      sub: 'Needs confirmation',
    },
    {
      label: 'Completed',
      value: analytics.bookingsByStatus?.completed || 0,
      icon: CheckCircle,
      color: 'purple',
      sub: 'All time',
    },
  ] : [];

  const colorMap = {
    green: 'bg-green-100 text-green-600',
    blue: 'bg-blue-100 text-blue-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    purple: 'bg-purple-100 text-purple-600',
  };

  return (
    <AdminLayout title="Dashboard">
      {/* Period selector */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-medium text-gray-500">Overview for the last</h2>
          <div className="flex gap-2 mt-2">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  period === opt.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="btn-ghost gap-2 text-sm border border-gray-200"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {stats.map((stat) => (
              <div key={stat.label} className="card p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorMap[stat.color]}`}>
                    <stat.icon className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900 mb-1">{stat.value}</div>
                <div className="text-sm font-medium text-gray-700">{stat.label}</div>
                <div className="text-xs text-gray-400 mt-1">{stat.sub}</div>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Status breakdown */}
            <div className="card p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Bookings by Status</h3>
              <div className="space-y-3">
                {Object.entries(analytics?.bookingsByStatus || {}).map(([status, count]) => {
                  const cfg = STATUS_CONFIG[status];
                  const total = analytics.totalBookings || 1;
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={status}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">{cfg?.emoji} {cfg?.label || status}</span>
                        <span className="font-medium text-gray-900">{count}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-500 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Service popularity */}
            <div className="card p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Popular Services</h3>
              <div className="space-y-3">
                {(analytics?.bookingsByService || []).slice(0, 5).map((item) => (
                  <div key={item._id} className="flex items-center gap-3">
                    <span className="text-xl w-8">{SERVICE_ICONS[item._id] || '✨'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate capitalize">
                        {item._id?.replace(/_/g, ' ')}
                      </div>
                      <div className="text-xs text-gray-400">{item.count} bookings · {formatCurrency(item.revenue)}</div>
                    </div>
                  </div>
                ))}
                {(analytics?.bookingsByService || []).length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No data yet</p>
                )}
              </div>
            </div>
          </div>

          {/* CRM Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">

            {/* Customer Stats */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Customers</h3>
                <Link to="/admin/customers" className="text-xs text-primary-600 hover:underline flex items-center gap-1">
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Users className="w-4 h-4 text-blue-500" /> Total Customers
                  </div>
                  <span className="font-bold text-gray-900">{crmStats?.total ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <TrendingUp className="w-4 h-4 text-green-500" /> Repeat Customers
                  </div>
                  <span className="font-bold text-green-700">{crmStats?.repeat ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <AlertCircle className="w-4 h-4 text-red-400" /> At-Risk (60d)
                  </div>
                  <Link to="/admin/customers?atRisk=true" className="font-bold text-red-500 hover:underline">
                    {crmStats?.inactive ?? '—'}
                  </Link>
                </div>
              </div>
            </div>

            {/* Lead Funnel */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Lead Funnel</h3>
                <Link to="/admin/leads" className="text-xs text-primary-600 hover:underline flex items-center gap-1">
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="space-y-2">
                {[
                  { key: 'new',       label: 'New Enquiry',  color: 'bg-blue-500' },
                  { key: 'quoted',    label: 'Quote Sent',   color: 'bg-yellow-500' },
                  { key: 'follow_up', label: 'Follow Up',    color: 'bg-purple-500' },
                  { key: 'booked',    label: 'Booked',       color: 'bg-green-500' },
                  { key: 'lost',      label: 'Lost',         color: 'bg-red-400' },
                ].map((s) => {
                  const count = leadStats?.byStage?.[s.key] ?? 0;
                  const total = leadStats?.total || 1;
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={s.key}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-500">{s.label}</span>
                        <span className="font-semibold text-gray-900">{count}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full ${s.color} rounded-full transition-all duration-500`}
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top Customers */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Top Customers</h3>
                <Link to="/admin/customers" className="text-xs text-primary-600 hover:underline flex items-center gap-1">
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="space-y-3">
                {topCustomers.slice(0, 5).map((c, i) => (
                  <div key={c.phone} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-xs flex-shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{c.name}</div>
                      <div className="text-xs text-gray-400">{c.totalBookings} bookings</div>
                    </div>
                    <div className="text-sm font-semibold text-gray-900 flex-shrink-0">
                      {formatCurrency(c.totalSpend)}
                    </div>
                  </div>
                ))}
                {!topCustomers.length && (
                  <p className="text-sm text-gray-400 text-center py-4">No data yet</p>
                )}
              </div>
            </div>
          </div>

          {/* Recent Bookings */}
          <div className="card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Recent Bookings</h3>
              <Link to="/admin/bookings" className="text-sm text-primary-600 hover:underline flex items-center gap-1">
                View all <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Booking ID', 'Customer', 'Service', 'Date', 'Amount', 'Status'].map((h) => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentBookings.map((b) => (
                    <tr key={b._id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <Link to={`/admin/bookings`} className="font-mono text-xs text-primary-600 hover:underline">
                          {b.bookingId}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-medium text-gray-900">{b.customerName}</div>
                        <div className="text-xs text-gray-400">{b.customerPhone}</div>
                      </td>
                      <td className="px-5 py-3">
                        <span>{SERVICE_ICONS[b.serviceType]} {b.serviceLabel}</span>
                      </td>
                      <td className="px-5 py-3 text-gray-600">{formatDate(b.scheduledDate)}</td>
                      <td className="px-5 py-3 font-medium text-gray-900">{formatCurrency(b.totalAmount)}</td>
                      <td className="px-5 py-3">
                        <span className={`badge-${b.status}`}>
                          {STATUS_CONFIG[b.status]?.label || b.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {recentBookings.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-gray-400">
                        No bookings yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
