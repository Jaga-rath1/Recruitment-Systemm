import React, { useState } from 'react';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import { InputField, SelectField, TextAreaField } from '../../components/common/FormField';
import { interviewApi } from '../../api';
import { useToast } from '../../context/ToastContext';

export default function FeedbackModal({ interview, onClose, onSubmitted }) {
  const { addToast } = useToast();
  const isManagerial = interview?.roundType === 'MANAGERIAL';
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    overallRating: '8',
    technicalSkillsRating: '8',
    communicationRating: '8',
    behaviouralRating: '8',
    problemSolvingRating: '8',
    leadershipRating: '8',
    strengths: '',
    weaknesses: '',
    detailedFeedback: '',
    recommendation: 'SELECTED'
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        overallRating: Number(form.overallRating),
        strengths: form.strengths,
        weaknesses: form.weaknesses,
        detailedFeedback: form.detailedFeedback,
        recommendation: form.recommendation,
        ...(isManagerial
          ? {
              communicationRating: Number(form.communicationRating),
              behaviouralRating: Number(form.behaviouralRating),
              problemSolvingRating: Number(form.problemSolvingRating),
              leadershipRating: Number(form.leadershipRating)
            }
          : {
              technicalSkillsRating: Number(form.technicalSkillsRating)
            })
      };

      await interviewApi.submitFeedback(interview.id, payload);
      addToast({ title: 'Evaluation Submitted', message: 'Confidential feedback recorded.', variant: 'success' });
      onSubmitted();
    } catch (err) {
      addToast({ title: 'Submission Failed', message: err.message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={Boolean(interview)}
      onClose={onClose}
      title={`${interview?.roundType || ''} Interview Evaluation`}
      subtitle={interview ? `${interview.application?.candidate?.fullName} — ${interview.application?.job?.title}` : undefined}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField
            label="Overall Rating (1-10)"
            type="number"
            min="1"
            max="10"
            required
            value={form.overallRating}
            onChange={(e) => setForm({ ...form, overallRating: e.target.value })}
          />
          {!isManagerial && (
            <InputField
              label="Technical Skills Rating (1-10)"
              type="number"
              min="1"
              max="10"
              required
              value={form.technicalSkillsRating}
              onChange={(e) => setForm({ ...form, technicalSkillsRating: e.target.value })}
            />
          )}
        </div>

        {isManagerial && (
          <div className="grid gap-3 sm:grid-cols-2">
            <InputField
              label="Communication (1-10)"
              type="number"
              min="1"
              max="10"
              required
              value={form.communicationRating}
              onChange={(e) => setForm({ ...form, communicationRating: e.target.value })}
            />
            <InputField
              label="Behavioural Assessment (1-10)"
              type="number"
              min="1"
              max="10"
              required
              value={form.behaviouralRating}
              onChange={(e) => setForm({ ...form, behaviouralRating: e.target.value })}
            />
            <InputField
              label="Problem Solving (1-10)"
              type="number"
              min="1"
              max="10"
              required
              value={form.problemSolvingRating}
              onChange={(e) => setForm({ ...form, problemSolvingRating: e.target.value })}
            />
            <InputField
              label="Leadership Potential (1-10)"
              type="number"
              min="1"
              max="10"
              required
              value={form.leadershipRating}
              onChange={(e) => setForm({ ...form, leadershipRating: e.target.value })}
            />
          </div>
        )}

        <TextAreaField
          label="Strengths"
          required
          rows={2}
          value={form.strengths}
          onChange={(e) => setForm({ ...form, strengths: e.target.value })}
        />
        <TextAreaField
          label="Weaknesses / Areas to Probe"
          required
          rows={2}
          value={form.weaknesses}
          onChange={(e) => setForm({ ...form, weaknesses: e.target.value })}
        />
        <TextAreaField
          label="Detailed Confidential Evaluation"
          required
          rows={3}
          value={form.detailedFeedback}
          onChange={(e) => setForm({ ...form, detailedFeedback: e.target.value })}
        />

        <SelectField
          label="Recommendation"
          value={form.recommendation}
          onChange={(e) => setForm({ ...form, recommendation: e.target.value })}
          options={[
            { value: 'SELECTED', label: 'SELECTED' },
            { value: 'ON_HOLD', label: 'ON_HOLD' },
            { value: 'REJECTED', label: 'REJECTED' }
          ]}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Submit Confidential Feedback</Button>
        </div>
      </form>
    </Modal>
  );
}

