import React, { useEffect, useState } from 'react';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';
import { InputField, TextAreaField, SelectField } from '../../../components/common/FormField';

export default function PlanFormModal({
  isOpen,
  onClose,
  onSubmit,
  plan = null,
  loading = false
}) {
  const isEditing = Boolean(plan);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    price: 0,
    billingCycle: 'monthly',
    trialDays: 14,
    status: 'active'
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (plan) {
      setFormData({
        name: plan.name || '',
        code: plan.code || '',
        description: plan.description || '',
        price: Number(plan.price || 0),
        billingCycle: plan.billingCycle || 'monthly',
        trialDays: Number(plan.trialDays || 0),
        status: plan.status || 'active'
      });
    } else {
      setFormData({
        name: '',
        code: '',
        description: '',
        price: 0,
        billingCycle: 'monthly',
        trialDays: 14,
        status: 'active'
      });
    }
    setErrors({});
  }, [plan, isOpen]);

  const validate = () => {
    const errs = {};
    if (!formData.name.trim()) errs.name = 'Plan name is required';
    if (!formData.code.trim()) errs.code = 'Plan code is required (e.g. starter, enterprise)';
    if (isNaN(Number(formData.price)) || Number(formData.price) < 0) {
      errs.price = 'Price must be a valid non-negative number';
    }
    if (isNaN(Number(formData.trialDays)) || Number(formData.trialDays) < 0) {
      errs.trialDays = 'Trial days must be a non-negative integer';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    const payload = {
      name: formData.name.trim(),
      code: formData.code.trim().toLowerCase(),
      description: formData.description.trim() || null,
      price: Number(formData.price),
      billingCycle: formData.billingCycle,
      trialDays: Number(formData.trialDays)
    };
    if (!isEditing) {
      payload.status = formData.status;
    }
    onSubmit(payload);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Edit Plan: ${plan?.name}` : 'Create New Platform Plan'}
      subtitle="Configure pricing, billing cycle, and initial trial duration"
      footer={
        <div className="flex items-center justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} loading={loading}>
            {isEditing ? 'Save Changes' : 'Create Plan'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField
            label="Plan Name"
            required
            placeholder="e.g. Enterprise Monthly"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={errors.name}
          />
          <InputField
            label="Plan Code"
            required
            placeholder="e.g. enterprise-monthly"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            error={errors.code}
            disabled={isEditing}
            hint={isEditing ? 'Plan code cannot be changed after creation.' : 'Unique identifier for service entitlements.'}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <InputField
            label="Price (INR / ₹)"
            type="number"
            step="0.01"
            min="0"
            required
            placeholder="e.g. 1999.00"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
            error={errors.price}
          />
          <SelectField
            label="Billing Cycle"
            required
            value={formData.billingCycle}
            onChange={(e) => setFormData({ ...formData, billingCycle: e.target.value })}
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'yearly', label: 'Yearly' }
            ]}
          />
          <InputField
            label="Trial Duration (Days)"
            type="number"
            min="0"
            required
            value={formData.trialDays}
            onChange={(e) => setFormData({ ...formData, trialDays: e.target.value })}
            error={errors.trialDays}
            hint="Set 0 for plans with no trial."
          />
        </div>

        {!isEditing && (
          <SelectField
            label="Initial Status"
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            options={[
              { value: 'active', label: 'Active (Available for subscriptions)' },
              { value: 'inactive', label: 'Inactive (Hidden from subscribers)' }
            ]}
          />
        )}

        <TextAreaField
          label="Description"
          placeholder="Brief description of tier capabilities, target organization size, or limits..."
          rows={3}
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </form>
    </Modal>
  );
}

