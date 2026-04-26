import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, PlusCircle, MinusCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/AdminLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import { servicesAPI } from '../../utils/api';
import { formatCurrency } from '../../utils/helpers';

const EMPTY_ADDON = { label: '', price: '' };

const EMPTY_FORM = {
  name: '',
  description: '',
  price: '',
  duration: '2',
  icon: '✨',
  category: '',
  notes: '',
  isActive: true,
  allowOnlinePayment: true,
  addOns: [],
  sortOrder: '0',
};

export default function ServiceManagement() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // null = create, object = edit
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchServices = async () => {
    setLoading(true);
    try {
      const res = await servicesAPI.getAll();
      setServices(res.data.data);
    } catch {
      toast.error('Failed to load services');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchServices(); }, []);

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (svc) => {
    setEditTarget(svc);
    setForm({
      name: svc.name || '',
      description: svc.description || '',
      price: String(svc.price ?? ''),
      duration: String(svc.duration ?? '2'),
      icon: svc.icon || '✨',
      category: svc.category || '',
      notes: svc.notes || '',
      isActive: svc.isActive ?? true,
      allowOnlinePayment: svc.allowOnlinePayment ?? true,
      addOns: (svc.addOns || []).map((a) => ({ label: a.label, price: String(a.price) })),
      sortOrder: String(svc.sortOrder ?? '0'),
    });
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setEditTarget(null); };

  const set = (field, val) => setForm((f) => ({ ...f, [field]: val }));

  const setAddon = (i, field, val) => {
    setForm((f) => {
      const addOns = [...f.addOns];
      addOns[i] = { ...addOns[i], [field]: val };
      return { ...f, addOns };
    });
  };

  const addAddon = () => setForm((f) => ({ ...f, addOns: [...f.addOns, { ...EMPTY_ADDON }] }));
  const removeAddon = (i) => setForm((f) => ({ ...f, addOns: f.addOns.filter((_, idx) => idx !== i) }));

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Service name is required');
    if (form.price === '' || isNaN(Number(form.price))) return toast.error('Valid price is required');

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      duration: Number(form.duration) || 2,
      icon: form.icon.trim() || '✨',
      category: form.category.trim(),
      notes: form.notes.trim(),
      isActive: form.isActive,
      allowOnlinePayment: form.allowOnlinePayment,
      sortOrder: Number(form.sortOrder) || 0,
      addOns: form.addOns
        .filter((a) => a.label.trim())
        .map((a) => ({ label: a.label.trim(), price: Number(a.price) || 0 })),
    };

    setSaving(true);
    try {
      if (editTarget) {
        await servicesAPI.update(editTarget._id, payload);
        toast.success('Service updated');
      } else {
        await servicesAPI.create(payload);
        toast.success('Service created');
      }
      closeModal();
      fetchServices();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save service');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (svc) => {
    try {
      await servicesAPI.update(svc._id, { isActive: !svc.isActive });
      setServices((prev) => prev.map((s) => s._id === svc._id ? { ...s, isActive: !s.isActive } : s));
      toast.success(svc.isActive ? 'Service hidden from customers' : 'Service visible to customers');
    } catch {
      toast.error('Failed to update service');
    }
  };

  const handleDelete = async (id) => {
    try {
      await servicesAPI.delete(id);
      setServices((prev) => prev.filter((s) => s._id !== id));
      toast.success('Service deleted');
      setDeleteConfirm(null);
    } catch {
      toast.error('Failed to delete service');
    }
  };

  const grouped = services.reduce((acc, svc) => {
    const cat = svc.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(svc);
    return acc;
  }, {});

  return (
    <AdminLayout title="Services">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Manage Services</h2>
            <p className="text-sm text-gray-500 mt-0.5">Add, edit, or remove services shown to customers during booking.</p>
          </div>
          <button onClick={openCreate} className="btn-primary gap-2">
            <Plus className="w-4 h-4" /> Add Service
          </button>
        </div>

        {/* Service list */}
        {loading ? (
          <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : services.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-3xl mb-3">🧹</p>
            <p className="text-gray-500 font-medium">No services yet</p>
            <p className="text-gray-400 text-sm mt-1">Click "Add Service" to create your first service.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{category}</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {items.map((svc) => (
                    <div
                      key={svc._id}
                      className={`card p-5 flex gap-4 transition-opacity ${!svc.isActive ? 'opacity-50' : ''}`}
                    >
                      <div className="text-3xl pt-0.5 shrink-0">{svc.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold text-gray-900 text-sm">{svc.name}</h3>
                            {!svc.isActive && (
                              <span className="text-xs text-gray-400 italic">Hidden from customers</span>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-base font-bold text-primary-600">
                              {svc.price === 0 ? 'On Quote' : formatCurrency(svc.price)}
                            </div>
                            <div className="text-xs text-gray-400">{svc.duration}h</div>
                          </div>
                        </div>
                        {svc.description && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{svc.description}</p>
                        )}
                        {svc.addOns?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {svc.addOns.map((a) => (
                              <span key={a._id} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                {a.label} +{formatCurrency(a.price)}
                              </span>
                            ))}
                          </div>
                        )}
                        {svc.notes && (
                          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mt-2">
                            📋 {svc.notes}
                          </p>
                        )}
                        {/* Actions */}
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={() => openEdit(svc)}
                            className="flex items-center gap-1 text-xs text-gray-600 hover:text-primary-600 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          <span className="text-gray-200">|</span>
                          <button
                            onClick={() => toggleActive(svc)}
                            className="flex items-center gap-1 text-xs text-gray-600 hover:text-primary-600 transition-colors"
                          >
                            {svc.isActive
                              ? <><ToggleRight className="w-4 h-4 text-green-500" /> Active</>
                              : <><ToggleLeft className="w-4 h-4 text-gray-400" /> Inactive</>
                            }
                          </button>
                          <span className="text-gray-200">|</span>
                          <button
                            onClick={() => setDeleteConfirm(svc)}
                            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {editTarget ? 'Edit Service' : 'Add New Service'}
              </h2>
              <button onClick={closeModal} className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

              {/* Name + Icon */}
              <div className="grid grid-cols-[1fr_80px] gap-3">
                <div>
                  <label className="label">Service Name *</label>
                  <input
                    className="input-field"
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="e.g. Sofa Deep Clean"
                  />
                </div>
                <div>
                  <label className="label">Icon</label>
                  <input
                    className="input-field text-center text-xl"
                    value={form.icon}
                    onChange={(e) => set('icon', e.target.value)}
                    placeholder="✨"
                    maxLength={5}
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="label">Category</label>
                <input
                  className="input-field"
                  value={form.category}
                  onChange={(e) => set('category', e.target.value)}
                  placeholder="e.g. Furniture, Home, Vehicle, Pest Control"
                />
              </div>

              {/* Price + Duration + Sort */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Price (₹) *</label>
                  <input
                    type="number"
                    className="input-field"
                    value={form.price}
                    onChange={(e) => set('price', e.target.value)}
                    placeholder="0 = quote"
                    min="0"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">Set 0 for "On Quote"</p>
                </div>
                <div>
                  <label className="label">Duration (hrs)</label>
                  <input
                    type="number"
                    className="input-field"
                    value={form.duration}
                    onChange={(e) => set('duration', e.target.value)}
                    min="0.5"
                    step="0.5"
                  />
                </div>
                <div>
                  <label className="label">Sort Order</label>
                  <input
                    type="number"
                    className="input-field"
                    value={form.sortOrder}
                    onChange={(e) => set('sortOrder', e.target.value)}
                    min="0"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="label">Description <span className="text-gray-400 font-normal">(shown to customers)</span></label>
                <textarea
                  rows={2}
                  className="input-field resize-none"
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="Brief description of what this service includes..."
                  maxLength={500}
                />
              </div>

              {/* Internal Notes */}
              <div>
                <label className="label">Internal Notes <span className="text-gray-400 font-normal">(admin only, not shown to customers)</span></label>
                <textarea
                  rows={2}
                  className="input-field resize-none bg-amber-50 border-amber-200"
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  placeholder="Staff requirements, special equipment, pricing rules..."
                  maxLength={1000}
                />
              </div>

              {/* Toggles */}
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div
                    onClick={() => set('isActive', !form.isActive)}
                    className={`w-10 h-6 rounded-full transition-colors ${form.isActive ? 'bg-green-500' : 'bg-gray-300'} relative`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.isActive ? 'translate-x-5' : 'translate-x-1'}`} />
                  </div>
                  <span className="text-sm text-gray-700">Active (visible to customers)</span>
                </label>
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div
                    onClick={() => set('allowOnlinePayment', !form.allowOnlinePayment)}
                    className={`w-10 h-6 rounded-full transition-colors ${form.allowOnlinePayment ? 'bg-primary-500' : 'bg-gray-300'} relative`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.allowOnlinePayment ? 'translate-x-5' : 'translate-x-1'}`} />
                  </div>
                  <span className="text-sm text-gray-700">Allow Online Payment</span>
                </label>
              </div>

              {/* Add-ons */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Add-ons / Extras</label>
                  <button
                    type="button"
                    onClick={addAddon}
                    className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
                  >
                    <PlusCircle className="w-4 h-4" /> Add
                  </button>
                </div>
                {form.addOns.length === 0 ? (
                  <p className="text-xs text-gray-400">No add-ons. Click "Add" to create optional extras.</p>
                ) : (
                  <div className="space-y-2">
                    {form.addOns.map((a, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input
                          className="input-field flex-1"
                          value={a.label}
                          onChange={(e) => setAddon(i, 'label', e.target.value)}
                          placeholder="Add-on name (e.g. Stain Removal)"
                        />
                        <input
                          type="number"
                          className="input-field w-24"
                          value={a.price}
                          onChange={(e) => setAddon(i, 'price', e.target.value)}
                          placeholder="₹"
                          min="0"
                        />
                        <button type="button" onClick={() => removeAddon(i)} className="text-red-400 hover:text-red-600 shrink-0">
                          <MinusCircle className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={closeModal} className="btn-ghost">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary min-w-[120px]">
                {saving ? <><LoadingSpinner size="sm" /> Saving...</> : editTarget ? 'Save Changes' : 'Create Service'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="text-4xl mb-3">🗑️</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Delete Service?</h3>
            <p className="text-sm text-gray-500 mb-6">
              "<strong>{deleteConfirm.name}</strong>" will be permanently deleted. Existing bookings are not affected.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="btn-ghost flex-1">Cancel</button>
              <button
                onClick={() => handleDelete(deleteConfirm._id)}
                className="flex-1 py-2.5 px-4 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
