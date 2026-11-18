import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Layers,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Edit2,
  Sliders,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import DataTable from '../../components/common/DataTable';
import { PageTransition } from '../../components/common/MotionPrimitives';
import { platformApi } from '../../api';
import { useToast } from '../../context/ToastContext';
import { formatPlanPrice } from '../../utils/currency';
import PlanFormModal from './components/PlanFormModal';
import PlanModulesModal from './components/PlanModulesModal';
import ConfirmDialog from './components/ConfirmDialog';

export default function PlatformPlansPage() {
  const { addToast } = useToast();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [cycleFilter, setCycleFilter] = useState('ALL');

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [modulesPlan, setModulesPlan] = useState(null);

  // Status toggle confirmation
  const [statusConfirmTarget, setStatusConfirmTarget] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await platformApi.listPlans();
      setPlans(res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch platform plans');
      addToast({ title: 'Error loading plans', message: err.message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const filteredPlans = useMemo(() => {
    return plans.filter((p) => {
      const matchesSearch =
        !searchTerm ||
        p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter.toLowerCase();
      const matchesCycle = cycleFilter === 'ALL' || p.billingCycle === cycleFilter.toLowerCase();
      return matchesSearch && matchesStatus && matchesCycle;
    });
  }, [plans, searchTerm, statusFilter, cycleFilter]);

  const handleCreateOrUpdate = async (payload) => {
    setActionLoading(true);
    try {
      if (editingPlan) {
        await platformApi.updatePlan(editingPlan.id, payload);
        addToast({ title: 'Plan Updated', message: `Saved changes to plan '${payload.name}'.`, variant: 'success' });
      } else {
        await platformApi.createPlan(payload);
        addToast({ title: 'Plan Created', message: `Plan '${payload.name}' created successfully.`, variant: 'success' });
      }
      setIsFormOpen(false);
      setEditingPlan(null);
      loadPlans();
    } catch (err) {
      addToast({ title: 'Action Failed', message: err.message, variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!statusConfirmTarget) return;
    const newStatus = statusConfirmTarget.status === 'active' ? 'inactive' : 'active';
    setActionLoading(true);
    try {
      await platformApi.updatePlanStatus(statusConfirmTarget.id, newStatus);
      addToast({
        title: 'Status Updated',
        message: `Plan '${statusConfirmTarget.name}' is now ${newStatus}.`,
        variant: 'success'
      });
      setStatusConfirmTarget(null);
      loadPlans();
    } catch (err) {
      addToast({ title: 'Failed to update status', message: err.message, variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Plan Name & Code',
      render: (row) => (
        <div>
          <span className="font-semibold text-sm text-slate-900 block">{row.name}</span>
          <span className="font-mono text-xs text-slate-500">{row.code}</span>
          {row.description && (
            <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">{row.description}</p>
          )}
        </div>
      )
    },
    {
      key: 'price',
      label: 'Price & Billing',
      render: (row) => (
        <div>
          <span className="font-semibold text-sm text-slate-900">
            {formatPlanPrice(row.price, row.billingCycle, row.currency)}
          </span>
        </div>
      )
    },
    {
      key: 'trialDays',
      label: 'Trial Length',
      render: (row) => (
        <span className="text-xs font-medium text-slate-700">
          {Number(row.trialDays || 0) > 0 ? `${row.trialDays} Days` : 'No Trial'}
        </span>
      )
    },
    {
      key: 'features',
      label: 'Attached Features',
      render: (row) => {
        const modCount = row.modules?.length || 0;
        const subCount = row.submodules?.length || 0;
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 rounded-md px-2 py-1">
            <span className="font-semibold text-slate-900">{modCount}</span> modules · <span className="font-semibold text-slate-900">{subCount}</span> submodules
          </span>
        );
      }
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <Badge status={row.status} />
    },
    {
      key: 'actions',
      label: 'Actions',
      cellClassName: 'text-right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            title="Configure Attached Modules & Submodules"
            icon={Sliders}
            onClick={() => setModulesPlan(row)}
          >
            Features
          </Button>
          <Button
            size="sm"
            variant="ghost"
            title="Edit Plan Parameters"
            icon={Edit2}
            onClick={() => {
              setEditingPlan(row);
              setIsFormOpen(true);
            }}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={row.status === 'active' ? 'text-amber-600 hover:text-amber-700' : 'text-emerald-600 hover:text-emerald-700'}
            onClick={() => setStatusConfirmTarget(row)}
          >
            {row.status === 'active' ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      )
    }
  ];

  return (
    <PageTransition className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Platform Plans Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Define pricing tiers, trial policies, and bundle software capabilities for subscriber organizations.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={loadPlans}
            loading={loading}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => {
              setEditingPlan(null);
              setIsFormOpen(true);
            }}
          >
            Create Plan
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <Card noPadding>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search plans by name, code or description..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:border-brand-600 focus:outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Filter className="h-3.5 w-3.5" />
              <span>Status:</span>
              <select
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:border-brand-600 focus:outline-none"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active Only</option>
                <option value="INACTIVE">Inactive Only</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span>Billing:</span>
              <select
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:border-brand-600 focus:outline-none"
                value={cycleFilter}
                onChange={(e) => setCycleFilter(e.target.value)}
              >
                <option value="ALL">All Cycles</option>
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <DataTable
          columns={columns}
          rows={filteredPlans}
          loading={loading}
          emptyTitle="No Platform Plans Found"
          emptyDescription={
            searchTerm || statusFilter !== 'ALL' || cycleFilter !== 'ALL'
              ? 'No plans match the specified search or filter criteria.'
              : 'Create the first platform plan to begin onboarding subscriber tenants.'
          }
          emptyAction={
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => {
                setEditingPlan(null);
                setIsFormOpen(true);
              }}
            >
              Create New Plan
            </Button>
          }
        />
      </Card>

      {/* Plan Form Modal (Create / Edit) */}
      <PlanFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingPlan(null);
        }}
        onSubmit={handleCreateOrUpdate}
        plan={editingPlan}
        loading={actionLoading}
      />

      {/* Plan Modules & Submodules Modal */}
      {modulesPlan && (
        <PlanModulesModal
          isOpen={Boolean(modulesPlan)}
          onClose={() => setModulesPlan(null)}
          plan={modulesPlan}
          onUpdated={loadPlans}
        />
      )}

      {/* Status Toggle Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(statusConfirmTarget)}
        onClose={() => setStatusConfirmTarget(null)}
        onConfirm={handleToggleStatus}
        loading={actionLoading}
        title={statusConfirmTarget?.status === 'active' ? 'Deactivate Platform Plan' : 'Activate Platform Plan'}
        description={
          statusConfirmTarget?.status === 'active'
            ? `Deactivating '${statusConfirmTarget?.name}' will prevent new subscriptions from selecting this plan. Existing subscribers remain active.`
            : `Activating '${statusConfirmTarget?.name}' will make it immediately available for tenant subscriptions.`
        }
        confirmText={statusConfirmTarget?.status === 'active' ? 'Deactivate' : 'Activate'}
        variant={statusConfirmTarget?.status === 'active' ? 'danger' : 'primary'}
      />
    </PageTransition>
  );
}

