import React, { useState } from 'react';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import { InputField, SelectField } from '../../components/common/FormField';

export function InviteEmployeeModal({ open, onClose, onSubmit, form, onChange, loading, roles }) {
  return (
    <Modal open={open} onClose={onClose} title="Add & Invite Team Member">
      <form onSubmit={onSubmit} className="space-y-4">
        <InputField
          label="Full Name"
          required
          value={form.fullName}
          onChange={(e) => onChange({ ...form, fullName: e.target.value })}
          placeholder="Jane Doe"
        />
        <InputField
          label="Work Email"
          type="email"
          required
          value={form.email}
          onChange={(e) => onChange({ ...form, email: e.target.value })}
          placeholder="jane@company.com"
        />
        <div className="grid grid-cols-2 gap-3">
          <InputField
            label="Department"
            value={form.department}
            onChange={(e) => onChange({ ...form, department: e.target.value })}
          />
          <InputField
            label="Designation"
            value={form.designation}
            onChange={(e) => onChange({ ...form, designation: e.target.value })}
          />
        </div>

        <SelectField
          label="Recruitment Role"
          value={form.roleCode}
          onChange={(e) => onChange({ ...form, roleCode: e.target.value })}
          options={(roles || []).map((r) => ({ label: `${r.name} (${r.code})`, value: r.code }))}
        />

        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
          <input
            id="sendInviteCheckbox"
            type="checkbox"
            checked={form.sendInvite}
            onChange={(e) => onChange({ ...form, sendInvite: e.target.checked })}
            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 h-4 w-4"
          />
          <label htmlFor="sendInviteCheckbox" className="font-medium text-slate-700 cursor-pointer">
            Send onboarding invitation email with password setup link
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
          <Button variant="primary" type="submit" loading={loading}>Add Employee</Button>
        </div>
      </form>
    </Modal>
  );
}

export function AssignRoleModal({ emp, onClose, onSave, selectedRoleCode, onRoleChange, roles, loading }) {
  if (!emp) return null;
  return (
    <Modal open={!!emp} onClose={onClose} title={`Assign Role — ${emp.fullName}`}>
      <div className="space-y-4">
        <p className="text-xs text-slate-600">
          Updating the recruitment role will automatically grant the standard permissions of that role.
        </p>
        <SelectField
          label="Recruitment Role"
          value={selectedRoleCode}
          onChange={(e) => onRoleChange(e.target.value)}
          options={(roles || []).map((r) => ({ label: `${r.name} (${r.code})`, value: r.code }))}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={onSave} loading={loading}>Save Role</Button>
        </div>
      </div>
    </Modal>
  );
}

export function PermissionsModal({ emp, onClose, onSave, customPerms, onPermsChange, permissions, loading }) {
  if (!emp) return null;
  return (
    <Modal open={!!emp} onClose={onClose} title={`Custom Permissions — ${emp.fullName}`}>
      <div className="space-y-4">
        <p className="text-xs text-slate-600">
          Granular permission overrides applied on top of the assigned role.
        </p>
        <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-3">
          {(permissions || []).map((p) => {
            const checked = customPerms.includes(p.code);
            return (
              <label key={p.code} className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer p-1 rounded hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    if (e.target.checked) onPermsChange([...customPerms, p.code]);
                    else onPermsChange(customPerms.filter((c) => c !== p.code));
                  }}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 mt-0.5 h-3.5 w-3.5"
                />
                <div>
                  <span className="font-semibold block">{p.name}</span>
                  <span className="text-[11px] text-slate-500">{p.description}</span>
                </div>
              </label>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={onSave} loading={loading}>Save Overrides</Button>
        </div>
      </div>
    </Modal>
  );
}

export function ActivityModal({ activity, onClose }) {
  if (!activity) return null;
  return (
    <Modal open={!!activity} onClose={onClose} title={`Activity — ${activity.employee?.fullName || 'Employee'}`}>
      <div className="space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 border border-slate-200">
          <div>
            <span className="text-slate-500 font-medium">Interviews Conducted:</span>
            <p className="font-bold text-slate-900 text-sm mt-0.5">{activity.interviewsCompleted || 0}</p>
          </div>
          <div>
            <span className="text-slate-500 font-medium">Scorecards Submitted:</span>
            <p className="font-bold text-slate-900 text-sm mt-0.5">{activity.scorecardsSubmitted || 0}</p>
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}

export function ResendInvitationModal({ emp, onClose, onConfirm, loading }) {
  if (!emp) return null;
  return (
    <Modal open={!!emp} onClose={onClose} title="Resend Invitation Email">
      <div className="space-y-4 text-xs">
        <p className="text-slate-700 leading-relaxed">
          Are you sure you want to resend the recruitment invitation email to <strong>{emp.fullName}</strong> ({emp.email})?
        </p>
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-indigo-950 space-y-1">
          <p className="font-semibold">Security Note:</p>
          <p className="text-[11px] text-indigo-800">
            A fresh single-use activation token will be generated with a new 48-hour expiration period. Any previous activation link sent to this employee will be invalidated.
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={onConfirm} loading={loading}>Resend Invitation Email</Button>
        </div>
      </div>
    </Modal>
  );
}
