import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import Modal from '../../components/common/Modal';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import { SelectField, TextAreaField, InputField } from '../../components/common/FormField';
import { applicationApi, organisationApi } from '../../api';
import { downloadAuthenticatedFile } from '../../api/httpClient';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

export default function ApplicationDetailModal({ applicationId, onClose, onUpdated }) {
  const { addToast } = useToast();
  const { hasPermission } = useAuth();

  const [detail, setDetail] = useState(null);
  const [techInterviewers, setTechInterviewers] = useState([]);
  const [loading, setLoading] = useState(false);

  const [screenDecision, setScreenDecision] = useState('SHORTLIST');
  const [screenNotes, setScreenNotes] = useState('');
  const [techInterviewerId, setTechInterviewerId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');

  const [finalDecision, setFinalDecision] = useState('SELECTED');
  const [finalNotes, setFinalNotes] = useState('');

  const loadDetail = async () => {
    if (!applicationId) {
      setDetail(null);
      return;
    }
    setDetail(null);
    setLoading(true);
    try {
      const [appRes, empRes] = await Promise.all([
        applicationApi.getById(applicationId),
        organisationApi.listEmployees().catch(() => ({ data: [] }))
      ]);
      setDetail(appRes.data);
      const techs = (empRes.data || []).filter(
        (e) => e.recruitmentAccess?.isActive && e.recruitmentAccess?.roleCode === 'TECHNICAL_INTERVIEWER'
      );
      setTechInterviewers(techs);
    } catch (err) {
      addToast({ title: 'Failed to load application', message: err.message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [applicationId]);

  const handleScreen = async () => {
    try {
      await applicationApi.screen(applicationId, {
        decision: screenDecision,
        notes: screenNotes || undefined,
        ...(screenDecision === 'SHORTLIST' && techInterviewerId && scheduledAt
          ? {
              technicalInterviewerEmployeeId: techInterviewerId,
              scheduledAt: new Date(scheduledAt).toISOString()
            }
          : {})
      });
      addToast({ title: 'Screening Recorded', message: `Decision: ${screenDecision}`, variant: 'success' });
      await loadDetail();
      onUpdated?.();
    } catch (err) {
      addToast({ title: 'Screening Error', message: err.message, variant: 'error' });
    }
  };

  const handleFinalDecision = async () => {
    try {
      await applicationApi.finalDecision(applicationId, {
        decision: finalDecision,
        notes: finalNotes || undefined
      });
      addToast({ title: 'Final Decision Saved', message: `Outcome: ${finalDecision}`, variant: 'success' });
      await loadDetail();
      onUpdated?.();
    } catch (err) {
      addToast({ title: 'Final Decision Error', message: err.message, variant: 'error' });
    }
  };

  return (
    <Modal
      isOpen={Boolean(applicationId)}
      onClose={onClose}
      title={detail ? `${detail.candidate?.fullName} — ${detail.applicationReference}` : 'Application Review'}
      subtitle={detail ? `${detail.job?.title} · ${detail.candidate?.email}` : undefined}
      maxWidth="max-w-3xl"
    >
      {loading || !detail ? (
        <LoadingSkeleton rows={5} />
      ) : (
        <div className="space-y-6 text-sm">
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-4">
            <div>
              <span className="text-xs text-slate-500">Current Stage</span>
              <div className="mt-1"><Badge status={detail.currentStage} /></div>
            </div>
            <div>
              <span className="text-xs text-slate-500">Screening</span>
              <div className="mt-1"><Badge status={detail.screeningStatus} /></div>
            </div>
            <div className="ml-auto flex gap-2">
              {(detail.documents || []).map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() =>
                    downloadAuthenticatedFile(doc.downloadUrl, doc.fileName).catch((err) =>
                      addToast({ title: 'Download Failed', message: err.message, variant: 'error' })
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  {doc.fileName}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 rounded-xl border border-slate-200 p-4 text-xs sm:grid-cols-3">
            <p><strong>Experience:</strong> {detail.candidate?.totalExperienceYears} yrs</p>
            <p><strong>Company:</strong> {detail.candidate?.currentCompany || '—'}</p>
            <p><strong>Notice Period:</strong> {detail.candidate?.noticePeriodDays} days</p>
            <p><strong>Current Salary:</strong> {detail.candidate?.currentSalary || '—'}</p>
            <p><strong>Expected Salary:</strong> {detail.candidate?.expectedSalary || '—'}</p>
            <p><strong>Location:</strong> {detail.candidate?.location}</p>
          </div>

          {/* Stage 2: Screening */}
          {hasPermission('application:screen') && ['APPLIED', 'SCREENING', 'ON_HOLD'].includes(detail.currentStage) && (
            <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-brand-700">Stage 2: Recruiter Screening</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label="Screening Decision"
                  value={screenDecision}
                  onChange={(e) => setScreenDecision(e.target.value)}
                  options={[
                    { value: 'SHORTLIST', label: 'Shortlist' },
                    { value: 'HOLD', label: 'Hold' },
                    { value: 'REJECT', label: 'Reject' }
                  ]}
                />
                {screenDecision === 'SHORTLIST' && techInterviewers.length > 0 && (
                  <SelectField
                    label="Assign Technical Interviewer (Optional)"
                    value={techInterviewerId}
                    onChange={(e) => setTechInterviewerId(e.target.value)}
                    options={[
                      { value: '', label: 'Schedule later' },
                      ...techInterviewers.map((t) => ({ value: t.employeeId, label: t.fullName }))
                    ]}
                  />
                )}
              </div>
              {screenDecision === 'SHORTLIST' && techInterviewerId && (
                <InputField
                  label="Technical Interview Date & Time"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              )}
              <TextAreaField
                label="Internal Screening Notes"
                rows={2}
                value={screenNotes}
                onChange={(e) => setScreenNotes(e.target.value)}
              />
              <Button size="sm" onClick={handleScreen}>Save Screening Decision</Button>
            </div>
          )}

          {/* Interview Evaluations Summary */}
          {(detail.interviews || []).length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Interview Results</h4>
              {detail.interviews.map((iv) => (
                <div key={iv.id} className="rounded-xl border border-slate-200 p-4 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{iv.roundType} Round #{iv.roundNumber}</span>
                    <Badge status={iv.status} />
                  </div>
                  {(iv.feedbacks || []).map((fb) => (
                    <div key={fb.id} className="mt-2 rounded-lg bg-slate-50 p-3">
                      <div className="flex items-center justify-between">
                        <span>Rating: <strong>{fb.overallRating}/10</strong></span>
                        <Badge status={fb.recommendation} />
                      </div>
                      <p className="mt-1 text-slate-700"><strong>Strengths:</strong> {fb.strengths}</p>
                      <p className="text-slate-700"><strong>Weaknesses:</strong> {fb.weaknesses}</p>
                      <p className="mt-1 text-slate-600">{fb.detailedFeedback}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Stage 5: Final Selection */}
          {hasPermission('application:final_decision') &&
            ['TECHNICAL_INTERVIEW', 'MANAGERIAL_INTERVIEW', 'ON_HOLD'].includes(detail.currentStage) && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Stage 5: Final Selection</h4>
                <SelectField
                  label="Final Decision"
                  value={finalDecision}
                  onChange={(e) => setFinalDecision(e.target.value)}
                  options={[
                    { value: 'SELECTED', label: 'Selected (Proceed to Offer)' },
                    { value: 'ON_HOLD', label: 'On Hold' },
                    { value: 'REJECTED', label: 'Rejected' }
                  ]}
                />
                <TextAreaField
                  label="Internal Final Decision Remarks"
                  rows={2}
                  value={finalNotes}
                  onChange={(e) => setFinalNotes(e.target.value)}
                />
                <Button size="sm" onClick={handleFinalDecision}>Confirm Final Selection</Button>
              </div>
            )}

          {/* Stage History */}
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Stage Audit Trail</h4>
            <div className="space-y-1.5">
              {(detail.stageHistory || []).map((h) => (
                <div key={h.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs">
                  <div>
                    <span className="font-semibold text-slate-800">{h.action}</span>
                    {h.candidateVisibleNote && <span className="ml-2 text-slate-500">· {h.candidateVisibleNote}</span>}
                  </div>
                  <span className="text-slate-400">{new Date(h.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

