import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, RefreshCw, Plus,
  Phone, MapPin, IndianRupee, User, Clock,
  PlayCircle, CheckCircle2, AlertTriangle, Timer,
  CalendarCheck, MessageSquare, Send, Smartphone,
} from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/AdminLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import { bookingsAPI } from '../../utils/api';
import { formatCurrency } from '../../utils/helpers';
import { openWhatsApp, buildWorkerAssignmentMsg, buildWorkerDayScheduleMsg, buildWorkerPingMsg } from '../../utils/whatsapp';

// Parse a slot string like "07:30 AM - 08:30 AM" → minutes since midnight for start or end
function parseSlotMins(slot, which = 'start') {
  if (!slot) return -1;
  const parts = slot.split(' - ');
  const part = (which === 'start' ? parts[0] : parts[1])?.trim();
  if (!part) return -1;
  const [timePart, period] = part.split(' ');
  let [h, m] = timePart.split(':').map(Number);
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return h * 60 + (m || 0);
}

const STATUS_COLORS = {
  pending:     'bg-yellow-100 border-yellow-300 text-yellow-800',
  confirmed:   'bg-blue-100 border-blue-300 text-blue-800',
  in_progress: 'bg-purple-100 border-purple-300 text-purple-800',
  completed:   'bg-green-100 border-green-300 text-green-800',
  cancelled:   'bg-red-100 border-red-300 text-red-400 line-through',
};

const SOURCE_BADGE = {
  phone:   { label: '📞 Call', color: 'bg-blue-100 text-blue-700' },
  walkin:  { label: '🚶 Walk-in', color: 'bg-orange-100 text-orange-700' },
  website: { label: '🌐 Web', color: 'bg-gray-100 text-gray-600' },
  admin:   { label: '🖥️ Admin', color: 'bg-purple-100 text-purple-700' },
};

