import { format, parseISO, isValid } from 'date-fns';

export const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

export const formatDate = (date, fmt = 'dd MMM yyyy') => {
  if (!date) return '';
  const d = typeof date === 'string' ? parseISO(date) : new Date(date);
  return isValid(d) ? format(d, fmt) : '';
};

export const formatDateTime = (date) => formatDate(date, 'dd MMM yyyy, hh:mm a');

export const SERVICE_LABELS = {
  sofa_cleaning: 'Sofa Cleaning',
  deep_cleaning: 'Deep Cleaning',
  car_cleaning: 'Car Cleaning',
  carpet_cleaning: 'Carpet Cleaning',
  bathroom_cleaning: 'Bathroom Cleaning',
  kitchen_cleaning: 'Kitchen Cleaning',
  general_cleaning: 'General Cleaning',
};

export const SERVICE_ICONS = {
  sofa_cleaning: '🛋️',
  deep_cleaning: '🏠',
  car_cleaning: '🚗',
  carpet_cleaning: '🏡',
  bathroom_cleaning: '🚿',
  kitchen_cleaning: '🍳',
  general_cleaning: '✨',
};

export const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'yellow', emoji: '⏳' },
  confirmed: { label: 'Confirmed', color: 'blue', emoji: '✅' },
  in_progress: { label: 'In Progress', color: 'purple', emoji: '🔄' },
  completed: { label: 'Completed', color: 'green', emoji: '🎉' },
  cancelled: { label: 'Cancelled', color: 'red', emoji: '❌' },
};

export const PAYMENT_STATUS = {
  pending: { label: 'Pending', color: 'yellow' },
  paid: { label: 'Paid', color: 'green' },
  failed: { label: 'Failed', color: 'red' },
  refunded: { label: 'Refunded', color: 'gray' },
};

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi', 'Chandigarh',
];

export const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export const initiateRazorpayPayment = async (orderData, onSuccess, onFailure) => {
  const loaded = await loadRazorpayScript();
  if (!loaded) {
    onFailure('Failed to load payment gateway. Please try again.');
    return;
  }

  const options = {
    key: orderData.keyId,
    amount: orderData.amount,
    currency: orderData.currency,
    name: 'CleanCruisers & SofaShine',
    description: 'Cleaning Service Booking',
    order_id: orderData.orderId,
    prefill: orderData.prefill,
    theme: { color: '#2563eb' },
    modal: {
      ondismiss: () => onFailure('Payment cancelled'),
    },
    handler: (response) => onSuccess(response),
  };

  const rzp = new window.Razorpay(options);
  rzp.on('payment.failed', (resp) => onFailure(resp.error.description));
  rzp.open();
};
