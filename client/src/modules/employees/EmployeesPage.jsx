import React, { useEffect, useState } from 'react';
import { UserPlus, Shield, Activity, UserX, UserCheck, RefreshCw } from 'lucide-react';
import { organisationApi, roleApi } from '../../api';
import DataTable from '../../components/common/DataTable';
import SearchFilterBar from '../../components/common/SearchFilterBar';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { PageTransition } from '../../components/common/MotionPrimitives';
import InvitationStatusBadge from './InvitationStatusBadge';
import {
  InviteEmployeeModal,
  AssignRoleModal,
  PermissionsModal,
  ActivityModal,
  ResendInvitationModal
} from './EmployeeModals';

export default function EmployeesPage() {
  const { addToast } = useToast();
  const { hasPermission } = useAuth();

  const [employees, setEmployees] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    fullName: '',
    email: '',
    department: 'Engineering',
    designation: 'Recruiter',
    roleCode: 'RECRUITER',
    sendInvite: true
  });

  const [roleModalEmp, setRoleModalEmp] = useState(null);
  const [selectedRoleCode, setSelectedRoleCode] = useState('RECRUITER');
  const [permModalEmp, setPermModalEmp] = useState(null);
  const [customPerms, setCustomPerms] = useState([]);
  const [activityModal, setActivityModal] = useState(null);
  const [resendModalEmp, setResendModalEmp] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [empRes, roleRes, permRes] = await Promise.all([
        organisationApi.listEmployees({ search: search || undefined }),
        roleApi.listRoles().catch(() => ({ data: [] })),
        roleApi.listPermissions().catch(() => ({ data: [] }))
      ]);
      setEmployees(empRes.data || []);
      setRoles(roleRes.data || []);
      setPermissions(permRes.data || []);
    } catch (err) {
      addToast({ title: 'Load failed', message: err.message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await organisationApi.addEmployee(inviteForm);
      addToast({ title: 'Employee Added', message: `Invited ${inviteForm.email}`, variant: 'success' });
      setInviteOpen(false);
      setInviteForm({ fullName: '', email: '', department: 'Engineering', designation: 'Recruiter', roleCode: 'RECRUITER', sendInvite: true });
      loadData();
    } catch (err) {
      addToast({ title: 'Failed to add employee', message: err.message, variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleUpdate = async () => {
    setSubmitting(true);
    try {
      await organisationApi.assignRole(roleModalEmp.employeeId, { roleCode: selectedRoleCode });
      addToast({ title: 'Role Updated', message: `Assigned ${selectedRoleCode}`, variant: 'success' });
      setRoleModalEmp(null);
      loadData();
    } catch (err) {
      addToast({ title: 'Update Failed', message: err.message, variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePermissionsSave = async () => {
    setSubmitting(true);
    try {
      await organisationApi.updatePermissions(permModalEmp.employeeId, { customPermissions: customPerms });
      addToast({ title: 'Permissions Updated', message: 'Custom permission overrides saved.', variant: 'success' });
      setPermModalEmp(null);
      loadData();
    } catch (err) {
      addToast({ title: 'Update Failed', message: err.message, variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleAccess = async (emp) => {
    try {
      if (emp.recruitmentAccess?.isActive) {
        await organisationApi.deactivateAccess(emp.employeeId);
        addToast({ title: 'Access Deactivated', message: `${emp.fullName} access deactivated.`, variant: 'info' });
      } else {
        await organisationApi.reactivateAccess(emp.employeeId);
        addToast({ title: 'Access Reactivated', message: `${emp.fullName} access restored.`, variant: 'success' });
      }
      loadData();
    } catch (err) {
      addToast({ title: 'Action Failed', message: err.message, variant: 'error' });
    }
  };

  const handleResendInvitation = async () => {
    if (!resendModalEmp) return;
    setSubmitting(true);
    try {
      await organisationApi.resendInvitation(resendModalEmp.employeeId);
      addToast({
        title: 'Invitation Resent',
        message: `Fresh onboarding email dispatched to ${resendModalEmp.email}.`,
        variant: 'success'
      });
      setResendModalEmp(null);
      loadData();
    } catch (err) {
      addToast({ title: 'Resend Failed', message: err.message, variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const openActivity = async (emp) => {
    try {
      const res = await organisationApi.getActivity(emp.employeeId);
      setActivityModal(res.data);
    } catch (err) {
      addToast({ title: 'Activity Load Failed', message: err.message, variant: 'error' });
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Employee',
      render: (row) => (
        <div>
          <p className="font-semibold text-slate-900">{row.fullName}</p>
          <p className="text-xs text-slate-500">{row.email}</p>
        </div>
      )
    },
    {
      key: 'department',
      label: 'Department & Title',
      render: (row) => (
        <div className="text-xs">
          <p className="font-medium text-slate-800">{row.department}</p>
          <p className="text-slate-500">{row.designation}</p>
        </div>
      )
    },
    {
      key: 'role',
      label: 'Role',
      render: (row) =>
        row.recruitmentAccess ? (
          <Badge status="ACTIVE">{row.recruitmentAccess.roleName || row.recruitmentAccess.roleCode}</Badge>
        ) : (
          <Badge status="DRAFT">Unassigned</Badge>
        )
    },
    {
      key: 'invitationStatus',
      label: 'Onboarding / Invitation',
      render: (row) => (
        <div className="flex flex-col gap-1 items-start">
          <InvitationStatusBadge
            status={row.recruitmentAccess?.invitationStatus || 'EMPLOYEE_CREATED'}
            deliveryStatus={row.recruitmentAccess?.invitationDeliveryStatus}
            error={row.recruitmentAccess?.invitationError}
          />
          {row.recruitmentAccess?.invitationResendCount > 0 && (
            <span className="text-[10px] text-slate-400">
              Resent {row.recruitmentAccess.invitationResendCount}x
            </span>
          )}
        </div>
      )
    },
    {
      key: 'access',
      label: 'Access',
      render: (row) => (
        <Badge status={row.recruitmentAccess?.isActive ? 'ACTIVE' : 'SUSPENDED'}>
          {row.recruitmentAccess?.isActive ? 'Active' : 'Deactivated'}
        </Badge>
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => {
        const canResend =
          hasPermission('employee:manage') &&
          row.recruitmentAccess?.invitationStatus !== 'ACCOUNT_ACTIVATED';

        return (
          <div className="flex flex-wrap items-center gap-1.5">
            {canResend && (
              <Button
                size="sm"
                variant="secondary"
                icon={RefreshCw}
                onClick={() => setResendModalEmp(row)}
                title="Resend invitation email"
              >
                Resend
              </Button>
            )}
            {hasPermission('employee:manage') && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setRoleModalEmp(row);
                    setSelectedRoleCode(row.recruitmentAccess?.roleCode || 'RECRUITER');
                  }}
                >
                  Role
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={Shield}
                  onClick={() => {
                    setPermModalEmp(row);
                    setCustomPerms(row.recruitmentAccess?.customPermissions || []);
                  }}
                >
                  Perms
                </Button>
                <Button
                  size="sm"
                  variant={row.recruitmentAccess?.isActive ? 'danger' : 'soft'}
                  icon={row.recruitmentAccess?.isActive ? UserX : UserCheck}
                  onClick={() => handleToggleAccess(row)}
                >
                  {row.recruitmentAccess?.isActive ? 'Deactivate' : 'Activate'}
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" icon={Activity} onClick={() => openActivity(row)}>
              Activity
            </Button>
          </div>
        );
      }
    }
  ];

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Employees &amp; Team Access</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage hiring team accounts, invitation delivery states, role assignments, and granular permissions.
          </p>
        </div>
        {hasPermission('employee:create') && (
          <Button variant="primary" icon={UserPlus} onClick={() => setInviteOpen(true)}>
            Add &amp; Invite Employee
          </Button>
        )}
      </div>

      <SearchFilterBar
        searchPlaceholder="Search employees by name, email, department..."
        searchValue={search}
        onSearchChange={setSearch}
        onSearchSubmit={loadData}
      />

      <DataTable
        columns={columns}
        data={employees}
        loading={loading}
        emptyMessage="No employees found. Invite members to your recruitment workspace."
      />

      <InviteEmployeeModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSubmit={handleInviteSubmit}
        form={inviteForm}
        onChange={setInviteForm}
        loading={submitting}
        roles={roles}
      />

      <AssignRoleModal
        emp={roleModalEmp}
        onClose={() => setRoleModalEmp(null)}
        onSave={handleRoleUpdate}
        selectedRoleCode={selectedRoleCode}
        onRoleChange={setSelectedRoleCode}
        roles={roles}
        loading={submitting}
      />

      <PermissionsModal
        emp={permModalEmp}
        onClose={() => setPermModalEmp(null)}
        onSave={handlePermissionsSave}
        customPerms={customPerms}
        onPermsChange={setCustomPerms}
        permissions={permissions}
        loading={submitting}
      />

      <ActivityModal
        activity={activityModal}
        onClose={() => setActivityModal(null)}
      />

      <ResendInvitationModal
        emp={resendModalEmp}
        onClose={() => setResendModalEmp(null)}
        onConfirm={handleResendInvitation}
        loading={submitting}
      />
    </PageTransition>
  );
}
