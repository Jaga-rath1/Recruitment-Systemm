import React, { useEffect, useState } from 'react';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';
import { InputField, SelectField } from '../../../components/common/FormField';
import { formatPlanPrice } from '../../../utils/currency';

export default function SubscriptionFormModal({
  isOpen,
  onClose,
  onSubmit,
  plans = [],
  initialOrgId = '',
  loading = false
}) {
  const [formData, setFormData] = useState({
    organizationId: initialOrgId || '',
    planId: '',
    status: 'active',
    startsAt: new Date().toISOString().split('T')[0],
    endsAt: '',
    trialEndsAt: ''
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isOpen) {
      const activePlans = plans.filter((p) => p.status === 'active');
      setFormData({
        organizationId: initialOrgId || '',
        planId: activePlans[0]?.id || '',
        status: 'active',
        startsAt: new Date().toISOString().split('T')[0],
        endsAt: '',
        trialEndsAt: ''
      });
      setErrors({});
    }
  }, [isOpen, initialOrgId, plans]);

  const validate = () => {
    const errs = {};
    if (!formData.organizationId.trim()) {
      errs.organizationId = 'Organization UUID is required';
    } else {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(formData.organizationId.trim())) {
        errs.organizationId = 'Invalid UUID format (e.g. 2bd19235-b81a-4ea7-9cac-457e888b63b2)';
      }
    }
    if (!formData.planId) errs.planId = 'Please select a plan';
    if (!formData.startsAt) errs.startsAt = 'Start date is required';
    if (formData.endsAt && new Date(formData.endsAt) <= new Date(formData.startsAt)) {
      errs.endsAt = 'End date must be strictly after start date';
    }
    if (formData.status === 'trial' && formData.trialEndsAt && new Date(formData.trialEndsAt) <= new Date(formData.startsAt)) {
      errs.trialEndsAt = 'Trial end date must be after start date';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    const payload = {
      organizationId: formData.organizationId.trim(),
      planId: formData.planId,
      status: formData.status,
      startsAt: new Date(formData.startsAt).toISOString()
    };
    if (formData.endsAt) {
      payload.endsAt = new Date(formData.endsAt).toISOString();
    }
    if (formData.status === 'trial' && formData.trialEndsAt) {
      payload.trialEndsAt = new Date(formData.trialEndsAt).toISOString();
    }
    onSubmit(payload);
  };

  const planOptions = plans
    .filter((p) => p.status === 'active')
    .map((p) => ({
      value: p.id,
      label: `${p.name} (${formatPlanPrice(p.price, p.billingCycle, p.currency)})`
    }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Provision New Subscription"
      subtitle="Bind an organization tenant to an authorized platform plan"
      footer={
        <div className="flex items-center justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} loading={loading}>
            Provision Subscription
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <InputField
          label="Organization ID (UUID)"
          required
          placeholder="e.g. 2bd19235-b81a-4ea7-9cac-457e888b63b2"
          value={formData.organizationId}
          onChange={(e) => setFormData({ ...formData, organizationId: e.target.value })}
          error={errors.organizationId}
          hint="Organization UUID from Organisation Service or Auth Service."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="Select Active Plan"
            required
            value={formData.planId}
            onChange={(e) => setFormData({ ...formData, planId: e.target.value })}
            options={planOptions}
            error={errors.planId}
          />
          <SelectField
            label="Subscription Type"
            required
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            options={[
              { value: 'active', label: 'Active Subscription (Immediate)' },
              { value: 'trial', label: 'Trial Period' }
            ]}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField
            label="Start Date"
            type="date"
            required
            value={formData.startsAt}
            onChange={(e) => setFormData({ ...formData, startsAt: e.target.value })}
            error={errors.startsAt}
          />
          <InputField
            label="Subscription End Date (Optional)"
            type="date"
            value={formData.endsAt}
            onChange={(e) => setFormData({ ...formData, endsAt: e.target.value })}
            error={errors.endsAt}
            hint="Leave blank for open-ended / recurring renewal."
          />
        </div>

        {formData.status === 'trial' && (
          <InputField
            label="Trial Expiration Date (Optional)"
            type="date"
            value={formData.trialEndsAt}
            onChange={(e) => setFormData({ ...formData, trialEndsAt: e.target.value })}
            error={errors.trialEndsAt}
            hint="If left blank, defaults to the plan's configured trial days (or 14 days)."
          />
        )}
      </form>
    </Modal>
  );
}

