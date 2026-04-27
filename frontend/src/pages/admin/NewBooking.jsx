import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Phone, User, MapPin, Calendar, Clock, IndianRupee,
  FileText, CheckCircle, AlertTriangle, Search, Loader2,
  PhoneCall, Store, Globe,
} from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/AdminLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import { bookingsAPI, staffAPI } from '../../utils/api';
import { formatCurrency, formatDate, INDIAN_STATES } from '../../utils/helpers';

// Quick 1-hour preset slots the admin can tap to auto-fill the time pickers
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

// 24h "HH:MM"  →  "HH:MM AM/PM"
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

// "HH:MM AM/PM"  →  24h "HH:MM"
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

const SOURCE_OPTIONS = [
  { id: 'phone', label: 'Phone Call', icon: PhoneCall },
  { id: 'walkin', label: 'Walk-in', icon: Store },
  { id: 'admin', label: 'Admin Entry', icon: Globe },
];

const EMPTY = {
  customerPhone: '', customerName: '', customerEmail: '',
  address: { line1: '', line2: '', city: '', state: '', pincode: '', landmark: '' },
  scheduledDate: '', timeSlot: '',
  serviceName: '', serviceDescription: '',
  price: '',
  assignedStaffId: '',
  workerNotes: '',
  adminNotes: '',
  paymentMethod: 'cod',
  source: 'phone',
};

