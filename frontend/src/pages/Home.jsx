import React from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle, Star, ArrowRight, Shield, Clock, ThumbsUp,
  CalendarCheck, CreditCard, Bell, Sparkles,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const SERVICES = [
  { id: 'sofa_cleaning', icon: '🛋️', label: 'Sofa Cleaning', price: 799, desc: 'Deep fabric cleaning, stain removal, and deodorizing for sofas and couches.' },
  { id: 'deep_cleaning', icon: '🏠', label: 'Deep Cleaning', price: 1499, desc: 'Top-to-bottom deep clean of entire homes or offices.' },
  { id: 'car_cleaning', icon: '🚗', label: 'Car Cleaning', price: 599, desc: 'Interior vacuuming, dashboard polish, and full exterior detailing.' },
  { id: 'carpet_cleaning', icon: '🏡', label: 'Carpet Cleaning', price: 999, desc: 'Steam cleaning and stain treatment for carpets, rugs, and mats.' },
  { id: 'bathroom_cleaning', icon: '🚿', label: 'Bathroom Cleaning', price: 499, desc: 'Descaling, scrubbing, and full sanitization of bathrooms.' },
  { id: 'kitchen_cleaning', icon: '🍳', label: 'Kitchen Cleaning', price: 699, desc: 'Degreasing surfaces, chimney cleaning, and appliance exteriors.' },
  { id: 'general_cleaning', icon: '✨', label: 'General Cleaning', price: 899, desc: 'Complete home cleaning covering all rooms and common areas.' },
];

const TESTIMONIALS = [
  { name: 'Arjun Mehta', city: 'Mumbai', rating: 5, text: 'Absolutely fantastic service! My sofa looks brand new. The team was punctual and very professional.' },
  { name: 'Priya Nair', city: 'Pune', rating: 5, text: 'Booked a deep cleaning session and I was amazed at the results. Worth every rupee. Will definitely book again!' },
  { name: 'Rahul Sharma', city: 'Bangalore', rating: 5, text: 'Car cleaning was thorough and done quickly. The online booking was super easy. Highly recommend!' },
  { name: 'Anita Desai', city: 'Chennai', rating: 5, text: 'Got my carpets cleaned before Diwali. Excellent job! No smell, no stains. Staff was very courteous.' },
];

const FEATURES = [
  { icon: Shield, title: 'Verified Professionals', desc: 'All cleaners are background-checked, trained, and insured.' },
  { icon: Clock, title: 'Flexible Scheduling', desc: 'Book any slot from 8 AM to 8 PM, 7 days a week.' },
  { icon: ThumbsUp, title: 'Satisfaction Guarantee', desc: "Not happy? We'll re-clean for free. No questions asked." },
  { icon: CreditCard, title: 'Secure Payments', desc: 'Pay online via UPI/cards or opt for Cash on Delivery.' },
];

const STEPS = [
  { step: '01', icon: CalendarCheck, title: 'Choose Service & Date', desc: 'Pick your service, select a convenient date and time slot.' },
  { step: '02', icon: CreditCard, title: 'Pay Securely', desc: 'Pay online via Razorpay (UPI, cards) or choose Cash on Delivery.' },
  { step: '03', icon: Bell, title: 'Get Confirmation', desc: 'Receive instant WhatsApp confirmation with cleaner details.' },
  { step: '04', icon: Sparkles, title: 'Enjoy Cleanliness!', desc: 'Our professional team arrives and transforms your space.' },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <Navbar />

      {/* Hero Section */}
      <section className="bg-gradient-hero pt-24 pb-16 lg:pt-32 lg:pb-24">
        <div className="page-container">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-primary-100 text-primary-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Sparkles className="w-4 h-4" />
              Professional Cleaning Services
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
              Book a Cleaner in{' '}
              <span className="text-gradient">60 Seconds</span>
            </h1>
            <p className="text-xl text-gray-500 mb-8 leading-relaxed">
              CleanCruisers & SofaShine — trusted professional cleaning for homes, sofas, cars, and more. Verified cleaners, instant booking, and WhatsApp updates.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/book" className="btn-primary text-base py-4 px-8 shadow-xl shadow-primary-100">
                Book Now — Starting ₹499 <ArrowRight className="w-5 h-5" />
              </Link>
              <a href="#services" className="btn-secondary text-base py-4 px-8">
                See All Services
              </a>
            </div>
            <div className="flex items-center justify-center gap-6 mt-8 text-sm text-gray-500">
              {['10,000+ Bookings', '4.9★ Rating', '100% Verified Staff'].map((item) => (
                <div key={item} className="flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section id="services" className="py-16 lg:py-24 bg-white">
        <div className="page-container">
          <div className="text-center mb-12">
            <h2 className="section-title">Our Cleaning Services</h2>
            <p className="section-subtitle">Professional, reliable, and affordable cleaning for every need</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {SERVICES.map((svc) => (
              <Link key={svc.id} to={`/book?service=${svc.id}`} className="card-hover p-5 group">
                <div className="text-4xl mb-4">{svc.icon}</div>
                <h3 className="font-semibold text-gray-900 mb-1">{svc.label}</h3>
                <p className="text-sm text-gray-500 mb-4 line-clamp-2">{svc.desc}</p>
                <div className="flex items-center justify-between">
                  <span className="text-primary-600 font-bold text-lg">₹{svc.price}</span>
                  <span className="text-xs text-gray-400 group-hover:text-primary-500 transition-colors flex items-center gap-1">
                    Book <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 lg:py-24 bg-gray-50">
        <div className="page-container">
          <div className="text-center mb-12">
            <h2 className="section-title">Why Choose Us?</h2>
            <p className="section-subtitle">We make professional cleaning easy, safe, and stress-free</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="card p-6 text-center">
                <div className="w-14 h-14 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <f.icon className="w-7 h-7 text-primary-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-16 lg:py-24 bg-white">
        <div className="page-container">
          <div className="text-center mb-12">
            <h2 className="section-title">How It Works</h2>
            <p className="section-subtitle">4 easy steps to a cleaner home</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
            {STEPS.map((step, i) => (
              <div key={step.step} className="relative text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-600 text-white font-bold text-xl mb-4 shadow-lg shadow-primary-200">
                  {step.step}
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
                {i < STEPS.length - 1 && (
                  <div className="hidden lg:block absolute top-8 right-0 w-1/2 h-0.5 bg-primary-100 translate-x-1/2" />
                )}
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <Link to="/book" className="btn-primary text-base py-4 px-10 shadow-xl shadow-primary-100">
              Start Booking <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-16 lg:py-24 bg-gray-50">
        <div className="page-container">
          <div className="text-center mb-12">
            <h2 className="section-title">Loved by Customers</h2>
            <p className="section-subtitle">10,000+ happy customers across India</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="card p-5">
                <div className="flex items-center gap-1 mb-3">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-sm text-gray-600 leading-relaxed mb-4">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-semibold text-sm">
                    {t.name[0]}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{t.name}</div>
                    <div className="text-xs text-gray-400">{t.city}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-16 bg-gradient-to-r from-primary-600 to-primary-700">
        <div className="page-container text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready for a Sparkling Clean Home?
          </h2>
          <p className="text-primary-100 text-lg mb-8 max-w-xl mx-auto">
            Book your cleaning service today. Slots fill up fast — secure yours now!
          </p>
          <Link to="/book" className="inline-flex items-center gap-2 bg-white text-primary-700 font-bold px-8 py-4 rounded-xl hover:bg-primary-50 transition-colors shadow-xl">
            Book Your Slot Now <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
