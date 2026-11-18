import React, { useEffect, useState } from 'react';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import { InputField, SelectField } from '../../components/common/FormField';
import { applicationApi, interviewApi, organisationApi } from '../../api';
import { useToast } from '../../context/ToastContext';

export default function ScheduleInterviewModal({ isOpen, onClose, onScheduled }) {
  const { addToast } = useToast();
  const [applications, setApplications] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    applicationId: '',
    roundType: 'TECHNICAL',
    scheduledAt: '',
    durationMinutes: '60',
    meetingMode: 'VIDEO',
    meetingLinkOrLocation: 'https://meet.nexnuv.io/interview-room',
    interviewerEmployeeId: ''
  });

  useEffect(() => {
    if (!isOpen) return;
    Promise.all([
      applicationApi.list({ limit: 50 }).catch(() => ({ data: [] })),
      organisationApi.listEmployees().catch(() => ({ data: [] }))
    ]).then(([aRes, eRes]) => {
      const apps = aRes.data || [];
      setApplications(apps);
      setEmployees(eRes.data || []);
      if (apps[0] && !form.applicationId) {
        setForm((f) => ({ ...f, applicationId: apps[0].id }));
      }
    });
  }, [isOpen]);

  const targetRole = form.roundType === 'TECHNICAL' ? 'TECHNICAL_INTERVIEWER' : 'SENIOR_INTERVIEWER';
  const eligibleInterviewers = employees.filter(
    (e) => e.recruitmentAccess?.isActive && e.recruitmentAccess?.roleCode === targetRole
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await interviewApi.schedule({
        ...form,
        durationMinutes: Number(form.durationMinutes || 60),
        scheduledAt: new Date(form.scheduledAt).toISOString()
      });
      addToast({ title: 'Interview Scheduled', message: 'Candidate and interviewer notified.', variant: 'success' });
      onScheduled();
    } catch (err) {
      addToast({ title: 'Scheduling Error', message: err.message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Schedule Interview Round">
      <form onSubmit={handleSubmit} className="space-y-4">
        <SelectField
          label="Candidate Application"
          required
          value={form.applicationId}
          onChange={(e) => setForm({ ...form, applicationId: e.target.value })}
          options={[
            { value: '', label: 'Select application...' },
            ...applications.map((a) => ({
              value: a.id,
              label: `${a.candidate?.fullName} — ${a.job?.title} (${a.currentStage})`
            }))
          ]}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Round Type"
            value={form.roundType}
            onChange={(e) => setForm({ ...form, roundType: e.target.value, interviewerEmployeeId: '' })}
            options={[
              { value: 'TECHNICAL', label: 'Technical Interview' },
              { value: 'MANAGERIAL', label: 'Managerial Interview (Post-Technical Selection)' }
            ]}
          />
          <SelectField
            label={form.roundType === 'TECHNICAL' ? 'Technical Interviewer' : 'Senior Interviewer'}
            required
            value={form.interviewerEmployeeId}
            onChange={(e) => setForm({ ...form, interviewerEmployeeId: e.target.value })}
            options={[
              { value: '', label: eligibleInterviewers.length ? 'Select interviewer...' : `No active ${targetRole} available` },
              ...eligibleInterviewers.map((emp) => ({ value: emp.employeeId, label: `${emp.fullName} (${emp.email})` }))
            ]}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <InputField
            label="Date & Time"
            type="datetime-local"
            required
            value={form.scheduledAt}
            onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
          />
          <InputField
            label="Duration (Minutes)"
            type="number"
            min="15"
            value={form.durationMinutes}
            onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
          />
          <SelectField
            label="Meeting Mode"
            value={form.meetingMode}
            onChange={(e) => setForm({ ...form, meetingMode: e.target.value })}
            options={[
              { value: 'VIDEO', label: 'Video Call' },
              { value: 'IN_PERSON', label: 'In Person' },
              { value: 'PHONE', label: 'Phone' }
            ]}
          />
        </div>

        <InputField
          label="Meeting Link or Location"
          required
          value={form.meetingLinkOrLocation}
          onChange={(e) => setForm({ ...form, meetingLinkOrLocation: e.target.value })}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Schedule & Notify</Button>
        </div>
      </form>
    </Modal>
  );
}