export default function NewBooking() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const phoneRef = useRef();

  const [form, setForm] = useState({ ...EMPTY });
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime]     = useState('');
  const [staffSlots, setStaffSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [pastBookings, setPastBookings] = useState([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  // Auto-focus phone; pre-fill from URL params (date + slot passed by ScheduleView's + button)
  useEffect(() => {
    phoneRef.current?.focus();
    const dateParam = searchParams.get('date');
    const slotParam = searchParams.get('slot');
    if (dateParam) setForm((f) => ({ ...f, scheduledDate: dateParam }));
    if (slotParam) {
      const parts = slotParam.split(' - ');
      if (parts.length === 2) {
        setStartTime(to24h(parts[0].trim()));
        setEndTime(to24h(parts[1].trim()));
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Whenever start/end times change → rebuild the timeSlot string
  useEffect(() => {
    const newSlot = startTime && endTime ? `${to12h(startTime)} - ${to12h(endTime)}` : '';
    setForm((f) => ({ ...f, timeSlot: newSlot, assignedStaffId: '' }));
    setErrors((e) => ({ ...e, timeSlot: undefined }));
  }, [startTime, endTime]);

  // Fetch staff availability whenever date + timeSlot change
  useEffect(() => {
    if (!form.scheduledDate || !form.timeSlot) { setStaffSlots([]); return; }
    setSlotsLoading(true);
    staffAPI.getBySlot(form.scheduledDate, form.timeSlot)
      .then((res) => setStaffSlots(res.data.data))
      .catch(() => setStaffSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [form.scheduledDate, form.timeSlot]);

  const set = (field, val) => {
    setForm((f) => ({ ...f, [field]: val }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const setAddr = (field, val) => {
    setForm((f) => ({ ...f, address: { ...f.address, [field]: val } }));
  };

  // Phone lookup — auto-fill customer details from past bookings
  const lookupPhone = async () => {
    const phone = form.customerPhone.trim();
    if (phone.length < 7) return;
    setLookupLoading(true);
    try {
      const res = await bookingsAPI.getCustomerHistory(phone);
      const bookings = res.data.data;
      setPastBookings(bookings);
      if (bookings.length > 0) {
        const last = bookings[0];
        setForm((f) => ({
          ...f,
          customerName: f.customerName || last.customerName || '',
          address: {
            line1: f.address.line1 || last.address?.line1 || '',
            line2: f.address.line2 || last.address?.line2 || '',
            city: f.address.city || last.address?.city || '',
            state: f.address.state || last.address?.state || '',
            pincode: f.address.pincode || last.address?.pincode || '',
            landmark: f.address.landmark || last.address?.landmark || '',
          },
        }));
        toast.success(`Returning customer — ${bookings.length} past booking${bookings.length > 1 ? 's' : ''} found`);
      }
    } catch {
      // No history found — that's fine
    } finally {
      setLookupLoading(false);
    }
  };

  const [coordPasteValue, setCoordPasteValue] = useState('');

  const captureLocation = () => {
    if (!navigator.geolocation) { toast.error('Geolocation not supported by this browser'); return; }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setAddr('coordinates', { lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast.success('Location pinned — Google Maps link will be sent to worker');
        setLocationLoading(false);
      },
      (err) => {
        toast.error(err.code === err.PERMISSION_DENIED
          ? 'Location access denied'
          : 'Could not get location, please try again');
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Parse customer coordinates pasted from WhatsApp message.
  // Accepts: "28.6302829,77.0141382"  OR  "https://maps.google.com/?q=28.6302829,77.0141382"
  const parseAndSetCoords = (raw) => {
    setCoordPasteValue(raw);
    const match = raw.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
    if (match) {
      const lat = parseFloat(match[1]);
      const lng = parseFloat(match[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        setAddr('coordinates', { lat, lng });
        setCoordPasteValue('');
        toast.success('Customer location set from WhatsApp coordinates');
      }
    }
  };

  const validate = () => {
    const e = {};
    if (!form.customerName.trim()) e.customerName = 'Required';
    if (!form.customerPhone.trim()) e.customerPhone = 'Required';
    const hasAddress = !!form.address.line1.trim();
    const hasCoords  = !!(form.address.coordinates?.lat && form.address.coordinates?.lng);
    if (!hasAddress && !hasCoords) e['address.line1'] = 'Enter an address or paste GPS coordinates above';
    if (!form.scheduledDate) e.scheduledDate = 'Required';
    if (!form.timeSlot) e.timeSlot = 'Required';
    if (!form.serviceName.trim()) e.serviceName = 'Required';
    if (form.price === '' || isNaN(Number(form.price))) e.price = 'Enter a valid amount (0 for TBD)';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) { toast.error('Please fill in all required fields'); return; }
    setSaving(true);
    try {
      const res = await bookingsAPI.adminCreate({
        customerName: form.customerName,
        customerEmail: form.customerEmail,
        customerPhone: form.customerPhone,
        serviceName: form.serviceName,
        serviceDescription: form.serviceDescription,
        price: Number(form.price) || 0,
        scheduledDate: new Date(form.scheduledDate).toISOString(),
        timeSlot: form.timeSlot,
        address: form.address,
        assignedStaffId: form.assignedStaffId || undefined,
        workerNotes: form.workerNotes,
        adminNotes: form.adminNotes,
        paymentMethod: form.paymentMethod,
        source: form.source,
      });
      const booking = res.data.data;
      toast.success(`Booking ${booking.bookingId} created!`);
      navigate('/admin/schedule');
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to create booking';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const maxDateStr = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  return (
    <AdminLayout title="New Booking">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Source badges */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">Booking source:</span>
          {SOURCE_OPTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => set('source', s.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                ${form.source === s.id
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400'
                }`}
            >
              <s.icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          ))}
        </div>

        {/* ── Customer Details ── */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <User className="w-4 h-4 text-primary-600" /> Customer Details
          </h2>

          {/* Phone with lookup */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="label">Phone Number *</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  ref={phoneRef}
                  className={`input-field pl-9 ${errors.customerPhone ? 'input-error' : ''}`}
                  value={form.customerPhone}
                  onChange={(e) => set('customerPhone', e.target.value)}
                  onBlur={lookupPhone}
                  placeholder="9876543210"
                  maxLength={10}
                />
              </div>
              {errors.customerPhone && <p className="text-red-500 text-xs mt-1">{errors.customerPhone}</p>}
            </div>
            <div className="pt-6">
              <button
                onClick={lookupPhone}
                disabled={lookupLoading}
                className="btn-ghost px-3 py-2.5 border border-gray-300"
                title="Look up customer"
              >
                {lookupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Past bookings badge */}
          {pastBookings.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-green-700 mb-1.5">Returning Customer — Recent Bookings:</p>
              <div className="space-y-1">
                {pastBookings.slice(0, 3).map((b) => (
                  <div key={b._id} className="flex items-center justify-between text-xs text-green-700">
                    <span>{formatDate(b.scheduledDate)} · {b.serviceLabel}</span>
                    <span className="capitalize">{b.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Customer Name *</label>
              <input
                className={`input-field ${errors.customerName ? 'input-error' : ''}`}
                value={form.customerName}
                onChange={(e) => set('customerName', e.target.value)}
                placeholder="Rahul Sharma"
              />
              {errors.customerName && <p className="text-red-500 text-xs mt-1">{errors.customerName}</p>}
            </div>
            <div>
              <label className="label">Email <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="email"
                className="input-field"
                value={form.customerEmail}
                onChange={(e) => set('customerEmail', e.target.value)}
                placeholder="rahul@email.com"
              />
            </div>
          </div>
        </div>

        {/* ── Address ── */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary-600" /> Service Address
          </h2>
          <div>
            <label className="label">
              Address
              <span className="ml-1.5 text-xs font-normal text-gray-400">(or paste GPS below)</span>
            </label>
            <input
              className={`input-field ${errors['address.line1'] ? 'input-error' : ''}`}
              value={form.address.line1}
              onChange={(e) => { setAddr('line1', e.target.value); setErrors((er) => ({ ...er, 'address.line1': undefined })); }}
              placeholder="House/Flat no., Street, Area"
            />
            {errors['address.line1'] && <p className="text-red-500 text-xs mt-1">{errors['address.line1']}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">City</label>
              <input className="input-field" value={form.address.city} onChange={(e) => setAddr('city', e.target.value)} placeholder="Delhi" />
            </div>
            <div>
              <label className="label">Pincode</label>
              <input className="input-field" value={form.address.pincode} onChange={(e) => setAddr('pincode', e.target.value)} placeholder="110001" maxLength={6} />
            </div>
            <div>
              <label className="label">Landmark</label>
              <input className="input-field" value={form.address.landmark} onChange={(e) => setAddr('landmark', e.target.value)} placeholder="Near Metro" />
            </div>
          </div>

          {/* GPS / Coordinates — always visible, independent of address fields */}
          <div className="border-t border-gray-100 pt-4">
            <label className="label mb-2">
              📍 Customer GPS Location
              <span className="ml-1.5 text-xs font-normal text-gray-400">
                (sends Google Maps link to worker — optional but recommended)
              </span>
            </label>

            {form.address.coordinates?.lat ? (
              /* ── Pinned state ── */
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
                <MapPin className="w-4 h-4 text-green-600 shrink-0" />
                <div className="flex-1 text-sm">
                  <span className="font-medium text-green-800">Location pinned ✅</span>
                  <span className="text-green-600 ml-2 text-xs">
                    {form.address.coordinates.lat.toFixed(5)}, {form.address.coordinates.lng.toFixed(5)}
                  </span>
                </div>
                <div className="flex gap-3 shrink-0">
                  <a
                    href={`https://maps.google.com/?q=${form.address.coordinates.lat},${form.address.coordinates.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    View ↗
                  </a>
                  <button
                    type="button"
                    onClick={() => { setAddr('coordinates', null); setCoordPasteValue(''); }}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              /* ── Input state ── */
              <div className="space-y-2">
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    className="input-field pl-9 text-sm"
                    value={coordPasteValue}
                    onChange={(e) => parseAndSetCoords(e.target.value)}
                    onPaste={(e) => setTimeout(() => parseAndSetCoords(e.target.value), 0)}
                    placeholder="Paste: 28.6302829,77.0141382  or  maps.google.com/?q=…"
                  />
                </div>
                <p className="text-xs text-gray-400">
                  Paste the coordinates or Google Maps link from the customer's WhatsApp message — auto-detected on paste.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Service Details ── */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary-600" /> Service Details
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Service Name *</label>
              <input
                className={`input-field ${errors.serviceName ? 'input-error' : ''}`}
                value={form.serviceName}
                onChange={(e) => set('serviceName', e.target.value)}
                placeholder="e.g. 2-seater sofa + carpet"
              />
              {errors.serviceName && <p className="text-red-500 text-xs mt-1">{errors.serviceName}</p>}
            </div>
            <div>
              <label className="label">Price (₹) *</label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="number"
                  className={`input-field pl-9 ${errors.price ? 'input-error' : ''}`}
                  value={form.price}
                  onChange={(e) => set('price', e.target.value)}
                  placeholder="0 = TBD"
                  min="0"
                />
              </div>
              {errors.price && <p className="text-red-500 text-xs mt-1">{errors.price}</p>}
              <p className="text-xs text-gray-400 mt-0.5">Enter 0 if price is to be decided on-site</p>
            </div>
          </div>
          <div>
            <label className="label">Service Description <span className="text-gray-400 font-normal">(what customer told you)</span></label>
            <textarea
              rows={2}
              className="input-field resize-none"
              value={form.serviceDescription}
              onChange={(e) => set('serviceDescription', e.target.value)}
              placeholder="e.g. L-shaped sofa 5-seater, heavy stains on 3 seats, also needs carpet cleaned..."
              maxLength={1000}
            />
          </div>
        </div>

        {/* ── Date & Time + Worker ── */}
        <div className="card p-6 space-y-5">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary-600" /> Schedule & Worker
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Date *</label>
              <input
                type="date"
                className={`input-field ${errors.scheduledDate ? 'input-error' : ''}`}
                value={form.scheduledDate}
                min={todayStr}
                max={maxDateStr}
                onChange={(e) => { set('scheduledDate', e.target.value); setStartTime(''); setEndTime(''); }}
              />
              {errors.scheduledDate && <p className="text-red-500 text-xs mt-1">{errors.scheduledDate}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="label">Time Slot *</label>

              {/* Quick presets — tap to fill the pickers */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {PRESETS.map((p) => {
                  const isActive = startTime === p.start && endTime === p.end;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => { setStartTime(p.start); setEndTime(p.end); }}
                      className={`px-2.5 py-1 text-xs rounded-lg border transition-all
                        ${isActive
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400 hover:bg-primary-50'
                        }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              {/* Custom time pickers */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <input
                    type="time"
                    className={`input-field ${errors.timeSlot && !startTime ? 'input-error' : ''}`}
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5 pl-1">Start time</p>
                </div>
                <span className="text-gray-400 text-sm pb-4">→</span>
                <div className="flex-1">
                  <input
                    type="time"
                    className={`input-field ${errors.timeSlot && !endTime ? 'input-error' : ''}`}
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5 pl-1">End time</p>
                </div>
              </div>

              {form.timeSlot && (
                <p className="text-xs text-primary-600 font-medium mt-1.5 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Slot: {form.timeSlot}
                </p>
              )}
              {errors.timeSlot && <p className="text-red-500 text-xs mt-1">{errors.timeSlot}</p>}
            </div>
          </div>

          {/* Worker availability grid */}
          {form.scheduledDate && form.timeSlot && (
            <div>
              <label className="label flex items-center gap-2">
                Assign Worker
                {slotsLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
              </label>

              {staffSlots.length === 0 && !slotsLoading ? (
                <p className="text-sm text-gray-400">No active workers found.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Unassigned option */}
                  <button
                    onClick={() => set('assignedStaffId', '')}
                    className={`text-left p-3 rounded-xl border-2 transition-all
                      ${form.assignedStaffId === ''
                        ? 'border-gray-400 bg-gray-50'
                        : 'border-gray-200 hover:border-gray-300'
                      }`}
                  >
                    <div className="text-sm font-medium text-gray-500">Unassigned</div>
                    <div className="text-xs text-gray-400 mt-0.5">Assign later</div>
                  </button>

                  {staffSlots.map((worker) => {
                    const selected = form.assignedStaffId === worker._id;
                    const busy = worker.busyAtSlot;
                    const offDay = !worker.worksOnDay;

                    return (
                      <button
                        key={worker._id}
                        disabled={busy || offDay}
                        onClick={() => set('assignedStaffId', worker._id)}
                        className={`text-left p-3 rounded-xl border-2 transition-all relative
                          ${busy || offDay
                            ? 'border-red-100 bg-red-50 cursor-not-allowed opacity-75'
                            : selected
                              ? 'border-green-500 bg-green-50'
                              : 'border-gray-200 hover:border-green-400 hover:bg-green-50'
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-gray-900">{worker.name}</span>
                          {busy && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />}
                          {!busy && !offDay && selected && <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />}
                          {!busy && !offDay && !selected && (
                            <span className="text-xs text-green-600 font-medium">Free</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {offDay
                            ? 'Off today'
                            : busy
                              ? `Busy: ${worker.slotBooking?.customerName || ''} · ${worker.slotBooking?.serviceLabel || ''}`
                              : `${worker.dayLoad} job${worker.dayLoad !== 1 ? 's' : ''} today`
                          }
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Notes ── */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary-600" /> Notes
          </h2>
          <div>
            <label className="label">
              Worker Notes
              <span className="ml-1 text-xs font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                Sent to the assigned worker
              </span>
            </label>
            <textarea
              rows={2}
              className="input-field resize-none bg-amber-50 border-amber-200 focus:border-amber-400"
              value={form.workerNotes}
              onChange={(e) => set('workerNotes', e.target.value)}
              placeholder="e.g. Customer has a pet dog — be careful. Use dry cleaning only. Ring bell twice."
              maxLength={1000}
            />
          </div>
          <div>
            <label className="label">
              Internal Admin Notes
              <span className="ml-1 text-xs font-normal text-gray-400">(not shown to worker or customer)</span>
            </label>
            <textarea
              rows={2}
              className="input-field resize-none"
              value={form.adminNotes}
              onChange={(e) => set('adminNotes', e.target.value)}
              placeholder="e.g. Customer was referred by XYZ. Discount applied."
              maxLength={1000}
            />
          </div>
        </div>

        {/* ── Payment ── */}
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <IndianRupee className="w-4 h-4 text-primary-600" /> Payment
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: 'cod', label: '💵 Cash on Delivery', desc: 'Pay when cleaner arrives' },
              { id: 'razorpay', label: '💳 Online / UPI', desc: 'Link sent to customer' },
            ].map((pm) => (
              <button
                key={pm.id}
                onClick={() => set('paymentMethod', pm.id)}
                className={`text-left p-4 rounded-xl border-2 transition-all
                  ${form.paymentMethod === pm.id
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-primary-300'
                  }`}
              >
                <div className="font-medium text-gray-900 text-sm">{pm.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{pm.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Summary bar + Submit ── */}
        <div className="card p-5 bg-gray-900 text-white flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-gray-400">Booking for</div>
            <div className="font-semibold">
              {form.customerName || '—'} · {form.serviceName || '—'}
            </div>
            <div className="text-sm text-gray-400 mt-0.5">
              {form.scheduledDate && form.timeSlot
                ? `${formatDate(form.scheduledDate)} · ${form.timeSlot}`
                : 'No date/time selected'}
            </div>
          </div>
          <div className="text-right shrink-0">
            {form.price !== '' && !isNaN(Number(form.price)) && (
              <div className="text-2xl font-bold text-green-400">
                {Number(form.price) === 0 ? 'TBD' : formatCurrency(Number(form.price))}
              </div>
            )}
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="mt-2 px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              {saving ? <><LoadingSpinner size="sm" /> Creating...</> : '✅ Confirm Booking'}
            </button>
          </div>
        </div>

      </div>
    </AdminLayout>
  );
}
