import React, { useEffect, useState } from 'react';
import { CalendarClock, Video, MapPin } from 'lucide-react';
import { portalApi } from '../../api';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import EmptyState from '../../components/common/EmptyState';
import { PageTransition } from '../../components/common/MotionPrimitives';

export default function CandidateInterviewsPage() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalApi
      .getOverview()
      .then((res) => setApplications(res.data?.applications || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton rows={4} />;

  const scheduled = applications.flatMap((app) =>
    (app.interviews || []).map((iv) => ({
      ...iv,
      jobTitle: app.job?.title,
      organisationName: app.organisationName,
      applicationReference: app.applicationReference
    }))
  );

  return (
    <PageTransition className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Interview Schedule</h1>
        <p className="mt-1 text-sm text-slate-600">
          Upcoming and completed interview sessions across your applications.
        </p>
      </div>

      {scheduled.length === 0 ? (
        <EmptyState title="No interviews scheduled yet" description="When a hiring team schedules an interview, details appear here." icon={CalendarClock} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {scheduled.map((iv) => (
            <Card
              key={iv.id}
              title={`${iv.roundType} Interview (Round #${iv.roundNumber})`}
              subtitle={`${iv.jobTitle} · ${iv.organisationName}`}
              actions={<Badge status={iv.status} />}
            >
              <div className="space-y-2 text-xs text-slate-700">
                <p className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-brand-600" />
                  <strong>{new Date(iv.scheduledAt).toLocaleString()}</strong> ({iv.durationMinutes} mins)
                </p>
                <p className="flex items-center gap-2">
                  {iv.meetingMode === 'VIDEO' ? <Video className="h-4 w-4 text-brand-600" /> : <MapPin className="h-4 w-4 text-brand-600" />}
                  <span>{iv.meetingLinkOrLocation}</span>
                </p>
                {iv.rescheduleReason && (
                  <p className="rounded bg-amber-50 p-2 text-amber-800">Note: {iv.rescheduleReason}</p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageTransition>
  );
}

