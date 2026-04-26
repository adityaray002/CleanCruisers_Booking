import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle, Calendar, Clock, MapPin, User, Phone, CreditCard, ArrowRight, Loader } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { bookingsAPI } from '../utils/api';
import { formatCurrency, formatDate, STATUS_CONFIG, SERVICE_ICONS } from '../utils/helpers';

export default function ConfirmationPage() {
  const { bookingId } = useParams();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!bookingId) return;
    bookingsAPI.getOne(bookingId)
      .then((res) => setBooking(res.data.data))
      .catch(() => setError('Booking not found. Please check your booking ID.'))
      .finally(() => setLoading(false));
  }, [bookingId]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader className="w-10 h-10 animate-spin text-primary-500 mx-auto mb-4" />
            <p className="text-gray-500">Loading your booking details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md px-4">
            <div className="text-5xl mb-4">🔍</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Booking Not Found</h2>
            <p className="text-gray-500 mb-6">{error}</p>
            <Link to="/" className="btn-primary">Go Home</Link>
          </div>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[booking.status] || STATUS_CONFIG.pending;
  const serviceIcon = SERVICE_ICONS[booking.serviceType] || '✨';

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="pt-20 pb-16">
        <div className="page-container max-w-2xl mx-auto">

          {/* Success Banner */}
          <div className="text-center mb-8 animate-slide-up">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-5">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Booking Confirmed!</h1>
            <p className="text-gray-500 text-lg">
              We've sent a confirmation to <strong>{booking.customerPhone}</strong> via WhatsApp.
            </p>
          </div>

          {/* Booking Card */}
          <div className="card p-6 md:p-8 space-y-6 animate-fade-in">

            {/* Booking ID & Status */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="text-xs text-gray-400 mb-1">Booking ID</div>
                <div className="font-mono font-bold text-lg text-gray-900">{booking.bookingId}</div>
              </div>
              <span className={`badge-${booking.status} text-sm px-3 py-1`}>
                {statusCfg.emoji} {statusCfg.label}
              </span>
            </div>

            <hr className="border-gray-100" />

            {/* Service Details */}
            <div>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Service Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoRow icon={null} emoji={serviceIcon} label="Service" value={booking.serviceLabel} />
                <InfoRow icon={Calendar} label="Date" value={formatDate(booking.scheduledDate, 'EEEE, dd MMM yyyy')} />
                <InfoRow icon={Clock} label="Time Slot" value={booking.timeSlot} />
                <InfoRow icon={null} emoji="⏱️" label="Duration" value={`${booking.duration} hours`} />
              </div>
            </div>

            <hr className="border-gray-100" />

            {/* Customer & Address */}
            <div>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Customer & Address</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoRow icon={User} label="Name" value={booking.customerName} />
                <InfoRow icon={Phone} label="Phone" value={booking.customerPhone} />
                <div className="sm:col-span-2">
                  <InfoRow
                    icon={MapPin}
                    label="Address"
                    value={`${booking.address.line1}${booking.address.line2 ? ', ' + booking.address.line2 : ''}, ${booking.address.city}, ${booking.address.state} - ${booking.address.pincode}`}
                  />
                </div>
              </div>
            </div>

            {/* Assigned Staff */}
            {booking.assignedStaff && (
              <>
                <hr className="border-gray-100" />
                <div>
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Your Cleaner</h2>
                  <div className="flex items-center gap-4 p-4 bg-primary-50 rounded-xl">
                    <div className="w-12 h-12 rounded-full bg-primary-200 flex items-center justify-center text-primary-700 font-bold text-lg">
                      {booking.assignedStaff.name[0]}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{booking.assignedStaff.name}</div>
                      <div className="text-sm text-gray-500">⭐ {booking.assignedStaff.rating} · Professional Cleaner</div>
                    </div>
                  </div>
                </div>
              </>
            )}

            <hr className="border-gray-100" />

            {/* Payment Summary */}
            <div>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Payment</h2>
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Base Price</span>
                  <span>{formatCurrency(booking.basePrice)}</span>
                </div>
                {booking.addOnPrice > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Add-ons</span>
                    <span>+{formatCurrency(booking.addOnPrice)}</span>
                  </div>
                )}
                <hr className="border-gray-200" />
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span className="text-primary-600">{formatCurrency(booking.totalAmount)}</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <CreditCard className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-500">
                    {booking.payment.method === 'cod' ? 'Cash on Delivery' : 'Online Payment'}
                    {' — '}
                    <span className={booking.payment.status === 'paid' ? 'text-green-600 font-medium' : 'text-yellow-600 font-medium'}>
                      {booking.payment.status === 'paid' ? 'Paid' : 'Pending'}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* What's Next */}
          <div className="card p-6 mt-4">
            <h3 className="font-semibold text-gray-900 mb-4">What happens next?</h3>
            <div className="space-y-3">
              {[
                "📱 You'll receive a WhatsApp confirmation with all details",
                '⏰ A reminder will be sent 24 hours before your appointment',
                '👷 Our cleaner will arrive at the scheduled time',
                '✅ Rate your experience after the service',
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 text-sm text-gray-600">
                  <span className="text-base">{item.split(' ')[0]}</span>
                  <span>{item.slice(item.indexOf(' ') + 1)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 mt-6">
            <Link to="/book" className="btn-primary flex-1 justify-center">
              Book Another Service <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/" className="btn-secondary flex-1 justify-center">
              Back to Home
            </Link>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

function InfoRow({ icon: Icon, emoji, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
        {emoji ? <span className="text-base">{emoji}</span> : Icon && <Icon className="w-4 h-4 text-gray-500" />}
      </div>
      <div>
        <div className="text-xs text-gray-400">{label}</div>
        <div className="text-sm font-medium text-gray-900 mt-0.5">{value}</div>
      </div>
    </div>
  );
}
