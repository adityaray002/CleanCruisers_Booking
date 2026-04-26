const Service = require('../models/Service');

// @desc    Get all active services (public)
// @route   GET /api/services
const getServices = async (req, res, next) => {
  try {
    const filter = {};
    // Admin can see all (including inactive), public only sees active
    if (!req.user) filter.isActive = true;

    const services = await Service.find(filter).sort({ sortOrder: 1, createdAt: 1 });
    res.json({ success: true, data: services });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single service
// @route   GET /api/services/:id
const getService = async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });
    res.json({ success: true, data: service });
  } catch (err) {
    next(err);
  }
};

// @desc    Create service (admin)
// @route   POST /api/services
const createService = async (req, res, next) => {
  try {
    const {
      name, description, price, duration, icon,
      category, notes, isActive, allowOnlinePayment, addOns, sortOrder,
    } = req.body;

    // Handle duplicate slug by appending timestamp
    let service;
    try {
      service = await Service.create({
        name, description, price, duration, icon,
        category, notes, isActive, allowOnlinePayment, addOns, sortOrder,
      });
    } catch (err) {
      if (err.code === 11000) {
        // Slug collision — append timestamp to make unique
        const base = name.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '_');
        const uniqueSlug = `${base}_${Date.now()}`;
        service = await Service.create({
          name, description, price, duration, icon,
          category, notes, isActive, allowOnlinePayment, addOns, sortOrder,
          slug: uniqueSlug,
        });
      } else {
        throw err;
      }
    }

    res.status(201).json({ success: true, data: service, message: 'Service created successfully' });
  } catch (err) {
    next(err);
  }
};

// @desc    Update service (admin)
// @route   PUT /api/services/:id
const updateService = async (req, res, next) => {
  try {
    const {
      name, description, price, duration, icon,
      category, notes, isActive, allowOnlinePayment, addOns, sortOrder,
    } = req.body;

    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });

    if (name !== undefined) service.name = name;
    if (description !== undefined) service.description = description;
    if (price !== undefined) service.price = price;
    if (duration !== undefined) service.duration = duration;
    if (icon !== undefined) service.icon = icon;
    if (category !== undefined) service.category = category;
    if (notes !== undefined) service.notes = notes;
    if (isActive !== undefined) service.isActive = isActive;
    if (allowOnlinePayment !== undefined) service.allowOnlinePayment = allowOnlinePayment;
    if (addOns !== undefined) service.addOns = addOns;
    if (sortOrder !== undefined) service.sortOrder = sortOrder;

    await service.save();
    res.json({ success: true, data: service, message: 'Service updated successfully' });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete service (admin)
// @route   DELETE /api/services/:id
const deleteService = async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ success: false, message: 'Service not found' });
    await service.deleteOne();
    res.json({ success: true, message: 'Service deleted successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = { getServices, getService, createService, updateService, deleteService };
