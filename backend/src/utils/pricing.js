// All services are now stored in MongoDB (Service model).
// This file is kept for any shared utility functions only.

/**
 * Calculate total for a booking given a service object and selected add-on labels.
 * @param {Object} service  - Mongoose Service document
 * @param {Array}  addOns   - Array of { label, price } add-ons selected by customer
 */
const calculatePrice = (service, addOns = []) => {
  const basePrice = service.price;
  const addOnPrice = addOns.reduce((sum, a) => sum + (a.price || 0), 0);
  const totalAmount = basePrice + addOnPrice;

  return { basePrice, addOnPrice, discount: 0, totalAmount, duration: service.duration, serviceLabel: service.name };
};

module.exports = { calculatePrice };
