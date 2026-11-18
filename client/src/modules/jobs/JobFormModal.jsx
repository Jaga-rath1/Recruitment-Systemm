import React, { useEffect, useState } from 'react';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import { InputField, SelectField, TextAreaField } from '../../components/common/FormField';
import { jobApi } from '../../api';
import { useToast } from '../../context/ToastContext';

export default function JobFormModal({ isOpen, onClose, job, onSaved }) {
  const { addToast } = useToast();
  const isHrms = job?.sourceType === 'HRMS';
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    department: '',
    skills: '',
    experienceMinYears: '2',
    experienceMaxYears: '5',
    salaryMin: '90000',
    salaryMax: '130000',
    salaryDisplay: '',
    location: '',
    employmentType: 'FULL_TIME',
    headcount: '1',
    priority: 'NORMAL',
    remotePolicy: 'Hybrid',
    publishImmediately: false
  });

  useEffect(() => {
    if (job) {
      setForm({
        title: job.title || '',
        description: job.description || '',
        department: job.department || '',
        skills: Array.isArray(job.skills) ? job.skills.join(', ') : '',
        experienceMinYears: String(job.experienceMinYears ?? 0),
        experienceMaxYears: job.experienceMaxYears ? String(job.experienceMaxYears) : '',
        salaryMin: job.salaryMin ? String(job.salaryMin) : '',
        salaryMax: job.salaryMax ? String(job.salaryMax) : '',
        salaryDisplay: job.salaryDisplay || '',
        location: job.location || '',
        employmentType: job.employmentType || 'FULL_TIME',
        headcount: String(job.headcount || 1),
        priority: job.recruitmentConfig?.priority || 'NORMAL',
        remotePolicy: job.recruitmentConfig?.remotePolicy || 'Hybrid',
        publishImmediately: false
      });
    } else {
      setForm({
        title: '',
        description: '',
        department: 'Engineering',
        skills: '',
        experienceMinYears: '2',
        experienceMaxYears: '5',
        salaryMin: '90000',
        salaryMax: '130000',
        salaryDisplay: '',
        location: 'Remote',
        employmentType: 'FULL_TIME',
        headcount: '1',
        priority: 'NORMAL',
        remotePolicy: 'Remote',
        publishImmediately: true
      });
    }
  }, [job, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const skillsArray = form.skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (job) {
        const payload = isHrms
          ? {
              location: form.location,
              salaryDisplay: form.salaryDisplay,
              recruitmentConfig: { priority: form.priority, remotePolicy: form.remotePolicy }
            }
          : {
              title: form.title,
              description: form.description,
              department: form.department,
              skills: skillsArray,
              experienceMinYears: Number(form.experienceMinYears || 0),
              experienceMaxYears: form.experienceMaxYears ? Number(form.experienceMaxYears) : null,
              salaryMin: form.salaryMin ? Number(form.salaryMin) : null,
              salaryMax: form.salaryMax ? Number(form.salaryMax) : null,
              location: form.location,
              employmentType: form.employmentType,
              headcount: Number(form.headcount || 1),
              recruitmentConfig: { priority: form.priority, remotePolicy: form.remotePolicy }
            };
        await jobApi.updateJob(job.id, payload);
        addToast({ title: 'Job Saved', message: 'Requisition updated.', variant: 'success' });
      } else {
        await jobApi.createManual({
          title: form.title,
          description: form.description,
          department: form.department,
          skills: skillsArray,
          experienceMinYears: Number(form.experienceMinYears || 0),
          experienceMaxYears: form.experienceMaxYears ? Number(form.experienceMaxYears) : null,
          salaryMin: form.salaryMin ? Number(form.salaryMin) : null,
          salaryMax: form.salaryMax ? Number(form.salaryMax) : null,
          location: form.location,
          employmentType: form.employmentType,
          headcount: Number(form.headcount || 1),
          recruitmentConfig: { priority: form.priority, remotePolicy: form.remotePolicy },
          publishImmediately: form.publishImmediately
        });
        addToast({ title: 'Manual Job Created', message: `${form.title} saved.`, variant: 'success' });
      }
      onSaved();
    } catch (err) {
      addToast({ title: 'Save Failed', message: err.message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={job ? (isHrms ? `Configure HRMS Job (${job.hrmsJobId})` : 'Edit Manual Job') : 'Create Manual Job'}
      subtitle={isHrms ? 'Master HRMS fields are preserved read-only; configure recruitment metadata below.' : undefined}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <InputField
          label="Job Title"
          required
          disabled={isHrms}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField
            label="Department"
            required
            disabled={isHrms}
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
          />
          <InputField
            label="Location"
            required
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </div>

        {!isHrms && (
          <>
            <TextAreaField
              label="Description"
              required
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <InputField
              label="Skills (comma-separated)"
              value={form.skills}
              onChange={(e) => setForm({ ...form, skills: e.target.value })}
              placeholder="React, Node.js, PostgreSQL"
            />
            <div className="grid gap-4 sm:grid-cols-4">
              <InputField
                label="Min Exp (Yrs)"
                type="number"
                value={form.experienceMinYears}
                onChange={(e) => setForm({ ...form, experienceMinYears: e.target.value })}
              />
              <InputField
                label="Max Exp (Yrs)"
                type="number"
                value={form.experienceMaxYears}
                onChange={(e) => setForm({ ...form, experienceMaxYears: e.target.value })}
              />
              <InputField
                label="Min Salary"
                type="number"
                value={form.salaryMin}
                onChange={(e) => setForm({ ...form, salaryMin: e.target.value })}
              />
              <InputField
                label="Max Salary"
                type="number"
                value={form.salaryMax}
                onChange={(e) => setForm({ ...form, salaryMax: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Employment Type"
                value={form.employmentType}
                onChange={(e) => setForm({ ...form, employmentType: e.target.value })}
                options={[
                  { value: 'FULL_TIME', label: 'Full Time' },
                  { value: 'PART_TIME', label: 'Part Time' },
                  { value: 'CONTRACT', label: 'Contract' },
                  { value: 'INTERNSHIP', label: 'Internship' }
                ]}
              />
              <InputField
                label="Headcount"
                type="number"
                min="1"
                value={form.headcount}
                onChange={(e) => setForm({ ...form, headcount: e.target.value })}
              />
            </div>
          </>
        )}

        {isHrms && (
          <InputField
            label="Public Salary Display"
            value={form.salaryDisplay}
            onChange={(e) => setForm({ ...form, salaryDisplay: e.target.value })}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Recruitment Priority"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}
            options={[
              { value: 'URGENT', label: 'Urgent' },
              { value: 'HIGH', label: 'High' },
              { value: 'NORMAL', label: 'Normal' }
            ]}
          />
          <InputField
            label="Remote Policy"
            value={form.remotePolicy}
            onChange={(e) => setForm({ ...form, remotePolicy: e.target.value })}
          />
        </div>

        {!job && (
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.publishImmediately}
              onChange={(e) => setForm({ ...form, publishImmediately: e.target.checked })}
            />
            Publish immediately to Public Careers page
          </label>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save Requisition</Button>
        </div>
      </form>
    </Modal>
  );
}

