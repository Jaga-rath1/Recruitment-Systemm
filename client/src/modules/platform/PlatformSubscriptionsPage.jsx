import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CreditCard,
  Plus,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  ExternalLink,
  AlertTriangle,
  ClipboardCheck,
  Calendar,
  Building2
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import { InputField, SelectField } from '../../components/common/FormField';
import { PageTransition } from '../../components/common/MotionPrimitives';
import { platformApi } from '../../api';
import { useToast } from '../../context/ToastContext';
import { formatPlanPrice } from '../../utils/currency';
import SubscriptionFormModal from './components/SubscriptionFormModal';
import ConfirmDialog from './components/ConfirmDialog';

export default function PlatformSubscriptionsPage() {
  const { addToast } = useToast();
  const [searchParams] = useSearchParams();
  const initialOrgId = searchParams.get('orgId') || '';

  const [subscriptions, setSubscriptions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search and Filters
  const [searchTerm, setSearchTerm] = useState(initialOrgId);
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState(null);
  const [transitionStatus, setTransitionStatus] = useState('');
  const [transitionEndsAt, setTransitionEndsAt] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Quick Trial Action Dialog
  const [trialActionTarget, setTrialActionTarget] = useState(null);
  const [trialOutcome, setTrialOutcome] = useState('converted');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [subsRes, plansRes] = await Promise.all([
        platformApi.listSubscriptions(),
        platformApi.listPlans()
      ]);
      setSubscriptions(subsRes.data || []);
      setPlans(plansRes.data || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch subscriptions');
      addToast({ title: 'Error loading subscriptions', message: err.message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredSubscriptions = useMemo(() => {
    return subscriptions.filter((s) => {
      const matchesSearch =
        !searchTerm ||
        s.organizationId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.plan?.name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter.toLowerCase();
      return matchesSearch && matchesStatus;
    });
  }, [subscriptions, searchTerm, statusFilter]);

  const handleCreateSubscription = async (payload) => {
    setActionLoading(true);
    try {
      await platformApi.createSubscription(payload);
      addToast({ title: 'Subscription Created', message: 'Tenant successfully provisioned.', variant: 'success' });
      setIsCreateOpen(false);
      loadData();
    } catch (err) {
      addToast({ title: 'Creation Failed', message: err.message, variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleStatusTransition = async (e) => {
    e.preventDefault();
    if (!transitionTarget) return;
    setActionLoading(true);
    try {
      const payload = {};
      if (transitionStatus) payload.status = transitionStatus;
      if (transitionEndsAt) payload.endsAt = new Date(transitionEndsAt).toISOString();

      await platformApi.updateSubscription(transitionTarget.id, payload);
      addToast({
        title: 'Subscription Updated',
        message: `Subscription transitioned to '${transitionStatus || transitionTarget.status}'.`,
        variant: 'success'
      });
      setTransitionTarget(null);
      loadData();
    } catch (err) {
      addToast({ title: 'Update Failed', message: err.message, variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleTrialOutcomeConfirm = async () => {
    if (!trialActionTarget) return;
    setActionLoading(true);
    try {
      await platformApi.updateTrialStatus(trialActionTarget.id, trialOutcome);
      addToast({
        title: 'Trial Updated',
        message: `Trial marked as '${trialOutcome}'.`,
        variant: 'success'
      });
      setTrialActionTarget(null);
      loadData();
    } catch (err) {
      addToast({ title: 'Trial Update Failed', message: err.message, variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const openTransitionModal = (sub) => {
    setTransitionTarget(sub);
    // Allowed transitions based on backend rules:
    // trial -> active, cancelled, expired
    // active -> cancelled, expired
    if (sub.status === 'trial') {
      setTransitionStatus('active');
    } else if (sub.status === 'active') {
      setTransitionStatus('cancelled');
    } else {
      setTransitionStatus('');
    }
    setTransitionEndsAt(sub.endsAt ? new Date(sub.endsAt).toISOString().split('T')[0] : '');
  };

  const columns = [
    {
      key: 'id',
      label: 'Tenant & ID',
      render: (row) => (
        <div>
          <span className="font-mono text-xs font-semibold text-slate-900 block truncate max-w-[220px]" title={row.organizationId}>
            {row.organizationId}
          </span>
          <span className="font-mono text-[10px] text-slate-400 block truncate max-w-[200px]" title={row.id}>
            Sub ID: {row.id}
          </span>
        </div>
      )
    },
    {
      key: 'plan',
      label: 'Subscribed Tier',
      render: (row) => (
        <div>
          <span className="font-medium text-xs text-slate-900 block">{row.plan?.name || 'Default Tier'}</span>
          <span className="font-mono text-[11px] text-slate-500">
            {formatPlanPrice(row.plan?.price, row.plan?.billingCycle, row.plan?.currency)}
          </span>
        </div>
      )
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <Badge status={row.status} />
    },
    {
      key: 'period',
      label: 'Timeline & Renewal',
      render: (row) => {
        const isTrial = row.status === 'trial';
        return (
          <div className="text-xs">
            <span className="text-slate-500 block">
              Started: {row.startsAt ? new Date(row.startsAt).toLocaleDateString() : 'N/A'}
            </span>
            <span className={isTrial ? 'font-medium text-amber-700' : 'text-slate-700'}>
              {isTrial
                ? row.trialEndsAt
                  ? `Trial ends ${new Date(row.trialEndsAt).toLocaleDateString()}`
                  : 'Active trial'
                : row.endsAt
                ? `Expires ${new Date(row.endsAt).toLocaleDateString()}`
                : 'Continuous renewal'}
            </span>
          </div>
        );
      }
    },
    {
      key: 'actions',
      label: 'Actions',
      cellClassName: 'text-right',
      render: (row) => {
        const isTrial = row.status === 'trial';
        const isActive = row.status === 'active';
        return (
          <div className="flex items-center justify-end gap-1.5">
            {isTrial && (
              <Button
                size="sm"
                variant="soft"
                onClick={() => {
                  setTrialActionTarget(row);
                  setTrialOutcome('converted');
                }}
              >
                Convert to Active
              </Button>
            )}

            {(isTrial || isActive) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => openTransitionModal(row)}
              >
                Change Status
              </Button>
            )}

            <Link
              to={`/platform-admin/organisations?orgId=${row.organizationId}`}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              title="Inspect Organization"
            >
              <ExternalLink className="h-4 w-4" />
            </Link>
          </div>
        );
      }
    }
  ];

  return (
    <PageTransition className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Subscription Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Monitor tenant subscription lifecycles, active trial periods, and status state-machine transitions.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            to="/platform-admin/verification-queue"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-xs transition"
          >
            <ClipboardCheck className="h-3.5 w-3.5 text-brand-600" />
            Payment Queue
          </Link>
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={loadData}
            loading={loading}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setIsCreateOpen(true)}
          >
            Provision Subscription
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
              placeholder="Filter by Organization UUID, Sub ID or Plan..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:border-brand-600 focus:outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter className="h-3.5 w-3.5" />
            <span>Status:</span>
            <select
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:border-brand-600 focus:outline-none"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="TRIAL">Trial</option>
              <option value="EXPIRED">Expired</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Data Table */}
        <DataTable
          columns={columns}
          rows={filteredSubscriptions}
          loading={loading}
          emptyTitle="No Subscriptions Found"
          emptyDescription={
            searchTerm || statusFilter !== 'ALL'
              ? 'No subscription records match your search or filter.'
              : 'No tenants have subscriptions yet.'
          }
          emptyAction={
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setIsCreateOpen(true)}
            >
              Provision Subscription
            </Button>
          }
        />
      </Card>

      {/* Create Subscription Modal */}
      <SubscriptionFormModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreateSubscription}
        plans={plans}
        initialOrgId={initialOrgId}
        loading={actionLoading}
      />

      {/* Status Transition Modal */}
      {transitionTarget && (
        <Modal
          isOpen={Boolean(transitionTarget)}
          onClose={() => setTransitionTarget(null)}
          title={`Transition Subscription: ${transitionTarget.id}`}
          subtitle={`Current status: '${transitionTarget.status.toUpperCase()}'. Select valid target state:`}
          footer={
            <div className="flex items-center justify-end gap-2.5">
              <Button variant="secondary" onClick={() => setTransitionTarget(null)} disabled={actionLoading}>
                Cancel
              </Button>
              <Button type="button" onClick={handleStatusTransition} loading={actionLoading}>
                Save Transition
              </Button>
            </div>
          }
        >
          <form onSubmit={handleStatusTransition} className="space-y-4">
            <SelectField
              label="Target Status"
              required
              value={transitionStatus}
              onChange={(e) => setTransitionStatus(e.target.value)}
              options={
                transitionTarget.status === 'trial'
                  ? [
                      { value: 'active', label: 'Active (Convert to paid subscription)' },
                      { value: 'expired', label: 'Expired (End trial evaluation)' },
                      { value: 'cancelled', label: 'Cancelled (Terminate subscription)' }
                    ]
                  : [
                      { value: 'cancelled', label: 'Cancelled (Terminate subscription)' },
                      { value: 'expired', label: 'Expired (Mark subscription ended)' }
                    ]
              }
            />

            <InputField
              label="New End Date (Optional)"
              type="date"
              value={transitionEndsAt}
              onChange={(e) => setTransitionEndsAt(e.target.value)}
              hint="Optionally extend or curtail the subscription active duration."
            />
          </form>
        </Modal>
      )}

      {/* Trial Outcome Confirmation */}
      {trialActionTarget && (
        <ConfirmDialog
          isOpen={Boolean(trialActionTarget)}
          onClose={() => setTrialActionTarget(null)}
          onConfirm={handleTrialOutcomeConfirm}
          loading={actionLoading}
          title="Convert Trial to Active Subscription"
          description={`Converting tenant '${trialActionTarget.organizationId}' will immediately elevate their trial into a full active subscription on plan '${trialActionTarget.plan?.name}'.`}
          confirmText="Confirm Conversion"
          variant="primary"
        />
      )}
    </PageTransition>
  );
}

