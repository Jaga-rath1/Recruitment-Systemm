import React, { useEffect, useState } from 'react';
import { UserPlus, CheckCircle2, Download } from 'lucide-react';
import { joiningApi, applicationApi } from '../../api';
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

export default function JoiningPage() {
  const { addToast } = useToast();
  const { hasPermission } = useAuth();

  const [records, setRecords] = useState([]);
  const [acceptedApps, setAcceptedApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initOpen, setInitOpen] = useState(false);
  const [joiningLetter, setJoiningLetter] = useState(null);

  const [form, setForm] = useState({
    applicationId: '',
    expectedJoiningDate: '',
    joiningLocation: '',
    reportingManager: '',
    onboardingNotes: ''
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [joinRes, appRes] = await Promise.all([
        joiningApi.list({ limit: 30 }),
        applicationApi.list({ currentStage: 'OFFER_ACCEPTED', limit: 30 }).catch(() => ({ data: [] }))
      ]);
      setRecords(joinRes.data || []);
      setAcceptedApps(appRes.data || []);
    } catch (err) {
      addToast({ title: 'Failed to load joining records', message: err.message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleInitiate = async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      fd.append('applicationId', form.applicationId);
      if (form.expectedJoiningDate) fd.append('expectedJoiningDate', new Date(form.expectedJoiningDate).toISOString());
      fd.append('joiningLocation', form.joiningLocation);
      if (form.reportingManager) fd.append('reportingManager', form.reportingManager);
      if (form.onboardingNotes) fd.append('onboardingNotes', form.onboardingNotes);
      if (joiningLetter) fd.append('joiningLetter', joiningLetter);

      await joiningApi.initiate(fd);
      addToast({ title: 'Joining Initiated', message: 'Onboarding workflow started.', variant: 'success' });
      setInitOpen(false);
      setJoiningLetter(null);
      loadData();
    } catch (err) {
      addToast({ title: 'Initiation Failed', message: err.message, variant: 'error' });
    }
  };

  const handleMarkHired = async (joiningId) => {
    try {
      await joiningApi.updateStatus(joiningId, { status: 'JOINED' });
      addToast({ title: 'Candidate Hired', message: 'Application marked as HIRED!', variant: 'success' });
      loadData();
    } catch (err) {
      addToast({ title: 'Update Failed', message: err.message, variant: 'error' });
    }
  };

  const columns = [
    {
      key: 'candidate',
      label: 'Candidate & Position',
      render: (row) => (
        <div>
          <p className="font-semibold text-slate-900">{row.application?.candidate?.fullName}</p>
          <p className="text-xs text-slate-500">
            {row.offer?.designation} · {row.application?.applicationReference}
          </p>
        </div>
      )
    },
    {
      key: 'details',
      label: 'Joining Details',
      render: (row) => (
        <div className="text-xs">
          <p className="font-medium text-slate-800">{new Date(row.expectedJoiningDate).toLocaleDateString()}</p>
          <p className="text-slate-500">{row.joiningLocation}</p>
        </div>
      )
    },
    {
      key: 'status',
      label: 'Joining Status',
      render: (row) => <Badge status={row.status} />
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.joiningLetterDownloadUrl && (
            <button
              key={row.id}
              type="button"
              onClick={() =>
                downloadAuthenticatedFile(
                  row.joiningLetterDownloadUrl,
                  row.joiningLetterFileName || 'joining-letter.pdf'
                ).catch((err) =>
                  addToast({ title: 'Download Failed', message: err.message, variant: 'error' })
                )
              }
              className="inline-flex items-center gap-1 rounded border border-slate-200 px-2.5 py-1 text-xs text-brand-700 hover:bg-brand-50"
            >
              <Download className="h-3.5 w-3.5" />
              Joining Letter
            </button>
          )}
          {hasPermission('joining:manage') && row.status !== 'JOINED' && (
            <Button size="sm" icon={CheckCircle2} onClick={() => handleMarkHired(row.id)}>
              Confirm Joined (HIRED)
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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Joining & Onboarding</h1>
          <p className="mt-1 text-sm text-slate-600">
            Initiate joining after offer acceptance, dispatch joining letters, and mark candidates HIRED.
          </p>
        </div>
        {hasPermission('joining:manage') && (
          <Button icon={UserPlus} onClick={() => setInitOpen(true)}>
            Initiate Joining
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={records}
        loading={loading}
        emptyTitle="No joining records yet"
        emptyDescription="Candidates who accept an offer appear ready for joining initiation."
      />

      <Modal isOpen={initOpen} onClose={() => setInitOpen(false)} title="Stage 7: Initiate Candidate Joining">
        <form onSubmit={handleInitiate} className="space-y-4">
          <SelectField
            label="Candidate with Accepted Offer"
            required
            value={form.applicationId}
            onChange={(e) => setForm({ ...form, applicationId: e.target.value })}
            options={[
              { value: '', label: acceptedApps.length ? 'Select candidate...' : 'No candidates in OFFER_ACCEPTED' },
              ...acceptedApps.map((a) => ({
                value: a.id,
                label: `${a.candidate?.fullName} — ${a.job?.title}`
              }))
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <InputField
              label="Expected Joining Date"
              type="date"
              value={form.expectedJoiningDate}
              onChange={(e) => setForm({ ...form, expectedJoiningDate: e.target.value })}
            />
            <InputField
              label="Joining Location"
              required
              value={form.joiningLocation}
              onChange={(e) => setForm({ ...form, joiningLocation: e.target.value })}
            />
          </div>
          <InputField
            label="Reporting Manager"
            value={form.reportingManager}
            onChange={(e) => setForm({ ...form, reportingManager: e.target.value })}
          />
          <FileUpload label="Joining Letter (PDF/DOCX)" file={joiningLetter} onFileSelect={setJoiningLetter} />
          <TextAreaField
            label="Onboarding Instructions"
            rows={2}
            value={form.onboardingNotes}
            onChange={(e) => setForm({ ...form, onboardingNotes: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setInitOpen(false)}>Cancel</Button>
            <Button type="submit">Initiate Joining</Button>
          </div>
        </form>
      </Modal>
    </PageTransition>
  );
}

