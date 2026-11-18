import React, { useEffect, useState } from 'react';
import { Plus, ShieldCheck } from 'lucide-react';
import { roleApi } from '../../api';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import { InputField, TextAreaField } from '../../components/common/FormField';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { PageTransition } from '../../components/common/MotionPrimitives';

export default function RolesPermissionsPage() {
  const { addToast } = useToast();
  const { hasPermission } = useAuth();

  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState(null);
  const [editedPerms, setEditedPerms] = useState([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [newRole, setNewRole] = useState({ code: '', name: '', description: '', permissionCodes: [] });

  const loadData = async () => {
    setLoading(true);
    try {
      const [rRes, pRes] = await Promise.all([roleApi.listRoles(), roleApi.listPermissions()]);
      setRoles(rRes.data || []);
      setPermissions(pRes.data || []);
    } catch (err) {
      addToast({ title: 'Load failed', message: err.message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openEditMatrix = (role) => {
    setSelectedRole(role);
    setEditedPerms((role.permissions || []).map((p) => p.code));
  };

  const handleSaveRolePerms = async () => {
    try {
      await roleApi.updateRolePermissions(selectedRole.id, editedPerms);
      addToast({ title: 'Permissions Saved', message: `${selectedRole.name} updated.`, variant: 'success' });
      setSelectedRole(null);
      loadData();
    } catch (err) {
      addToast({ title: 'Save Failed', message: err.message, variant: 'error' });
    }
  };

  const handleCreateRole = async (e) => {
    e.preventDefault();
    try {
      await roleApi.createRole(newRole);
      addToast({ title: 'Role Created', message: `${newRole.name} added to organisation.`, variant: 'success' });
      setCreateOpen(false);
      setNewRole({ code: '', name: '', description: '', permissionCodes: [] });
      loadData();
    } catch (err) {
      addToast({ title: 'Creation Failed', message: err.message, variant: 'error' });
    }
  };

  if (loading) return <LoadingSkeleton rows={5} />;

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Roles & Granular Permissions</h1>
          <p className="mt-1 text-sm text-slate-600">
            All RBAC rules are strictly enforced by the backend permission resolver.
          </p>
        </div>
        {hasPermission('role:manage') && (
          <Button icon={Plus} onClick={() => setCreateOpen(true)}>
            Create Custom Role
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {roles.map((role) => (
          <Card
            key={role.id}
            title={role.name}
            subtitle={`${role.code} · ${role.assignedCount || 0} assigned`}
            actions={
              hasPermission('role:manage') &&
              role.code !== 'CANDIDATE' && (
                <Button size="sm" variant="secondary" icon={ShieldCheck} onClick={() => openEditMatrix(role)}>
                  Edit Permissions
                </Button>
              )
            }
          >
            <p className="text-xs text-slate-600">{role.description}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {(role.permissions || []).slice(0, 10).map((p) => (
                <span key={p.code} className="rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                  {p.code}
                </span>
              ))}
              {(role.permissions || []).length > 10 && (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                  +{role.permissions.length - 10} more
                </span>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Modal
        isOpen={Boolean(selectedRole)}
        onClose={() => setSelectedRole(null)}
        title={`Edit Permissions: ${selectedRole?.name}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedRole(null)}>Cancel</Button>
            <Button onClick={handleSaveRolePerms}>Update Role Matrix</Button>
          </>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {permissions
            .filter((p) => p.code !== 'candidate:self')
            .map((perm) => {
              const checked = editedPerms.includes(perm.code);
              return (
                <label key={perm.code} className="flex items-start gap-2 rounded-lg border border-slate-200 p-2.5 text-xs">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setEditedPerms((prev) =>
                        checked ? prev.filter((c) => c !== perm.code) : [...prev, perm.code]
                      )
                    }
                  />
                  <div>
                    <p className="font-semibold text-slate-900">{perm.name}</p>
                    <p className="text-[11px] text-slate-500">{perm.code}</p>
                  </div>
                </label>
              );
            })}
        </div>
      </Modal>

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Create Custom Role">
        <form onSubmit={handleCreateRole} className="space-y-4">
          <InputField
            label="Role Name"
            required
            value={newRole.name}
            onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
            placeholder="Talent Coordinator"
          />
          <InputField
            label="Role Code"
            required
            value={newRole.code}
            onChange={(e) => setNewRole({ ...newRole, code: e.target.value })}
            placeholder="TALENT_COORDINATOR"
          />
          <TextAreaField
            label="Description"
            required
            rows={2}
            value={newRole.description}
            onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
          />
          <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
            {permissions
              .filter((p) => p.code !== 'candidate:self')
              .map((perm) => {
                const checked = newRole.permissionCodes.includes(perm.code);
                return (
                  <label key={perm.code} className="flex items-center gap-2 rounded border border-slate-200 p-2 text-xs">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setNewRole((prev) => ({
                          ...prev,
                          permissionCodes: checked
                            ? prev.permissionCodes.filter((c) => c !== perm.code)
                            : [...prev.permissionCodes, perm.code]
                        }))
                      }
                    />
                    <span>{perm.code}</span>
                  </label>
                );
              })}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit">Create Role</Button>
          </div>
        </form>
      </Modal>
    </PageTransition>
  );
}

