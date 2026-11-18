import React, { useEffect, useState } from 'react';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';
import { InputField, TextAreaField, SelectField } from '../../../components/common/FormField';

export default function ModuleFormModal({
  isOpen,
  onClose,
  onSubmit,
  moduleItem = null,
  loading = false
}) {
  const isEditing = Boolean(moduleItem);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    status: 'active'
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (moduleItem) {
      setFormData({
        name: moduleItem.name || '',
        code: moduleItem.code || '',
        description: moduleItem.description || '',
        status: moduleItem.status || 'active'
      });
    } else {
      setFormData({
        name: '',
        code: '',
        description: '',
        status: 'active'
      });
    }
    setErrors({});
  }, [moduleItem, isOpen]);

  const validate = () => {
    const errs = {};
    if (!formData.name.trim()) errs.name = 'Module name is required';
    if (!formData.code.trim()) errs.code = 'Module code is required (e.g. HRMS, RECRUITMENT)';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    const payload = {
      name: formData.name.trim(),
      code: formData.code.trim().toUpperCase(),
      description: formData.description.trim() || null
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
      title={isEditing ? `Edit Module: ${moduleItem?.name}` : 'Register Catalog Module'}
      subtitle="Defines a top-level software product suite evaluated by NEXNUV entitlements"
      footer={
        <div className="flex items-center justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} loading={loading}>
            {isEditing ? 'Save Changes' : 'Register Module'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <InputField
          label="Module Name"
          required
          placeholder="e.g. Human Resource Management"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          error={errors.name}
        />
        <InputField
          label="Module Code"
          required
          placeholder="e.g. HRMS"
          value={formData.code}
          onChange={(e) => setFormData({ ...formData, code: e.target.value })}
          error={errors.code}
          disabled={isEditing}
          hint={isEditing ? 'Module code cannot be changed after creation.' : 'Uppercase unique identifier matching microservice feature checks.'}
        />

        {!isEditing && (
          <SelectField
            label="Initial Status"
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            options={[
              { value: 'active', label: 'Active (Available for plans)' },
              { value: 'inactive', label: 'Inactive (Disabled platform-wide)' }
            ]}
          />
        )}

        <TextAreaField
          label="Description"
          placeholder="Summary of capabilities provided by this module..."
          rows={3}
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </form>
    </Modal>
  );
}

