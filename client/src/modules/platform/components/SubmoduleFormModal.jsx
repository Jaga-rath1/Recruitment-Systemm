import React, { useEffect, useState } from 'react';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';
import { InputField, TextAreaField, SelectField } from '../../../components/common/FormField';

export default function SubmoduleFormModal({
  isOpen,
  onClose,
  onSubmit,
  submoduleItem = null,
  modules = [],
  defaultModuleId = '',
  loading = false
}) {
  const isEditing = Boolean(submoduleItem);
  const [formData, setFormData] = useState({
    moduleId: defaultModuleId || '',
    name: '',
    code: '',
    description: '',
    status: 'active'
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (submoduleItem) {
      setFormData({
        moduleId: submoduleItem.moduleId || defaultModuleId || '',
        name: submoduleItem.name || '',
        code: submoduleItem.code || '',
        description: submoduleItem.description || '',
        status: submoduleItem.status || 'active'
      });
    } else {
      setFormData({
        moduleId: defaultModuleId || modules[0]?.id || '',
        name: '',
        code: '',
        description: '',
        status: 'active'
      });
    }
    setErrors({});
  }, [submoduleItem, defaultModuleId, modules, isOpen]);

  const validate = () => {
    const errs = {};
    if (!formData.moduleId) errs.moduleId = 'Parent module is required';
    if (!formData.name.trim()) errs.name = 'Submodule name is required';
    if (!formData.code.trim()) errs.code = 'Submodule code is required (e.g. EMPLOYEES, LEAVE)';
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
      payload.moduleId = formData.moduleId;
      payload.status = formData.status;
    }
    onSubmit(payload);
  };

  const moduleOptions = modules.map((m) => ({
    value: m.id,
    label: `${m.name} (${m.code})`
  }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Edit Submodule: ${submoduleItem?.name}` : 'Register Catalog Submodule'}
      subtitle="Defines a granular feature boundary attached to a parent software module"
      footer={
        <div className="flex items-center justify-end gap-2.5">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} loading={loading}>
            {isEditing ? 'Save Changes' : 'Register Submodule'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {!isEditing && (
          <SelectField
            label="Parent Module"
            required
            value={formData.moduleId}
            onChange={(e) => setFormData({ ...formData, moduleId: e.target.value })}
            options={moduleOptions}
            error={errors.moduleId}
          />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField
            label="Submodule Name"
            required
            placeholder="e.g. Employee Records"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={errors.name}
          />
          <InputField
            label="Submodule Code"
            required
            placeholder="e.g. EMPLOYEES"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.target.value })}
            error={errors.code}
            disabled={isEditing}
            hint={isEditing ? 'Submodule code cannot be changed.' : 'Uppercase code used in downstream RBAC.'}
          />
        </div>

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
          placeholder="Detailed capabilities governed by this submodule..."
          rows={3}
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </form>
    </Modal>
  );
}

