import React, { useEffect, useState } from 'react';
import { Plus, Send, Download } from 'lucide-react';
import { offerApi, applicationApi } from '../../api';
import { downloadAuthenticatedFile } from '../../api/httpClient';
import DataTable from '../../components/common/DataTable';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import FileUpload from '../../components/common/FileUpload';
import { InputField, SelectField, TextAreaField } from '../../components/common/FormField';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { PageTransition } from '../../components/common/MotionPrimitives';
import { formatINR } from '../../utils/currency';

export default function OffersPage() {
  const { addToast } = useToast();
  const { hasPermission } = useAuth();

  const [offers, setOffers] = useState([]);
  const [eligibleApps, setEligibleApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [letterFile, setLetterFile] = useState(null);

  const [form, setForm] = useState({
    applicationId: '',
    offeredSalary: '',
    salaryCurrency: 'INR',
    designation: '',
    department: '',
    joiningDate: '',
    offerValidUntil: '',
    termsSummary: '',
    sendImmediately: true
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [offerRes, appRes] = await Promise.all([
        offerApi.list({ limit: 30 }),
        applicationApi.list({ currentStage: 'FINAL_SELECTION', limit: 30 }).catch(() => ({ data: [] }))
      ]);
      setOffers(offerRes.data || []);
      setEligibleApps(appRes.data || []);
    } catch (err) {
      addToast({ title: 'Failed to load offers', message: err.message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateOffer = async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      fd.append('applicationId', form.applicationId);
      fd.append('offeredSalary', form.offeredSalary);
      fd.append('salaryCurrency', form.salaryCurrency);
      fd.append('designation', form.designation);
      fd.append('department', form.department);
      fd.append('joiningDate', new Date(form.joiningDate).toISOString());
      fd.append('offerValidUntil', new Date(form.offerValidUntil).toISOString());
      if (form.termsSummary) fd.append('termsSummary', form.termsSummary);
      fd.append('sendImmediately', String(form.sendImmediately));
      if (letterFile) fd.append('offerLetter', letterFile);

      await offerApi.create(fd);
      addToast({ title: 'Offer Processed', message: 'Offer saved and processed.', variant: 'success' });
      setCreateOpen(false);
      setLetterFile(null);
      loadData();
    } catch (err) {
      addToast({ title: 'Offer Creation Failed', message: err.message, variant: 'error' });
    }
  };

  const handleSend = async (offerId) => {
    try {
      await offerApi.send(offerId);
      addToast({ title: 'Offer Dispatched', message: 'Candidate notified via email.', variant: 'success' });
      loadData();
    } catch (err) {
      addToast({ title: 'Dispatch Failed', message: err.message, variant: 'error' });
    }
  };

  const columns = [
    {
      key: 'candidate',
      label: 'Candidate & Position',
      render: (row) => (
        <div>
          <p className="font-semibold text-slate-900">{row.application?.candidate?.fullName}</p>
          <p className="text-xs text-slate-500">{row.designation} · {row.department}</p>
        </div>
      )
    },
    {
      key: 'compensation',
      label: 'Offered Salary',
      render: (row) => {
        const val = Number(row.offeredSalary) || 0;
        return (
          <span className="text-xs font-semibold text-slate-900">
            {row.salaryCurrency === 'INR' || !row.salaryCurrency
              ? formatINR(val, { maximumFractionDigits: 0 })
              : `${row.salaryCurrency} ${val.toLocaleString()}`}
          </span>
        );
      }
    },
    {
      key: 'validity',
      label: 'Joining & Validity',
      render: (row) => (
        <div className="text-xs text-slate-600">
          <p>Join: {new Date(row.joiningDate).toLocaleDateString()}</p>
          <p>Valid: {new Date(row.offerValidUntil).toLocaleDateString()}</p>
        </div>
      )
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <Badge status={row.status} />
    },
    {
      key: 'actions',
      label: 'Documents & Dispatch',
      render: (row) => (
        <div className="flex items-center gap-2">
          {(row.documents || []).map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() =>
                downloadAuthenticatedFile(doc.downloadUrl, doc.fileName || 'offer-letter.pdf').catch((err) =>
                  addToast({ title: 'Download Failed', message: err.message, variant: 'error' })
                )
              }
              className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-xs text-brand-700 hover:bg-brand-50"
            >
              <Download className="h-3.5 w-3.5" />
              Letter
            </button>
          ))}
          {hasPermission('offer:manage') && row.status === 'DRAFT' && (
            <Button size="sm" icon={Send} onClick={() => handleSend(row.id)}>
              Send Offer
            </Button>
          )}
        </div>
      )
    }
  ];

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Offer Management</h1>
          <p className="mt-1 text-sm text-slate-600">
            Generate compensation offers, attach official offer letters, and track candidate responses.
          </p>
        </div>
        {hasPermission('offer:manage') && (
          <Button icon={Plus} onClick={() => setCreateOpen(true)}>
            Prepare Offer
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={offers}
        loading={loading}
        emptyTitle="No offers created yet"
        emptyDescription="Candidates who pass Stage 5 Final Selection are eligible for offer processing."
      />

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Stage 6: Offer Processing">
        <form onSubmit={handleCreateOffer} className="space-y-4">
          <SelectField
            label="Selected Candidate (Stage: FINAL_SELECTION)"
            required
            value={form.applicationId}
            onChange={(e) => setForm({ ...form, applicationId: e.target.value })}
            options={[
              { value: '', label: eligibleApps.length ? 'Select candidate...' : 'No candidates in FINAL_SELECTION' },
              ...eligibleApps.map((a) => ({
                value: a.id,
                label: `${a.candidate?.fullName} — ${a.job?.title}`
              }))
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <InputField
              label="Offered Designation"
              required
              value={form.designation}
              onChange={(e) => setForm({ ...form, designation: e.target.value })}
            />
            <InputField
              label="Department"
              required
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <InputField
              label="Offered Annual Salary"
              type="number"
              required
              value={form.offeredSalary}
              onChange={(e) => setForm({ ...form, offeredSalary: e.target.value })}
            />
            <InputField
              label="Currency"
              required
              value={form.salaryCurrency}
              onChange={(e) => setForm({ ...form, salaryCurrency: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <InputField
              label="Proposed Joining Date"
              type="date"
              required
              value={form.joiningDate}
              onChange={(e) => setForm({ ...form, joiningDate: e.target.value })}
            />
            <InputField
              label="Offer Valid Until"
              type="date"
              required
              value={form.offerValidUntil}
              onChange={(e) => setForm({ ...form, offerValidUntil: e.target.value })}
            />
          </div>
          <FileUpload label="Offer Letter (PDF/DOCX)" file={letterFile} onFileSelect={setLetterFile} />
          <TextAreaField
            label="Terms Summary"
            rows={2}
            value={form.termsSummary}
            onChange={(e) => setForm({ ...form, termsSummary: e.target.value })}
          />
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.sendImmediately}
              onChange={(e) => setForm({ ...form, sendImmediately: e.target.checked })}
            />
            Send offer letter immediately to candidate
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit">Save Offer</Button>
          </div>
        </form>
      </Modal>
    </PageTransition>
  );
}

