import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, ChevronLeft, Check, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import LoadingSpinner from '../components/LoadingSpinner';
import { servicesAPI, slotsAPI, bookingsAPI, paymentsAPI } from '../utils/api';
import { formatCurrency, INDIAN_STATES, initiateRazorpayPayment } from '../utils/helpers';

const STEPS = ['Service', 'Date & Time', 'Address', 'Payment'];

const initialForm = {
  customerName: '', customerEmail: '', customerPhone: '',
  serviceId: '', addOnIds: [], customServiceDescription: '',
  scheduledDate: '', timeSlot: '',
  address: { line1: '', line2: '', city: '', state: '', pincode: '', landmark: '' },
  paymentMethod: 'razorpay',
};

export default function BookingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ ...initialForm });
  const [services, setServices] = useState([]);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // Fetch services on mount
  useEffect(() => {
    servicesAPI.getAll().then((res) => setServices(res.data.data)).catch(() => {});
  }, []);

  // Fetch slots when date changes
  useEffect(() => {
    if (!form.scheduledDate) return;
    setSlotsLoading(true);
    slotsAPI.getAvailable(form.scheduledDate)
      .then((res) => setSlots(res.data.data))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [form.scheduledDate]);

  const selectedService = services.find((s) => s._id === form.serviceId);

  const calcTotal = () => {
    if (!selectedService) return { base: 0, addOn: 0, total: 0 };
    const base = selectedService.price;
    const addOn = form.addOnIds.reduce((sum, id) => {
      const a = selectedService.addOns?.find((a) => a._id === id);
      return sum + (a?.price || 0);
    }, 0);
    return { base, addOn, total: base + addOn };
  };

  const { base, addOn, total } = calcTotal();

  const update = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const updateAddress = (field, value) => {
    setForm((f) => ({ ...f, address: { ...f.address, [field]: value } }));
    setErrors((e) => ({ ...e, [`address.${field}`]: undefined }));
  };

  const toggleAddOn = (id) => {
    setForm((f) => ({
      ...f,
      addOnIds: f.addOnIds.includes(id) ? f.addOnIds.filter((a) => a !== id) : [...f.addOnIds, id],
    }));
  };

  const captureLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Your browser does not support location sharing');
      return;
    }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateAddress('coordinates', { lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast.success('Location pinned! Worker will get a Google Maps link.');
        setLocationLoading(false);
      },
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? 'Location access denied — please allow it in your browser settings'
            : 'Could not get your location, please try again';
        toast.error(msg);
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const validateStep = () => {
    const errs = {};
    if (step === 0) {
      if (!form.serviceId) errs.serviceId = 'Please select a service';
      if (selectedService?.price === 0 && !form.customServiceDescription.trim())
        errs.customServiceDescription = 'Please describe your service requirement';
      if (!form.customerName.trim()) errs.customerName = 'Name is required';
      if (!/^\S+@\S+\.\S+$/.test(form.customerEmail)) errs.customerEmail = 'Valid email required';
      if (!/^[6-9]\d{9}$/.test(form.customerPhone)) errs.customerPhone = 'Valid 10-digit mobile number required';
    }
    if (step === 1) {
      if (!form.scheduledDate) errs.scheduledDate = 'Please select a date';
      if (!form.timeSlot) errs.timeSlot = 'Please select a time slot';
    }
    if (step === 2) {
      if (!form.address.line1.trim()) errs['address.line1'] = 'Address is required';
      if (!form.address.city.trim()) errs['address.city'] = 'City is required';
      if (!form.address.state) errs['address.state'] = 'State is required';
      if (!/^\d{6}$/.test(form.address.pincode)) errs['address.pincode'] = 'Valid 6-digit pincode required';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => { if (validateStep()) setStep((s) => s + 1); };
  const prev = () => setStep((s) => s - 1);

  const submitBooking = async () => {
    if (!validateStep()) return;
    setLoading(true);
    try {
      const payload = {
        ...form,
        scheduledDate: new Date(form.scheduledDate).toISOString(),
        paymentMethod: (!selectedService?.allowOnlinePayment || selectedService?.price === 0)
          ? 'cod'
          : form.paymentMethod,
      };
      const res = await bookingsAPI.create(payload);
      const booking = res.data.data;

      if (form.paymentMethod === 'cod') {
        navigate(`/confirmation/${booking.bookingId}`);
        return;
      }

      // Razorpay flow
      const orderRes = await paymentsAPI.createOrder(booking.bookingId);
      const orderData = orderRes.data.data;

      await initiateRazorpayPayment(
        orderData,
        async (response) => {
          try {
            await paymentsAPI.verify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              bookingId: booking.bookingId,
            });
            navigate(`/confirmation/${booking.bookingId}`);
          } catch {
            toast.error('Payment verification failed. Please contact support.');
          }
        },
        (reason) => {
          if (reason !== 'Payment cancelled') {
            toast.error(`Payment failed: ${reason}`);
          }
        }
      );
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to create booking. Please try again.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Min date: today
  const minDate = new Date();
  minDate.setHours(minDate.getHours() + 2);
  const minDateStr = minDate.toISOString().split('T')[0];
  const maxDateStr = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="pt-20 pb-16">
        <div className="page-container max-w-3xl mx-auto">

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Book Your Cleaning Service</h1>
            <p className="text-gray-500">Fill in the details below to schedule your cleaning</p>
          </div>

          {/* Stepper */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {STEPS.map((label, i) => (
              <React.Fragment key={label}>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all
                      ${i < step ? 'bg-green-500 text-white' : i === step ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-400'}`}
                  >
                    {i < step ? <Check className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className={`hidden sm:block text-sm font-medium ${i === step ? 'text-gray-900' : 'text-gray-400'}`}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 max-w-12 h-0.5 ${i < step ? 'bg-green-400' : 'bg-gray-200'}`} />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Form Card */}
          <div className="card p-6 md:p-8 animate-fade-in">

            {/* STEP 0: Service & Customer Info */}
            {step === 0 && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-gray-900">Select Service</h2>
                {services.length === 0 ? (
                  <div className="flex justify-center py-8"><LoadingSpinner /></div>
                ) : (
                  <div className="space-y-5">
                    {Object.entries(
                      services.reduce((acc, svc) => {
                        const cat = svc.category || 'General';
                        if (!acc[cat]) acc[cat] = [];
                        acc[cat].push(svc);
                        return acc;
                      }, {})
                    ).map(([category, items]) => (
                      <div key={category}>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{category}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {items.map((svc) => (
                            <button
                              key={svc._id}
                              onClick={() => { update('serviceId', svc._id); update('customServiceDescription', ''); update('addOnIds', []); }}
                              className={`text-left p-4 rounded-xl border-2 transition-all duration-200
                                ${form.serviceId === svc._id
                                  ? 'border-primary-500 bg-primary-50'
                                  : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
                                }`}
                            >
                              <div className="flex items-start gap-3">
                                <span className="text-2xl">{svc.icon}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-gray-900 text-sm">{svc.name}</div>
                                  <div className="text-xs text-gray-400 mt-0.5">
                                    {svc.price === 0 ? 'Price on quote' : `Starting ${formatCurrency(svc.price)}`}
                                  </div>
                                  {svc.description && (
                                    <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">{svc.description}</div>
                                  )}
                                </div>
                                {form.serviceId === svc._id && (
                                  <Check className="w-5 h-5 text-primary-600 shrink-0" />
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {errors.serviceId && <p className="text-red-500 text-sm">{errors.serviceId}</p>}

                {/* Custom description for "On Quote" services (price = 0) */}
                {selectedService?.price === 0 && (
                  <div>
                    <label className="label">Describe Your Requirement *</label>
                    <textarea
                      rows={3}
                      className={`input-field resize-none ${errors.customServiceDescription ? 'input-error' : ''}`}
                      value={form.customServiceDescription}
                      onChange={(e) => update('customServiceDescription', e.target.value)}
                      placeholder="E.g. Need cleaning of 3 leather sofas + 1 L-shaped sofa, heavy stains on seats..."
                      maxLength={500}
                    />
                    <p className="text-xs text-gray-400 mt-1">{form.customServiceDescription.length}/500 — Our team will confirm the price before arriving.</p>
                    {errors.customServiceDescription && <p className="text-red-500 text-xs mt-1">{errors.customServiceDescription}</p>}
                  </div>
                )}

                {/* Add-ons */}
                {selectedService?.addOns?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Add-ons (Optional)</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {selectedService.addOns.map((a) => (
                        <button
                          key={a._id}
                          onClick={() => toggleAddOn(a._id)}
                          className={`flex items-center justify-between p-3 rounded-xl border text-sm transition-all
                            ${form.addOnIds.includes(a._id)
                              ? 'border-primary-400 bg-primary-50 text-primary-700'
                              : 'border-gray-200 hover:border-gray-300 text-gray-700'
                            }`}
                        >
                          <span>{a.label}</span>
                          <span className="font-medium">+{formatCurrency(a.price)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <hr className="border-gray-100" />

                <h2 className="text-lg font-semibold text-gray-900">Your Details</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Full Name *</label>
                    <input
                      className={`input-field ${errors.customerName ? 'input-error' : ''}`}
                      value={form.customerName}
                      onChange={(e) => update('customerName', e.target.value)}
                      placeholder="Rahul Sharma"
                    />
                    {errors.customerName && <p className="text-red-500 text-xs mt-1">{errors.customerName}</p>}
                  </div>
                  <div>
                    <label className="label">Mobile Number *</label>
                    <input
                      className={`input-field ${errors.customerPhone ? 'input-error' : ''}`}
                      value={form.customerPhone}
                      onChange={(e) => update('customerPhone', e.target.value)}
                      placeholder="9876543210"
                      maxLength={10}
                    />
                    {errors.customerPhone && <p className="text-red-500 text-xs mt-1">{errors.customerPhone}</p>}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label">Email Address *</label>
                    <input
                      type="email"
                      className={`input-field ${errors.customerEmail ? 'input-error' : ''}`}
                      value={form.customerEmail}
                      onChange={(e) => update('customerEmail', e.target.value)}
                      placeholder="rahul@email.com"
                    />
                    {errors.customerEmail && <p className="text-red-500 text-xs mt-1">{errors.customerEmail}</p>}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 1: Date & Time */}
            {step === 1 && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-gray-900">Choose Date & Time</h2>
                <div>
                  <label className="label">Preferred Date *</label>
                  <input
                    type="date"
                    className={`input-field ${errors.scheduledDate ? 'input-error' : ''}`}
                    value={form.scheduledDate}
                    min={minDateStr}
                    max={maxDateStr}
                    onChange={(e) => { update('scheduledDate', e.target.value); update('timeSlot', ''); }}
                  />
                  {errors.scheduledDate && <p className="text-red-500 text-xs mt-1">{errors.scheduledDate}</p>}
                </div>

                {form.scheduledDate && (
                  <div>
                    <label className="label">Time Slot *</label>
                    {slotsLoading ? (
                      <div className="flex justify-center py-4"><LoadingSpinner /></div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {slots.map((slot) => (
                          <button
                            key={slot.slot}
                            disabled={!slot.available}
                            onClick={() => update('timeSlot', slot.slot)}
                            className={`p-3 rounded-xl border-2 text-sm font-medium transition-all duration-200
                              ${!slot.available
                                ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                                : form.timeSlot === slot.slot
                                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                                  : 'border-gray-200 hover:border-primary-300 text-gray-700'
                              }`}
                          >
                            {slot.slot}
                            {!slot.available && (
                              <div className="text-xs font-normal text-gray-300 mt-0.5">{slot.reason}</div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {errors.timeSlot && <p className="text-red-500 text-xs mt-1">{errors.timeSlot}</p>}
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: Address */}
            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-gray-900">Service Address</h2>
                <div>
                  <label className="label">Address Line 1 *</label>
                  <input
                    className={`input-field ${errors['address.line1'] ? 'input-error' : ''}`}
                    value={form.address.line1}
                    onChange={(e) => updateAddress('line1', e.target.value)}
                    placeholder="House/Flat no., Building, Street"
                  />
                  {errors['address.line1'] && <p className="text-red-500 text-xs mt-1">{errors['address.line1']}</p>}
                </div>
                <div>
                  <label className="label">Address Line 2</label>
                  <input
                    className="input-field"
                    value={form.address.line2}
                    onChange={(e) => updateAddress('line2', e.target.value)}
                    placeholder="Area, Colony (optional)"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">City *</label>
                    <input
                      className={`input-field ${errors['address.city'] ? 'input-error' : ''}`}
                      value={form.address.city}
                      onChange={(e) => updateAddress('city', e.target.value)}
                      placeholder="Mumbai"
                    />
                    {errors['address.city'] && <p className="text-red-500 text-xs mt-1">{errors['address.city']}</p>}
                  </div>
                  <div>
                    <label className="label">Pincode *</label>
                    <input
                      className={`input-field ${errors['address.pincode'] ? 'input-error' : ''}`}
                      value={form.address.pincode}
                      onChange={(e) => updateAddress('pincode', e.target.value)}
                      placeholder="400001"
                      maxLength={6}
                    />
                    {errors['address.pincode'] && <p className="text-red-500 text-xs mt-1">{errors['address.pincode']}</p>}
                  </div>
                  <div>
                    <label className="label">State *</label>
                    <select
                      className={`input-field ${errors['address.state'] ? 'input-error' : ''}`}
                      value={form.address.state}
                      onChange={(e) => updateAddress('state', e.target.value)}
                    >
                      <option value="">Select state</option>
                      {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {errors['address.state'] && <p className="text-red-500 text-xs mt-1">{errors['address.state']}</p>}
                  </div>
                  <div>
                    <label className="label">Landmark (Optional)</label>
                    <input
                      className="input-field"
                      value={form.address.landmark}
                      onChange={(e) => updateAddress('landmark', e.target.value)}
                      placeholder="Near XYZ Mall"
                    />
                  </div>
                </div>

                {/* GPS location pin */}
                <div className="pt-1">
                  <label className="label mb-1.5">📍 Pin Your Exact Location <span className="text-gray-400 font-normal">(Recommended)</span></label>
                  {form.address.coordinates?.lat ? (
                    <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                      <span className="text-green-600 text-lg">✅</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-green-800">Location pinned successfully</p>
                        <p className="text-xs text-green-600 mt-0.5">
                          {form.address.coordinates.lat.toFixed(5)}, {form.address.coordinates.lng.toFixed(5)}
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <a
                          href={`https://maps.google.com/?q=${form.address.coordinates.lat},${form.address.coordinates.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline font-medium"
                        >
                          View ↗
                        </a>
                        <button
                          type="button"
                          onClick={() => updateAddress('coordinates', null)}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={captureLocation}
                      disabled={locationLoading}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-gray-200 text-gray-500 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50/50 transition-all text-sm font-medium disabled:opacity-60"
                    >
                      {locationLoading ? (
                        <><LoadingSpinner size="sm" /> Getting your location…</>
                      ) : (
                        <>📍 Share My Current Location</>
                      )}
                    </button>
                  )}
                  <p className="text-xs text-gray-400 mt-1.5">
                    Sends a Google Maps link to your worker so they can navigate directly to you
                  </p>
                </div>
              </div>
            )}

            {/* STEP 3: Payment */}
            {step === 3 && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-gray-900">Order Summary & Payment</h2>

                {/* Summary */}
                <div className="bg-gray-50 rounded-xl p-5 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Service</span>
                    <span className="font-medium text-gray-900">{selectedService?.label}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Date & Time</span>
                    <span className="font-medium text-gray-900 text-right">{form.scheduledDate} · {form.timeSlot}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Customer</span>
                    <span className="font-medium text-gray-900">{form.customerName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Address</span>
                    <span className="font-medium text-gray-900 text-right max-w-[200px]">
                      {form.address.line1}, {form.address.city}
                    </span>
                  </div>
                  <hr className="border-gray-200" />
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Base Price</span>
                    <span>{formatCurrency(base)}</span>
                  </div>
                  {addOn > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Add-ons</span>
                      <span>+{formatCurrency(addOn)}</span>
                    </div>
                  )}
                  <hr className="border-gray-200" />
                  <div className="flex justify-between font-bold text-gray-900">
                    <span>Total</span>
                    <span className="text-primary-600 text-lg">{formatCurrency(total)}</span>
                  </div>
                </div>

                {/* Payment Method */}
                <div>
                  <label className="label">Payment Method</label>
                  {(selectedService?.price === 0 || !selectedService?.allowOnlinePayment) && (
                    <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                      This service uses <strong>Cash on Delivery</strong> — our team will confirm the final price before the visit.
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { id: 'razorpay', label: '💳 Online Payment', desc: 'UPI, Cards, Net Banking via Razorpay' },
                      { id: 'cod', label: '💵 Cash on Delivery', desc: 'Pay when the cleaner arrives' },
                    ].map((pm) => (
                      <button
                        key={pm.id}
                        disabled={(selectedService?.price === 0 || !selectedService?.allowOnlinePayment) && pm.id === 'razorpay'}
                        onClick={() => update('paymentMethod', pm.id)}
                        className={`text-left p-4 rounded-xl border-2 transition-all
                          ${(selectedService?.price === 0 || !selectedService?.allowOnlinePayment) && pm.id === 'razorpay'
                            ? 'border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed'
                            : form.paymentMethod === pm.id
                              ? 'border-primary-500 bg-primary-50'
                              : 'border-gray-200 hover:border-primary-300'
                          }`}
                      >
                        <div className="font-medium text-gray-900 text-sm">{pm.label}</div>
                        <div className="text-xs text-gray-400 mt-1">{pm.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-blue-50 rounded-xl p-4 flex gap-3">
                  <Sparkles className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-700">
                    You'll receive a WhatsApp confirmation with your booking details and cleaner information after payment.
                  </p>
                </div>
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
              {step > 0 ? (
                <button onClick={prev} className="btn-ghost gap-1">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
              ) : <div />}

              {step < STEPS.length - 1 ? (
                <button onClick={next} className="btn-primary">
                  Continue <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={submitBooking}
                  disabled={loading}
                  className="btn-primary min-w-[160px]"
                >
                  {loading ? (
                    <><LoadingSpinner size="sm" /> Processing...</>
                  ) : (
                    (form.paymentMethod === 'cod' || selectedService?.price === 0) ? 'Confirm Booking' : `Pay ${formatCurrency(total)}`
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
