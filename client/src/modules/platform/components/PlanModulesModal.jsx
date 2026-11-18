import React, { useEffect, useState, useCallback } from 'react';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';
import Badge from '../../../components/common/Badge';
import { platformApi } from '../../../api';
import { useToast } from '../../../context/ToastContext';
import { Layers, Plus, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import LoadingSkeleton from '../../../components/common/LoadingSkeleton';

export default function PlanModulesModal({
  isOpen,
  onClose,
  plan = null,
  onUpdated = null
}) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Assigned items
  const [assignedModules, setAssignedModules] = useState([]);
  const [assignedSubmodules, setAssignedSubmodules] = useState([]);

  // Catalog items
  const [catalogModules, setCatalogModules] = useState([]);
  const [catalogSubmodules, setCatalogSubmodules] = useState([]);

  // Selections to add
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [selectedSubmoduleId, setSelectedSubmoduleId] = useState('');

  const loadData = useCallback(async () => {
    if (!plan?.id) return;
    setLoading(true);
    try {
      const [modRes, subRes, allModsRes, allSubsRes] = await Promise.all([
        platformApi.listPlanModules(plan.id),
        platformApi.listPlanSubmodules(plan.id),
        platformApi.listModules(),
        platformApi.listSubmodules()
      ]);

      const planMods = modRes.data || [];
      const planSubs = subRes.data || [];
      setAssignedModules(planMods);
      setAssignedSubmodules(planSubs);

      const allMods = allModsRes.data || [];
      const allSubs = allSubsRes.data || [];
      setCatalogModules(allMods);
      setCatalogSubmodules(allSubs);

      // Default selection to first unassigned
      const assignedModIds = new Set(planMods.map((m) => m.id || m.moduleId));
      const unassignedMod = allMods.find((m) => !assignedModIds.has(m.id));
      setSelectedModuleId(unassignedMod ? unassignedMod.id : '');

      const assignedSubIds = new Set(planSubs.map((s) => s.id || s.submoduleId));
      const unassignedSub = allSubs.find((s) => !assignedSubIds.has(s.id));
      setSelectedSubmoduleId(unassignedSub ? unassignedSub.id : '');
    } catch (err) {
      addToast({ title: 'Failed to load plan modules', message: err.message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [plan?.id, addToast]);

  useEffect(() => {
    if (isOpen && plan?.id) {
      loadData();
    }
  }, [isOpen, plan?.id, loadData]);

  const handleAddModule = async () => {
    if (!selectedModuleId) return;
    setActionLoading(true);
    try {
      await platformApi.addPlanModule(plan.id, selectedModuleId);
      addToast({ title: 'Module Attached', message: 'Module successfully added to plan.', variant: 'success' });
      await loadData();
      onUpdated?.();
    } catch (err) {
      addToast({ title: 'Failed to add module', message: err.message, variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveModule = async (moduleId) => {
    setActionLoading(true);
    try {
      await platformApi.removePlanModule(plan.id, moduleId);
      addToast({ title: 'Module Detached', message: 'Module removed from plan.', variant: 'info' });
      await loadData();
      onUpdated?.();
    } catch (err) {
      addToast({ title: 'Failed to remove module', message: err.message, variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddSubmodule = async () => {
    if (!selectedSubmoduleId) return;
    setActionLoading(true);
    try {
      await platformApi.addPlanSubmodule(plan.id, selectedSubmoduleId);
      addToast({ title: 'Submodule Attached', message: 'Submodule successfully added to plan.', variant: 'success' });
      await loadData();
      onUpdated?.();
    } catch (err) {
      addToast({ title: 'Failed to add submodule', message: err.message, variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveSubmodule = async (submoduleId) => {
    setActionLoading(true);
    try {
      await platformApi.removePlanSubmodule(plan.id, submoduleId);
      addToast({ title: 'Submodule Detached', message: 'Submodule removed from plan.', variant: 'info' });
      await loadData();
      onUpdated?.();
    } catch (err) {
      addToast({ title: 'Failed to remove submodule', message: err.message, variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const assignedModIds = new Set(assignedModules.map((m) => m.id || m.moduleId));
  const availableModules = catalogModules.filter((m) => !assignedModIds.has(m.id));

  const assignedSubIds = new Set(assignedSubmodules.map((s) => s.id || s.submoduleId));
  const availableSubmodules = catalogSubmodules.filter((s) => !assignedSubIds.has(s.id));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Configure Entitled Features: ${plan?.name || 'Plan'}`}
      subtitle="Attach or detach catalog modules and submodules authorized under this subscription tier"
      maxWidth="max-w-3xl"
      footer={
        <div className="flex items-center justify-end">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="py-4">
          <LoadingSkeleton rows={4} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Section 1: Attached Modules */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">1. Attached Modules</h4>
                <p className="text-xs text-slate-500">Core software suites enabled for this tier</p>
              </div>

              {availableModules.length > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:border-brand-600 focus:outline-none"
                    value={selectedModuleId}
                    onChange={(e) => setSelectedModuleId(e.target.value)}
                    disabled={actionLoading}
                  >
                    {availableModules.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.code})
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="primary"
                    icon={Plus}
                    onClick={handleAddModule}
                    loading={actionLoading}
                  >
                    Attach
                  </Button>
                </div>
              )}
            </div>

            {assignedModules.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500">
                No modules attached to this plan yet. Use the selector above to attach a module.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {assignedModules.map((item) => {
                  const mod = item.module || item;
                  return (
                    <div
                      key={mod.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-xs text-slate-900">{mod.name}</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600">
                            {mod.code}
                          </span>
                        </div>
                        {mod.description && (
                          <p className="truncate text-[11px] text-slate-500 mt-0.5">{mod.description}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveModule(mod.id)}
                        disabled={actionLoading}
                        title="Remove module"
                        className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 2: Attached Submodules */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">2. Attached Submodules</h4>
                <p className="text-xs text-slate-500">Granular feature capabilities enforced by service RBAC</p>
              </div>

              {availableSubmodules.length > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:border-brand-600 focus:outline-none"
                    value={selectedSubmoduleId}
                    onChange={(e) => setSelectedSubmoduleId(e.target.value)}
                    disabled={actionLoading}
                  >
                    {availableSubmodules.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="primary"
                    icon={Plus}
                    onClick={handleAddSubmodule}
                    loading={actionLoading}
                  >
                    Attach
                  </Button>
                </div>
              )}
            </div>

            {assignedSubmodules.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500">
                No submodules attached to this plan yet. Use the selector above to attach submodules.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {assignedSubmodules.map((item) => {
                  const sub = item.submodule || item;
                  return (
                    <div
                      key={sub.id}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 shadow-xs"
                    >
                      <span className="text-xs font-medium text-slate-800">{sub.name}</span>
                      <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-mono text-brand-700">
                        {sub.code}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSubmodule(sub.id)}
                        disabled={actionLoading}
                        title="Remove submodule"
                        className="text-slate-400 hover:text-rose-600 transition ml-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

