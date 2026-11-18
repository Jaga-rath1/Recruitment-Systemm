import React, { useEffect, useState } from 'react';
import { CalendarPlus, ClipboardCheck, CalendarClock } from 'lucide-react';
import { interviewApi } from '../../api';
import DataTable from '../../components/common/DataTable';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import { InputField, TextAreaField } from '../../components/common/FormField';
import ScheduleInterviewModal from './ScheduleInterviewModal';
import FeedbackModal from './FeedbackModal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PageTransition } from '../../components/common/MotionPrimitives';

export default function InterviewsPage() {
  const { user, hasPermission } = useAuth();
  const { addToast } = useToast();

  const [interviews, setInterviews] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [feedbackTarget, setFeedbackTarget] = useState(null);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [reschedTime, setReschedTime] = useState('');
  const [reschedReason, setReschedReason] = useState('');

  const isTechOnly = hasPermission('interview:technical:view_assigned') && !hasPermission('interview:view_all');
  const isMgrOnly = hasPermission('interview:managerial:view_assigned') && !hasPermission('interview:view_all');

  const loadInterviews = async (targetPage = page) => {
    setLoading(true);
    try {
      let res;
      if (isTechOnly) {
        res = await interviewApi.listAssignedTechnical({ page: targetPage, limit: 15 });
      } else if (isMgrOnly) {
        res = await interviewApi.listAssignedManagerial({ page: targetPage, limit: 15 });
      } else {
        res = await interviewApi.listAll({ page: targetPage, limit: 15 });
      }
      setInterviews(res.data || []);
      setMeta(res.meta || null);
    } catch (err) {
      addToast({ title: 'Failed to load interviews', message: err.message, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInterviews(page);
  }, [page]);

  const handleReschedule = async () => {
    try {
      await interviewApi.reschedule(rescheduleTarget.id, {
        scheduledAt: new Date(reschedTime).toISOString(),
        reason: reschedReason
      });
      addToast({ title: 'Interview Rescheduled', message: 'Notifications dispatched.', variant: 'success' });
      setRescheduleTarget(null);
      loadInterviews(page);
    } catch (err) {
      addToast({ title: 'Reschedule Failed', message: err.message, variant: 'error' });
    }
  };

  const columns = [
    {
      key: 'candidate',
      label: 'Candidate & Role',
      render: (row) => (
        <div>
          <p className="font-semibold text-slate-900">{row.application?.candidate?.fullName}</p>
          <p className="text-xs text-slate-500">
            {row.application?.job?.title} · {row.application?.applicationReference}
          </p>
        </div>
      )
    },
    {
      key: 'round',
      label: 'Round',
      render: (row) => (
        <div>
          <Badge status={row.roundType === 'TECHNICAL' ? 'TECHNICAL_INTERVIEW' : 'MANAGERIAL_INTERVIEW'}>
            {row.roundType} #{row.roundNumber}
          </Badge>
        </div>
      )
    },
    {
      key: 'schedule',
      label: 'Schedule & Mode',
      render: (row) => (
        <div className="text-xs">
          <p className="font-medium text-slate-800">{new Date(row.scheduledAt).toLocaleString()}</p>
          <p className="truncate max-w-[200px] text-slate-500">{row.meetingMode}: {row.meetingLinkOrLocation}</p>
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
      label: 'Actions',
      render: (row) => {
        const myFeedback = (row.feedbacks || []).find((f) => f.interviewerEmployeeId === user?.employeeId);
        const isAssignedToMe = (row.assignments || []).some((a) => a.interviewerEmployeeId === user?.employeeId);

        return (
          <div className="flex flex-wrap gap-1.5">
            {hasPermission('interview:schedule') && !['COMPLETED', 'CANCELLED'].includes(row.status) && (
              <Button
                size="sm"
                variant="secondary"
                icon={CalendarClock}
                onClick={() => {
                  setRescheduleTarget(row);
                  setReschedTime('');
                  setReschedReason('');
                }}
              >
                Reschedule
              </Button>
            )}
            {(hasPermission('interview:technical:feedback') || hasPermission('interview:managerial:feedback')) &&
              isAssignedToMe &&
              !myFeedback && (
                <Button size="sm" icon={ClipboardCheck} onClick={() => setFeedbackTarget(row)}>
                  Submit Feedback
                </Button>
              )}
            {myFeedback && <Badge status={myFeedback.recommendation}>Submitted: {myFeedback.recommendation}</Badge>}
          </div>
        );
      }
    }
  ];

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {isTechOnly
              ? 'Assigned Technical Interviews'
              : isMgrOnly
              ? 'Assigned Managerial Interviews'
              : 'Interview Schedule & Evaluation'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {isTechOnly || isMgrOnly
              ? 'View your explicitly assigned candidate rounds and submit structured evaluation scorecards.'
              : 'Coordinate Technical and Managerial interview rounds and track panel feedback.'}
          </p>
        </div>

        {hasPermission('interview:schedule') && (
          <Button icon={CalendarPlus} onClick={() => setScheduleOpen(true)}>
            Schedule Interview
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={interviews}
        loading={loading}
        meta={meta}
        onPageChange={setPage}
        emptyTitle="No interviews scheduled"
        emptyDescription="Assigned and scheduled interviews will appear here."
      />

      <ScheduleInterviewModal
        isOpen={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onScheduled={() => {
          setScheduleOpen(false);
          loadInterviews(1);
        }}
      />

      <FeedbackModal
        interview={feedbackTarget}
        onClose={() => setFeedbackTarget(null)}
        onSubmitted={() => {
          setFeedbackTarget(null);
          loadInterviews(page);
        }}
      />

      <Modal
        isOpen={Boolean(rescheduleTarget)}
        onClose={() => setRescheduleTarget(null)}
        title="Reschedule Interview"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRescheduleTarget(null)}>Cancel</Button>
            <Button onClick={handleReschedule}>Confirm Reschedule</Button>
          </>
        }
      >
        <div className="space-y-4">
          <InputField
            label="New Date & Time"
            type="datetime-local"
            required
            value={reschedTime}
            onChange={(e) => setReschedTime(e.target.value)}
          />
          <TextAreaField
            label="Reason"
            rows={2}
            value={reschedReason}
            onChange={(e) => setReschedReason(e.target.value)}
          />
        </div>
      </Modal>
    </PageTransition>
  );
}

