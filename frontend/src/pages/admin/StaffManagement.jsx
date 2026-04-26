import React, { useState, useEffect, useCallback } from 'react';
import { Plus, X, Check, Pencil, Trash2, Phone, Mail, Star, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/AdminLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import { staffAPI } from '../../utils/api';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SPECIALIZATIONS = [
  { id: 'sofa_cleaning', label: 'Sofa Cleaning' },
  { id: 'deep_cleaning', label: 'Deep Cleaning' },
  { id: 'car_cleaning', label: 'Car Cleaning' },
  { id: 'carpet_cleaning', label: 'Carpet Cleaning' },
  { id: 'bathroom_cleaning', label: 'Bathroom Cleaning' },
  { id: 'kitchen_cleaning', label: 'Kitchen Cleaning' },
  { id: 'general_cleaning', label: 'General Cleaning' },
];

const defaultAvailability = [1, 2, 3, 4, 5, 6].map((day) => ({
  dayOfWeek: day,
  startTime: '09:00',
  endTime: '18:00',
  isAvailable: true,
}));

const emptyForm = {
  name: '', phone: '', email: '', notes: '',
  specializations: [],
  availability: defaultAvailability,
};

export default function StaffManagement() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      const res = await staffAPI.getAll();
      setStaff(res.data.data);
    } catch {
      toast.error('Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setShowModal(true);
  };

  const openEdit = (member) => {
    setEditing(member);
    setForm({
      name: member.name,
      phone: member.phone,
      email: member.email || '',
      notes: member.notes || '',
      specializations: member.specializations || [],
      availability: member.availability?.length > 0 ? member.availability : defaultAvailability,
    });
    setErrors({});
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditing(null); };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!/^[6-9]\d{9}$/.test(form.phone)) errs.phone = 'Valid 10-digit phone required';
    if (form.specializations.length === 0) errs.specializations = 'Select at least one specialization';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (editing) {
        await staffAPI.update(editing._id, form);
        toast.success('Staff member updated');
      } else {
        await staffAPI.create(form);
        toast.success('Staff member added');
      }
      closeModal();
      fetchStaff();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Deactivate this staff member?')) return;
    try {
      await staffAPI.delete(id);
      toast.success('Staff member deactivated');
      fetchStaff();
    } catch {
      toast.error('Failed to deactivate');
    }
  };

  const toggleSpec = (id) => {
    setForm((f) => ({
      ...f,
      specializations: f.specializations.includes(id)
        ? f.specializations.filter((s) => s !== id)
        : [...f.specializations, id],
    }));
    setErrors((e) => ({ ...e, specializations: undefined }));
  };

  const toggleDay = (dayOfWeek) => {
    setForm((f) => {
      const exists = f.availability.find((a) => a.dayOfWeek === dayOfWeek);
      if (exists) {
        return {
          ...f,
          availability: f.availability.map((a) =>
            a.dayOfWeek === dayOfWeek ? { ...a, isAvailable: !a.isAvailable } : a
          ),
        };
      }
      return {
        ...f,
        availability: [...f.availability, { dayOfWeek, startTime: '09:00', endTime: '18:00', isAvailable: true }],
      };
    });
  };

  return (
    <AdminLayout title="Staff Management">
      {/* Header row */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="text-sm text-gray-500">{staff.length} team member{staff.length !== 1 ? 's' : ''}</div>
        <div className="flex gap-2">
          <button onClick={fetchStaff} className="btn-ghost border border-gray-200 text-sm gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openCreate} className="btn-primary text-sm gap-2">
            <Plus className="w-4 h-4" /> Add Staff
          </button>
        </div>
      </div>

      {/* Staff Grid */}
      {loading ? (
        <div className="flex justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : staff.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="text-4xl mb-3">👥</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No staff yet</h3>
          <p className="text-gray-400 mb-5">Add your first team member to get started</p>
          <button onClick={openCreate} className="btn-primary mx-auto">Add First Staff Member</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {staff.map((member) => (
            <div key={member._id} className={`card p-5 ${!member.isActive ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-lg">
                    {member.name[0]}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{member.name}</div>
                    <div className="flex items-center gap-1 text-sm text-yellow-500">
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <span className="text-gray-600 font-medium">{member.rating}</span>
                      <span className="text-gray-400 text-xs">· {member.totalJobs} jobs</span>
                    </div>
                  </div>
                </div>
                <div className={`w-2.5 h-2.5 rounded-full mt-1 ${member.isActive ? 'bg-green-400' : 'bg-gray-300'}`} />
              </div>

              <div className="space-y-2 mb-4 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  {member.phone}
                </div>
                {member.email && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="truncate">{member.email}</span>
                  </div>
                )}
                <div>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                    💬 WhatsApp Enabled
                  </span>
                </div>
              </div>

              {/* Specializations */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {member.specializations?.map((spec) => (
                  <span key={spec} className="px-2 py-0.5 bg-primary-50 text-primary-600 text-xs rounded-full font-medium">
                    {spec.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>

              {/* Work days */}
              <div className="flex gap-1 mb-4">
                {DAYS.map((day, i) => {
                  const avail = member.availability?.find((a) => a.dayOfWeek === i && a.isAvailable);
                  return (
                    <div
                      key={day}
                      className={`flex-1 h-6 rounded text-center text-xs font-medium flex items-center justify-center
                        ${avail ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-300'}`}
                    >
                      {day[0]}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2 pt-3 border-t border-gray-100">
                <button onClick={() => openEdit(member)} className="btn-ghost flex-1 text-xs border border-gray-200 justify-center gap-1.5 py-2">
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                {member.isActive && (
                  <button onClick={() => handleDeactivate(member._id)} className="btn-ghost text-xs border border-red-100 text-red-400 hover:bg-red-50 hover:text-red-600 py-2 px-3 gap-1.5">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
              <h3 className="font-semibold text-gray-900">
                {editing ? 'Edit Staff Member' : 'Add New Staff Member'}
              </h3>
              <button onClick={closeModal} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Basic info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Full Name *</label>
                  <input
                    className={`input-field ${errors.name ? 'input-error' : ''}`}
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Rajesh Kumar"
                  />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                </div>
                <div>
                  <label className="label">Phone *</label>
                  <input
                    className={`input-field ${errors.phone ? 'input-error' : ''}`}
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="9876543210"
                    maxLength={10}
                  />
                  {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Email (Optional)</label>
                  <input
                    type="email"
                    className="input-field"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="staff@email.com"
                  />
                </div>
              </div>

              {/* Specializations */}
              <div>
                <label className="label">Specializations *</label>
                <div className="grid grid-cols-2 gap-2">
                  {SPECIALIZATIONS.map((spec) => (
                    <button
                      key={spec.id}
                      type="button"
                      onClick={() => toggleSpec(spec.id)}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border text-sm text-left transition-all
                        ${form.specializations.includes(spec.id)
                          ? 'border-primary-400 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                    >
                      {form.specializations.includes(spec.id) && <Check className="w-3.5 h-3.5 shrink-0" />}
                      <span>{spec.label}</span>
                    </button>
                  ))}
                </div>
                {errors.specializations && <p className="text-red-500 text-xs mt-1">{errors.specializations}</p>}
              </div>

              {/* Availability */}
              <div>
                <label className="label">Working Days</label>
                <div className="flex gap-2">
                  {DAYS.map((day, i) => {
                    const avail = form.availability.find((a) => a.dayOfWeek === i);
                    const isOn = avail?.isAvailable ?? false;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(i)}
                        className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all
                          ${isOn ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="label">Notes (Optional)</label>
                <textarea
                  className="input-field resize-none"
                  rows={2}
                  placeholder="Any additional notes..."
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={closeModal} className="btn-ghost flex-1 border border-gray-200 justify-center">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 justify-center">
                  {saving ? <><LoadingSpinner size="sm" /> Saving...</> : <><Check className="w-4 h-4" /> {editing ? 'Update' : 'Add Staff'}</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