const formatDateDisplay = (date) =>
  new Date(date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const toDateStr = (date) => date.toISOString().split('T')[0];

const formatTime = (date) => date
  ? new Date(date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  : null;

export default function ScheduleView() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()));
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [clockAction, setClockAction] = useState(null); // 'in' | 'out'
  const [overtimeAlerts, setOvertimeAlerts] = useState([]);
  const [pingModal, setPingModal] = useState(null); // { worker, booking? }
  const [pingMessage, setPingMessage] = useState('');
  const [sendAllModal, setSendAllModal] = useState(false);
  const alertIntervalRef = useRef(null);
  const isToday = selectedDate === toDateStr(new Date());

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const res = await bookingsAPI.getSchedule(selectedDate);
      setSchedule(res.data.data);
    } catch {
      toast.error('Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  // Poll overtime alerts every 2 minutes when viewing today
  const fetchOvertimeAlerts = useCallback(async () => {
    if (!isToday) return;
    try {
      const res = await bookingsAPI.getOvertimeAlerts();
      setOvertimeAlerts(res.data.data);
    } catch { /* silent */ }
  }, [isToday]);

  useEffect(() => {
    fetchSchedule();
    fetchOvertimeAlerts();
  }, [fetchSchedule, fetchOvertimeAlerts]);

  useEffect(() => {
    if (isToday) {
      alertIntervalRef.current = setInterval(fetchOvertimeAlerts, 2 * 60 * 1000);
    }
    return () => clearInterval(alertIntervalRef.current);
  }, [isToday, fetchOvertimeAlerts]);

  const prevDay = () => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(toDateStr(d)); };
  const nextDay = () => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(toDateStr(d)); };
  const goToday = () => setSelectedDate(toDateStr(new Date()));

  // Build grid dynamically from today's bookings (any custom time slot)
  const buildGrid = () => {
    if (!schedule) return { slots: [], grid: {} };
    const { bookings, staff } = schedule;

    // Collect unique slots, sort chronologically by start time
    const slotSet = new Set();
    bookings.forEach((b) => { if (b.timeSlot) slotSet.add(b.timeSlot); });
    const slots = [...slotSet].sort((a, b) => parseSlotMins(a) - parseSlotMins(b));

    const grid = {};
    slots.forEach((slot) => {
      grid[slot] = { unassigned: [] };
      staff.forEach((s) => { grid[slot][s._id] = null; });
    });
    bookings.forEach((b) => {
      const slot = b.timeSlot;
      if (!slot) return;
      if (!grid[slot]) {
        grid[slot] = { unassigned: [] };
        staff.forEach((s) => { grid[slot][s._id] = null; });
      }
      if (b.assignedStaff?._id) grid[slot][b.assignedStaff._id] = b;
      else grid[slot].unassigned.push(b);
    });
    return { slots, grid };
  };

  const updateStatus = async (bookingId, status) => {
    setUpdatingStatus(true);
    try {
      await bookingsAPI.update(bookingId, { status });
      toast.success(`Status → ${status}`);
      setSelectedBooking((b) => b ? { ...b, status } : null);
      fetchSchedule();
      fetchOvertimeAlerts();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleClockIn = async (booking) => {
    setClockAction('in');
    try {
      const res = await bookingsAPI.clockIn(booking._id);
      const { lateMinutes } = res.data.data;
      if (lateMinutes > 0) {
        toast(`Worker arrived ${lateMinutes} min late. Job started now.`, { icon: '⏱️' });
      } else {
        toast.success('Job started — worker clocked in!');
      }
      setSelectedBooking((b) => b ? { ...b, status: 'in_progress', actualStartTime: new Date() } : null);
      fetchSchedule();
      fetchOvertimeAlerts();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Clock-in failed');
    } finally {
      setClockAction(null);
    }
  };

  const handleClockOut = async (booking) => {
    setClockAction('out');
    try {
      const res = await bookingsAPI.clockOut(booking._id);
      const { overtimeMinutes, conflicts } = res.data.data;

      if (conflicts.length > 0) {
        // Show a detailed warning for each affected next booking
        conflicts.forEach((c) => {
          toast.error(
            `⚠️ Next booking affected!\n${c.customerName} — ${c.serviceLabel}\nSlot: ${c.timeSlot}\nDelayed by ~${c.delayMinutes} min\nCall: ${c.customerPhone}`,
            { duration: 10000 }
          );
        });
        setSelectedBooking((b) => b ? { ...b, status: 'completed', actualEndTime: new Date(), overtimeMinutes, conflicts } : null);
      } else if (overtimeMinutes > 0) {
        toast(`Job finished ${overtimeMinutes} min late — no next booking affected.`, { icon: '✅', duration: 5000 });
        setSelectedBooking((b) => b ? { ...b, status: 'completed', actualEndTime: new Date(), overtimeMinutes } : null);
      } else {
        toast.success('Job completed on time!');
        setSelectedBooking((b) => b ? { ...b, status: 'completed', actualEndTime: new Date(), overtimeMinutes: 0 } : null);
      }

      fetchSchedule();
      fetchOvertimeAlerts();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Clock-out failed');
    } finally {
      setClockAction(null);
    }
  };

  // Opens WhatsApp with full job details pre-filled — admin taps Send
  const handleResendJobDetails = (booking) => {
    const message = buildWorkerAssignmentMsg(booking);
    openWhatsApp(booking.assignedStaff.phone, message);
  };

  // Builds worker's day schedule from today's bookings and opens WhatsApp
  const handleSendSchedule = (worker) => {
    const workerBookings = (schedule?.bookings || [])
      .filter((b) =>
        b.assignedStaff?._id?.toString() === worker._id?.toString() &&
        b.status !== 'cancelled'
      )
      .sort((a, b) => parseSlotMins(a.timeSlot) - parseSlotMins(b.timeSlot));
    const message = buildWorkerDayScheduleMsg(worker, workerBookings, selectedDate + 'T00:00:00');
    openWhatsApp(worker.phone, message);
  };

  // Opens a modal listing all workers so admin can open WhatsApp for each one
  const handleSendAllSchedules = () => {
    const workers = schedule?.staff || [];
    if (!workers.length) return;
    setSendAllModal(true);
  };

  const openPingModal = (worker, booking = null) => {
    setPingMessage(booking?.workerNotes || '');
    setPingModal({ worker, booking });
  };

  // Builds ping message and opens WhatsApp — admin taps Send
  const handleSendPing = () => {
    if (!pingMessage.trim() || !pingModal) return;
    const message = buildWorkerPingMsg(pingModal.worker, pingModal.booking, pingMessage.trim());
    openWhatsApp(pingModal.worker.phone, message);
    setPingModal(null);
    setPingMessage('');
  };

  const { slots: timeSlots, grid } = buildGrid();
  const staff = schedule?.staff || [];
  const totalBookings = schedule?.bookings?.length || 0;
  const statusCounts = (schedule?.bookings || []).reduce((acc, b) => {
    acc[b.status] = (acc[b.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <AdminLayout title="Schedule">
      <div className="space-y-4">

        {/* ── Overtime Alert Banner ── */}
        {overtimeAlerts.length > 0 && (
          <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-red-700 font-semibold text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              {overtimeAlerts.length} worker{overtimeAlerts.length > 1 ? 's are' : ' is'} running overtime right now!
            </div>
            {overtimeAlerts.map((alert) => (
              <div key={alert.booking._id} className="bg-white rounded-xl p-3 text-sm space-y-2 border border-red-200">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-red-800">
                    🔴 {alert.worker?.name} — <span className="font-normal">{alert.booking.serviceLabel}</span>
                  </span>
                  <span className="text-red-600 font-bold flex items-center gap-1">
                    <Timer className="w-4 h-4" /> +{alert.overtimeMinutes} min over
                  </span>
                </div>
                <div className="text-gray-500 text-xs">
                  Scheduled: {alert.booking.timeSlot} · Started: {formatTime(alert.booking.actualStartTime) || '?'}
                </div>
                {alert.atRisk.length > 0 && (
                  <div className="mt-1 space-y-1">
                    <p className="text-xs font-semibold text-orange-700">⚠️ Next bookings at risk:</p>
                    {alert.atRisk.map((nb) => (
                      <div key={nb._id} className="flex items-center justify-between bg-orange-50 rounded-lg px-2 py-1 text-xs">
                        <span className="text-orange-800">{nb.customerName} · {nb.serviceLabel} · {nb.timeSlot}</span>
                        <a
                          href={`tel:${nb.customerPhone}`}
                          className="flex items-center gap-1 text-primary-600 font-semibold hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Phone className="w-3 h-3" /> Call
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Date nav ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <button onClick={prevDay} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-center min-w-[220px]">
              <div className="font-semibold text-gray-900">{formatDateDisplay(selectedDate + 'T00:00:00')}</div>
              {isToday && <span className="text-xs text-primary-600 font-medium">Today</span>}
            </div>
            <button onClick={nextDay} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={goToday} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">Today</button>
            <input
              type="date"
              className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 text-gray-600"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { fetchSchedule(); fetchOvertimeAlerts(); }} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
              <RefreshCw className="w-4 h-4 text-gray-500" />
            </button>
            {staff.length > 0 && (
              <button
                onClick={handleSendAllSchedules}
                title="Open WhatsApp for each worker with their schedule"
                className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 font-medium"
              >
                <CalendarCheck className="w-4 h-4" /> Send All Schedules ↗
              </button>
            )}
            <button onClick={() => navigate('/admin/new-booking')} className="btn-primary gap-1.5 text-sm">
              <Plus className="w-4 h-4" /> New Booking
            </button>
          </div>
        </div>

        {/* ── Day stats ── */}
        <div className="flex gap-3 flex-wrap">
          <span className="text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-full font-medium">
            {totalBookings} booking{totalBookings !== 1 ? 's' : ''}
          </span>
          {Object.entries(statusCounts).map(([status, count]) => (
            <span key={status} className={`text-xs px-3 py-1 rounded-full font-medium border ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
              {count} {status.replace('_', ' ')}
            </span>
          ))}
          {totalBookings === 0 && !loading && (
            <span className="text-xs text-gray-400">No bookings for this day</span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><LoadingSpinner /></div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              {/* Header */}
              <div
                className="grid gap-px bg-gray-200 rounded-t-xl overflow-hidden"
                style={{ gridTemplateColumns: `140px repeat(${staff.length + 1}, 1fr)` }}
              >
                <div className="bg-gray-800 text-white text-xs font-semibold px-3 py-3 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Time Slot
                </div>
                {staff.map((s) => (
                  <div key={s._id} className="bg-gray-800 text-white text-xs px-3 py-3">
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-gray-400 mt-0.5">{s.phone}</div>
                    <div className="flex gap-1 mt-1.5">
                      <button
                        onClick={() => handleSendSchedule(s)}
                        title="Open WhatsApp with today's schedule pre-filled"
                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-green-700 hover:bg-green-600 text-white text-[10px]"
                      >
                        <CalendarCheck className="w-2.5 h-2.5" /> Schedule ↗
                      </button>
                      <button
                        onClick={() => openPingModal(s)}
                        title="Open WhatsApp with custom message"
                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-700 hover:bg-blue-600 text-white text-[10px]"
                      >
                        <MessageSquare className="w-2.5 h-2.5" /> Ping
                      </button>
                    </div>
                  </div>
                ))}
                <div className="bg-gray-700 text-gray-300 text-xs font-semibold px-3 py-3">Unassigned</div>
              </div>

              {/* Rows — built from actual bookings (any custom time slot) */}
              {timeSlots.length === 0 ? (
                <div className="border border-gray-200 border-t-0 rounded-b-xl overflow-hidden bg-white">
                  <div className="flex flex-col items-center justify-center py-14 text-gray-400 gap-3">
                    <Clock className="w-8 h-8 text-gray-200" />
                    <p className="text-sm">No bookings yet for this day.</p>
                    <button
                      onClick={() => navigate(`/admin/new-booking?date=${selectedDate}`)}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl bg-primary-600 text-white hover:bg-primary-700 font-medium"
                    >
                      <Plus className="w-4 h-4" /> Add First Booking
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border border-gray-200 border-t-0 rounded-b-xl overflow-hidden divide-y divide-gray-100">
                  {timeSlots.map((slot, i) => {
                    const active = isToday && isCurrentTimeSlot(slot);
                    return (
                      <div
                        key={slot}
                        className={`grid gap-px ${active ? 'bg-primary-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                        style={{ gridTemplateColumns: `140px repeat(${staff.length + 1}, 1fr)` }}
                      >
                        <div className={`px-3 py-3 text-xs font-medium flex flex-col justify-center ${active ? 'text-primary-700' : 'text-gray-600'}`}>
                          {slot.split(' - ').map((t, j) => <span key={j}>{t}</span>)}
                          {active && <span className="text-primary-500 font-bold text-[10px] mt-0.5">▶ NOW</span>}
                        </div>
                        {staff.map((s) => {
                          const booking = grid[slot]?.[s._id];
                          return (
                            <div key={s._id} className="p-1.5 min-h-[72px]">
                              {booking ? (
                                <BookingCard booking={booking} onClick={() => setSelectedBooking(booking)} />
                              ) : (
                                <div
                                  className="h-full min-h-[60px] border-2 border-dashed border-gray-100 rounded-lg flex items-center justify-center cursor-pointer hover:border-primary-200 hover:bg-primary-50/30 transition-all group"
                                  onClick={() => navigate(`/admin/new-booking?date=${selectedDate}&slot=${encodeURIComponent(slot)}`)}
                                >
                                  <Plus className="w-4 h-4 text-gray-200 group-hover:text-primary-400" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <div className="p-1.5 min-h-[72px] space-y-1">
                          {(grid[slot]?.unassigned || []).map((b) => (
                            <BookingCard key={b._id} booking={b} onClick={() => setSelectedBooking(b)} />
                          ))}
                          <div
                            className="border-2 border-dashed border-gray-100 rounded-lg flex items-center justify-center py-2 cursor-pointer hover:border-primary-200 hover:bg-primary-50/30 group"
                            onClick={() => navigate(`/admin/new-booking?date=${selectedDate}&slot=${encodeURIComponent(slot)}`)}
                          >
                            <Plus className="w-3 h-3 text-gray-200 group-hover:text-primary-400" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Booking Detail Drawer ── */}
      {selectedBooking && (
        <div className="fixed inset-0 bg-black/40 z-40 flex justify-end" onClick={() => setSelectedBooking(null)}>
          <div
            className="w-full max-w-sm bg-white h-full overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
              <div>
                <div className="font-bold text-gray-900">{selectedBooking.bookingId}</div>
                <div className={`inline-flex text-xs px-2 py-0.5 rounded-full border mt-1 font-medium ${STATUS_COLORS[selectedBooking.status]}`}>
                  {selectedBooking.status.replace('_', ' ')}
                </div>
              </div>
              <button onClick={() => setSelectedBooking(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">✕</button>
            </div>

            <div className="p-5 space-y-4 text-sm">

              {/* Source */}
              {selectedBooking.source && SOURCE_BADGE[selectedBooking.source] && (
                <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${SOURCE_BADGE[selectedBooking.source].color}`}>
                  {SOURCE_BADGE[selectedBooking.source].label}
                </span>
              )}

              {/* Customer */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-gray-800">
                  <User className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="font-medium">{selectedBooking.customerName}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                  <a href={`tel:${selectedBooking.customerPhone}`} className="hover:text-primary-600 font-medium">
                    {selectedBooking.customerPhone}
                  </a>
                </div>
                <div className="flex items-start gap-2 text-gray-600">
                  <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                  <span>{selectedBooking.address?.line1}, {selectedBooking.address?.city}</span>
                </div>
              </div>

              <hr className="border-gray-100" />

              {/* Service + price */}
              <div className="space-y-1">
                <div className="font-semibold text-gray-900">{selectedBooking.serviceLabel}</div>
                {selectedBooking.customServiceDescription && (
                  <p className="text-gray-500 text-xs">{selectedBooking.customServiceDescription}</p>
                )}
                <div className="flex items-center gap-1 text-primary-600 font-bold text-base">
                  <IndianRupee className="w-4 h-4" />
                  {selectedBooking.totalAmount === 0 ? 'TBD' : formatCurrency(selectedBooking.totalAmount).replace('₹', '')}
                </div>
              </div>

              {/* Scheduled time */}
              <div className="flex items-center gap-2 text-gray-600">
                <Clock className="w-4 h-4 text-gray-400" />
                <span>{selectedBooking.timeSlot}</span>
              </div>

              {/* ── Actual timing tracker ── */}
              <div className={`rounded-xl p-4 space-y-3 border-2 ${
                selectedBooking.status === 'in_progress'
                  ? 'bg-purple-50 border-purple-200'
                  : selectedBooking.status === 'completed'
                    ? selectedBooking.overtimeMinutes > 0 ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'
                    : 'bg-gray-50 border-gray-200'
              }`}>
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Job Timing</p>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-gray-400">Scheduled start</div>
                    <div className="font-semibold text-gray-700">{selectedBooking.timeSlot?.split(' - ')[0]}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Scheduled end</div>
                    <div className="font-semibold text-gray-700">{selectedBooking.timeSlot?.split(' - ')[1]}</div>
                  </div>
                  {selectedBooking.actualStartTime && (
                    <div>
                      <div className="text-gray-400">Actual start</div>
                      <div className="font-semibold text-purple-700">{formatTime(selectedBooking.actualStartTime)}</div>
                    </div>
                  )}
                  {selectedBooking.actualEndTime && (
                    <div>
                      <div className="text-gray-400">Actual end</div>
                      <div className={`font-semibold ${selectedBooking.overtimeMinutes > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                        {formatTime(selectedBooking.actualEndTime)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Overtime badge */}
                {selectedBooking.overtimeMinutes > 0 && (
                  <div className="flex items-center gap-2 bg-orange-100 text-orange-700 rounded-lg px-3 py-2 text-xs font-semibold">
                    <Timer className="w-4 h-4 shrink-0" />
                    Ran {selectedBooking.overtimeMinutes} min overtime
                  </div>
                )}

                {/* Conflict list after clock-out */}
                {selectedBooking.conflicts?.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-red-700">Affected next bookings:</p>
                    {selectedBooking.conflicts.map((c) => (
                      <div key={c._id} className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs">
                        <div className="font-semibold text-red-800">{c.customerName} · {c.serviceLabel}</div>
                        <div className="text-red-600">Delayed ~{c.delayMinutes} min · {c.timeSlot}</div>
                        <a href={`tel:${c.customerPhone}`} className="text-primary-600 font-semibold hover:underline flex items-center gap-1 mt-1">
                          <Phone className="w-3 h-3" /> Call customer
                        </a>
                      </div>
                    ))}
                  </div>
                )}

                {/* Clock-in / Clock-out buttons */}
                <div className="flex gap-2 mt-2">
                  {selectedBooking.status === 'confirmed' && (
                    <button
                      onClick={() => handleClockIn(selectedBooking)}
                      disabled={!!clockAction}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-60"
                    >
                      {clockAction === 'in' ? <LoadingSpinner size="sm" /> : <PlayCircle className="w-4 h-4" />}
                      Worker Started
                    </button>
                  )}
                  {selectedBooking.status === 'in_progress' && (
                    <button
                      onClick={() => handleClockOut(selectedBooking)}
                      disabled={!!clockAction}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-60"
                    >
                      {clockAction === 'out' ? <LoadingSpinner size="sm" /> : <CheckCircle2 className="w-4 h-4" />}
                      Job Finished
                    </button>
                  )}
                </div>
              </div>

              {/* Worker */}
              {selectedBooking.assignedStaff && (
                <div className="bg-blue-50 rounded-xl p-3 space-y-2">
                  <div className="text-xs text-blue-500 font-medium">Assigned Worker</div>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-blue-900">{selectedBooking.assignedStaff.name}</div>
                      <div className="text-blue-700 text-sm">{selectedBooking.assignedStaff.phone}</div>
                    </div>
                    <button
                      onClick={() => openPingModal(selectedBooking.assignedStaff, selectedBooking)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium shrink-0"
                    >
                      <MessageSquare className="w-3.5 h-3.5" /> Message
                    </button>
                  </div>
                  <button
                    onClick={() => handleResendJobDetails(selectedBooking)}
                    disabled={selectedBooking.status === 'cancelled'}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    <Smartphone className="w-3.5 h-3.5" /> Open WhatsApp with Job Details ↗
                  </button>
                  <p className="text-[10px] text-blue-400 text-center">
                    Opens WhatsApp pre-filled — just tap Send
                  </p>
                </div>
              )}

              {/* Worker notes */}
              {selectedBooking.workerNotes && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <div className="text-xs font-semibold text-amber-700 mb-1">📋 Worker Notes</div>
                  <p className="text-amber-800 text-xs">{selectedBooking.workerNotes}</p>
                </div>
              )}

              {/* Admin notes */}
              {selectedBooking.adminNotes && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <div className="text-xs font-semibold text-gray-500 mb-1">Internal Notes</div>
                  <p className="text-gray-600 text-xs">{selectedBooking.adminNotes}</p>
                </div>
              )}

              <hr className="border-gray-100" />

              {/* Status update */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Update Status</p>
                <div className="grid grid-cols-2 gap-2">
                  {['confirmed', 'in_progress', 'completed', 'cancelled'].map((s) => (
                    <button
                      key={s}
                      disabled={selectedBooking.status === s || updatingStatus}
                      onClick={() => updateStatus(selectedBooking._id, s)}
                      className={`py-2 px-3 rounded-xl text-xs font-medium border-2 transition-all
                        ${selectedBooking.status === s
                          ? `${STATUS_COLORS[s]} opacity-80 cursor-default`
                          : 'border-gray-200 hover:border-gray-300 text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                      {s.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
      {/* ── Send All Schedules Modal ── */}
      {sendAllModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSendAllModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">Send Schedules</h3>
                <p className="text-sm text-gray-500">Open WhatsApp for each worker</p>
              </div>
              <button onClick={() => setSendAllModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">✕</button>
            </div>
            <div className="space-y-2">
              {(schedule?.staff || []).map((worker) => {
                const count = (schedule?.bookings || []).filter(
                  (b) => b.assignedStaff?._id?.toString() === worker._id?.toString() && b.status !== 'cancelled'
                ).length;
                return (
                  <div key={worker._id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                    <div>
                      <div className="font-semibold text-gray-900 text-sm">{worker.name}</div>
                      <div className="text-xs text-gray-400">{count} job{count !== 1 ? 's' : ''} today</div>
                    </div>
                    <button
                      onClick={() => handleSendSchedule(worker)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold"
                    >
                      <CalendarCheck className="w-3.5 h-3.5" /> Open WhatsApp ↗
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-400 text-center">
              Each button opens WhatsApp with that worker's schedule pre-filled — just tap Send.
            </p>
          </div>
        </div>
      )}

      {/* ── Manual Ping Modal ── */}
      {pingModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPingModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">Message Worker</h3>
                <p className="text-sm text-gray-500">→ {pingModal.worker.name}</p>
              </div>
              <button onClick={() => setPingModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">✕</button>
            </div>

            {pingModal.booking && (
              <div className="bg-gray-50 rounded-xl px-3 py-2 text-xs text-gray-600">
                Re: <span className="font-semibold">{pingModal.booking.bookingId}</span>
                {' · '}{pingModal.booking.serviceLabel}
                {' · '}{pingModal.booking.timeSlot}
              </div>
            )}

            <div className="space-y-1.5">
              {pingModal.booking && (
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-500">
                    {pingModal.booking.workerNotes ? '📋 Worker Notes (pre-filled)' : 'Message'}
                  </label>
                  {!pingModal.booking.workerNotes && (
                    <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                      No worker notes on this booking
                    </span>
                  )}
                </div>
              )}
              <textarea
                autoFocus
                rows={4}
                className="w-full bg-white text-gray-900 placeholder-gray-400 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-300 focus:border-primary-400 outline-none resize-none"
                placeholder={pingModal.booking ? 'Add worker notes to the booking first, or type a message here…' : 'Type your message to the worker…'}
                value={pingMessage}
                onChange={(e) => setPingMessage(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setPingModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSendPing}
                disabled={!pingMessage.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                <Send className="w-4 h-4" /> Open WhatsApp ↗
              </button>
            </div>
          </div>
        </div>
      )}

    </AdminLayout>
  );
}

function BookingCard({ booking, onClick }) {
  const srcBadge = SOURCE_BADGE[booking.source] || SOURCE_BADGE.admin;
  const isOvertime = booking.status === 'in_progress' && isRunningOvertime(booking.timeSlot);
  return (
    <div
      onClick={onClick}
      className={`p-2 rounded-lg border cursor-pointer hover:shadow-md transition-all text-xs relative
        ${isOvertime ? 'bg-red-50 border-red-300 animate-pulse' : STATUS_COLORS[booking.status] || 'bg-gray-100 border-gray-200'}`}
    >
      {isOvertime && (
        <div className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
          <Timer className="w-2.5 h-2.5" /> LATE
        </div>
      )}
      <div className="font-semibold truncate">{booking.customerName}</div>
      <div className="truncate opacity-80 mt-0.5">{booking.serviceLabel}</div>
      <div className="flex items-center justify-between mt-1 gap-1">
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${srcBadge.color}`}>{srcBadge.label}</span>
        <span className="font-medium">
          {booking.totalAmount === 0 ? 'TBD' : formatCurrency(booking.totalAmount)}
        </span>
      </div>
      {booking.actualStartTime && booking.status === 'in_progress' && (
        <div className="text-[10px] text-purple-600 mt-0.5">▶ Started {formatTime(booking.actualStartTime)}</div>
      )}
    </div>
  );
}

function isCurrentTimeSlot(slot) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = parseSlotMins(slot, 'start');
  const endMin   = parseSlotMins(slot, 'end');
  return startMin >= 0 && endMin > 0 && nowMin >= startMin && nowMin < endMin;
}

function isRunningOvertime(slot) {
  if (!slot) return false;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const endMin  = parseSlotMins(slot, 'end');
  return endMin > 0 && nowMin >= endMin;
}
