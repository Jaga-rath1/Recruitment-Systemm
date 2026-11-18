import React, { useEffect, useState } from 'react';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';
import { InputField, SelectField } from '../../../components/common/FormField';
import { formatPlanPrice } from '../../../utils/currency';

export default function ProvisionTrialModal({
  isOpen,
  onClose,
  onSubmit,
  plans = [],
  organizationId = '',
  loading = false
}) {
  const [formData, setFormData] = useState({
    orgId: organizationId || '',
    planId: '',
    startsAt: new Date().toISOString().split('T')[0],
    endsAt: ''
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (isOpen) {
      const activePlans = plans.filter((p) => p.status === 'active');
      setFormData({
        orgId: organizationId || '',
        planId: activePlans[0]?.id || '',
        startsAt: new Date().toISOString().split('T')[0],
        endsAt: ''
      });
      setErrors({});
    }
  }, [isOpen, organizationId, plans]);

  const validate = () => {
    const errs = {};
    if (!formData.orgId.trim()) {
      errs.orgId = 'Organization UUID is required';
    }
    if (!formData.planId) errs.planId = 'Please select a plan';
    if (!formData.startsAt) errs.startsAt = 'Start date is required';
    if (formData.endsAt && new Date(formData.endsAt) <= new Date(formData.startsAt)) {
      errs.endsAt = 'End date must be after start date';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    const payload = {
      organizationId: formData.orgId.trim(),
      planId: formData.planId,
      startsAt: new Date(formData.startsAt).toISOString()
    };
    if (formData.endsAt) {
      payload.endsAt = new Date(formData.endsAt).toISOString();
    }
    onSubmit(payload);
  };

  const planOptions = plans
    .filter((p) => p.status === 'active')
    .map((p) => ({
      value: p.id,
      label: `${p.name} (${p.trialDays} day trial, ${formatPlanPrice(p.price, p.billingCycle, p.currency)})`
    }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Provision Organization Trial"
      subtitle="Start an authorized evaluation period for an organization tenant"
      footer={
        <div className="flex items-center justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} loading={loading}>
            Start Trial
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <InputField
          label="Organization UUID"
          required
          placeholder="e.g. 2bd19235-b81a-4ea7-9cac-457e888b63b2"
          value={formData.orgId}
          onChange={(e) => setFormData({ ...formData, orgId: e.target.value })}
          error={errors.orgId}
        />

        <SelectField
          label="Select Evaluation Plan"
          required
          value={formData.planId}
          onChange={(e) => setFormData({ ...formData, planId: e.target.value })}
          options={planOptions}
          error={errors.planId}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField
            label="Trial Start Date"
            type="date"
            required
            value={formData.startsAt}
            onChange={(e) => setFormData({ ...formData, startsAt: e.target.value })}
            error={errors.startsAt}
          />
          <InputField
            label="Trial Expiration Date (Optional)"
            type="date"
            value={formData.endsAt}
            onChange={(e) => setFormData({ ...formData, endsAt: e.target.value })}
            error={errors.endsAt}
            hint="Leave blank to use the plan's default trial period."
          />
        </div>
      </form>
    </Modal>
  );
}

