import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Sliders,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Edit2,
  Trash2,
  Activity,
  CheckCircle2,
  XCircle,
  Layers,
  Cpu,
  Server
} from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import DataTable from '../../components/common/DataTable';
import Tabs from '../../components/common/Tabs';
import { PageTransition } from '../../components/common/MotionPrimitives';
import { platformApi } from '../../api';
import { useToast } from '../../context/ToastContext';
import ModuleFormModal from './components/ModuleFormModal';
import SubmoduleFormModal from './components/SubmoduleFormModal';
import ConfirmDialog from './components/ConfirmDialog';

export default function PlatformConfigurationPage() {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('modules');

  const [modules, setModules] = useState([]);
  const [submodules, setSubmodules] = useState([]);
  const [healthStatus, setHealthStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [moduleFilter, setModuleFilter] = useState('ALL');

  // Modals state
  const [isModuleModalOpen, setIsModuleModalOpen] = useState(false);
  const [editingModule, setEditingModule] = useState(null);

  const [isSubmoduleModalOpen, setIsSubmoduleModalOpen] = useState(false);
  const [editingSubmodule, setEditingSubmodule] = useState(null);

  // Confirmation dialogs
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [confirmType, setConfirmType] = useState('module');
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [modsRes, subsRes, health] = await Promise.all([
        platformApi.listModules().catch(() => ({ data: [] })),
        platformApi.listSubmodules().catch(() => ({ data: [] })),
        platformApi.getHealth().catch(() => ({ success: false, status: 'offline' }))
      ]);

      setModules(modsRes.data || []);
      setSubmodules(subsRes.data || []);
      setHealthStatus(health);
    } catch (err) {
      addToast({ title: 'Error loading configuration', message: err.message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtering modules
  const filteredModules = useMemo(() => {
    return modules.filter((m) => {
      const matchesSearch =
        !searchTerm ||
        m.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.description?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });
  }, [modules, searchTerm]);

  // Filtering submodules
  const filteredSubmodules = useMemo(() => {
    return submodules.filter((s) => {
      const matchesSearch =
        !searchTerm ||
        s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesModule = moduleFilter === 'ALL' || s.moduleId === moduleFilter;
      return matchesSearch && matchesModule;
    });
  }, [submodules, searchTerm, moduleFilter]);

  // Module CRUD handlers
  const handleSaveModule = async (payload) => {
    setActionLoading(true);
    try {
      if (editingModule) {
        await platformApi.updateModule(editingModule.id, payload);
        addToast({ title: 'Module Updated', message: `Saved changes to module '${payload.name}'.`, variant: 'success' });
      } else {
        await platformApi.createModule(payload);
        addToast({ title: 'Module Registered', message: `Module '${payload.name}' registered in catalog.`, variant: 'success' });
      }
      setIsModuleModalOpen(false);
      setEditingModule(null);
      loadData();
    } catch (err) {
      addToast({ title: 'Action Failed', message: err.message, variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleModuleStatus = async () => {
    if (!confirmTarget) return;
    const newStatus = confirmTarget.status === 'active' ? 'inactive' : 'active';
    setActionLoading(true);
    try {
      if (confirmType === 'module') {
        await platformApi.updateModuleStatus(confirmTarget.id, newStatus);
        addToast({ title: 'Module Status Updated', message: `Module is now ${newStatus}.`, variant: 'success' });
      } else {
        await platformApi.updateSubmoduleStatus(confirmTarget.id, newStatus);
        addToast({ title: 'Submodule Status Updated', message: `Submodule is now ${newStatus}.`, variant: 'success' });
      }
      setConfirmTarget(null);
      loadData();
    } catch (err) {
      addToast({ title: 'Status Update Failed', message: err.message, variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  // Submodule CRUD handlers
  const handleSaveSubmodule = async (payload) => {
    setActionLoading(true);
    try {
      if (editingSubmodule) {
        await platformApi.updateSubmodule(editingSubmodule.id, payload);
        addToast({ title: 'Submodule Updated', message: `Saved changes to submodule '${payload.name}'.`, variant: 'success' });
      } else {
        await platformApi.createSubmodule(payload);
        addToast({ title: 'Submodule Registered', message: `Submodule '${payload.name}' added to catalog.`, variant: 'success' });
      }
      setIsSubmoduleModalOpen(false);
      setEditingSubmodule(null);
      loadData();
    } catch (err) {
      addToast({ title: 'Action Failed', message: err.message, variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const moduleColumns = [
    {
      key: 'name',
      label: 'Module Name',
      render: (row) => (
        <div>
          <span className="font-semibold text-sm text-slate-900 block">{row.name}</span>
          {row.description && <p className="text-xs text-slate-500 line-clamp-1">{row.description}</p>}
        </div>
      )
    },
    {
      key: 'code',
      label: 'Module Code',
      render: (row) => (
        <span className="font-mono text-xs font-semibold bg-slate-100 text-slate-800 rounded px-2 py-0.5">
          {row.code}
        </span>
      )
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
            icon={Edit2}
            onClick={() => {
              setEditingModule(row);
              setIsModuleModalOpen(true);
            }}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={row.status === 'active' ? 'text-amber-600' : 'text-emerald-600'}
            onClick={() => {
              setConfirmTarget(row);
              setConfirmType('module');
            }}
          >
            {row.status === 'active' ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      )
    }
  ];

  const submoduleColumns = [
    {
      key: 'name',
      label: 'Submodule Name',
      render: (row) => (
        <div>
          <span className="font-semibold text-sm text-slate-900 block">{row.name}</span>
          {row.description && <p className="text-xs text-slate-500 line-clamp-1">{row.description}</p>}
        </div>
      )
    },
    {
      key: 'code',
      label: 'Submodule Code',
      render: (row) => (
        <span className="font-mono text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200 rounded px-2 py-0.5">
          {row.code}
        </span>
      )
    },
    {
      key: 'parent',
      label: 'Parent Module',
      render: (row) => {
        const parent = modules.find((m) => m.id === row.moduleId);
        return (
          <span className="text-xs text-slate-700 font-medium">
            {parent ? parent.name : row.moduleId}
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
            icon={Edit2}
            onClick={() => {
              setEditingSubmodule(row);
              setIsSubmoduleModalOpen(true);
            }}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={row.status === 'active' ? 'text-amber-600' : 'text-emerald-600'}
            onClick={() => {
              setConfirmTarget(row);
              setConfirmType('submodule');
            }}
          >
            {row.status === 'active' ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      )
    }
  ];

  const tabs = [
    { id: 'modules', label: `Modules (${modules.length})` },
    { id: 'submodules', label: `Submodules (${submodules.length})` },
    { id: 'diagnostics', label: 'Service Diagnostics' }
  ];

  return (
    <PageTransition className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Platform Configuration & Settings
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage canonical software catalog modules, submodules, and inspect microservice infrastructure runtime telemetry.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={loadData}
            loading={loading}
          >
            Refresh
          </Button>
          {activeTab === 'modules' && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => {
                setEditingModule(null);
                setIsModuleModalOpen(true);
              }}
            >
              Add Module
            </Button>
          )}
          {activeTab === 'submodules' && (
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => {
                setEditingSubmodule(null);
                setIsSubmoduleModalOpen(true);
              }}
            >
              Add Submodule
            </Button>
          )}
        </div>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab 1: Modules Catalog */}
      {activeTab === 'modules' && (
        <Card noPadding>
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search modules by name, code or description..."
                className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:border-brand-600 focus:outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <DataTable
            columns={moduleColumns}
            rows={filteredModules}
            loading={loading}
            emptyTitle="No Modules in Catalog"
            emptyDescription="Register the first software module to begin building platform tiers."
          />
        </Card>
      )}

      {/* Tab 2: Submodules Catalog */}
      {activeTab === 'submodules' && (
        <Card noPadding>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-b border-slate-100">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search submodules by name or code..."
                className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:border-brand-600 focus:outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Filter className="h-3.5 w-3.5" />
              <span>Parent Module:</span>
              <select
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:border-brand-600 focus:outline-none"
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
              >
                <option value="ALL">All Parent Modules</option>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DataTable
            columns={submoduleColumns}
            rows={filteredSubmodules}
            loading={loading}
            emptyTitle="No Submodules in Catalog"
            emptyDescription="Submodules allow granular feature gating under parent modules."
          />
        </Card>
      )}

      {/* Tab 3: Diagnostics & Runtime Specs */}
      {activeTab === 'diagnostics' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card
            title="Service Health & Telemetry"
            subtitle="Direct live probe of backend microservice endpoints"
          >
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                      <Activity className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">GET http://localhost:4002/health</h4>
                      <p className="text-xs text-slate-500">Direct HTTP health check</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {healthStatus?.success ? '200 OK' : 'Checking'}
                  </span>
                </div>

                <div className="mt-3 rounded-lg bg-white border border-slate-200 p-3 font-mono text-xs text-slate-700">
                  <pre>{JSON.stringify(healthStatus || { checking: true }, null, 2)}</pre>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                      <Server className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">API Gateway Routing</h4>
                      <p className="text-xs text-slate-500">Port 4000 &rarr; Port 4002</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs font-semibold text-blue-700">
                    /api/v1/platform
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                  The API Gateway strips client untrusted headers, verifies JWT authenticity, sets <code className="font-mono">x-user-role=super_admin</code>, attaches <code className="font-mono">x-internal-token</code>, and forwards requests to Platform Service.
                </p>
              </div>
            </div>
          </Card>

          <Card
            title="Database Schema & Persistence"
            subtitle="PostgreSQL table specifications on Neon cluster"
          >
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-white p-3">
                <span className="font-medium text-slate-700">Database Engine</span>
                <span className="font-mono text-slate-900 font-semibold">PostgreSQL (Neon Serverless)</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-white p-3">
                <span className="font-medium text-slate-700">ORM Dialect</span>
                <span className="font-mono text-slate-900 font-semibold">Sequelize v6</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-white p-3">
                <span className="font-medium text-slate-700">Primary Schema</span>
                <span className="font-mono text-slate-900 font-semibold">public / platform</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-white p-3">
                <span className="font-medium text-slate-700">Key Tables</span>
                <span className="font-mono text-slate-900">modules, submodules, plans, plan_modules, plan_submodules, subscriptions</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-white p-3">
                <span className="font-medium text-slate-700">Default Port</span>
                <span className="font-mono text-slate-900 font-semibold">4002</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Module Modal */}
      <ModuleFormModal
        isOpen={isModuleModalOpen}
        onClose={() => {
          setIsModuleModalOpen(false);
          setEditingModule(null);
        }}
        onSubmit={handleSaveModule}
        moduleItem={editingModule}
        loading={actionLoading}
      />

      {/* Submodule Modal */}
      <SubmoduleFormModal
        isOpen={isSubmoduleModalOpen}
        onClose={() => {
          setIsSubmoduleModalOpen(false);
          setEditingSubmodule(null);
        }}
        onSubmit={handleSaveSubmodule}
        submoduleItem={editingSubmodule}
        modules={modules}
        loading={actionLoading}
      />

      {/* Status Toggle Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(confirmTarget)}
        onClose={() => setConfirmTarget(null)}
        onConfirm={handleToggleModuleStatus}
        loading={actionLoading}
        title={confirmTarget?.status === 'active' ? `Deactivate ${confirmType}` : `Activate ${confirmType}`}
        description={`Are you sure you want to change status of '${confirmTarget?.name}' to ${confirmTarget?.status === 'active' ? 'inactive' : 'active'}? This affects live entitlement checks.`}
        confirmText={confirmTarget?.status === 'active' ? 'Deactivate' : 'Activate'}
        variant={confirmTarget?.status === 'active' ? 'danger' : 'primary'}
      />
    </PageTransition>
  );
}

