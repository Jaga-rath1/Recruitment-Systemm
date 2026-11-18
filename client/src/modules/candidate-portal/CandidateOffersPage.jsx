import React, { useEffect, useState } from 'react';
import { Check, X, Download } from 'lucide-react';
import { portalApi } from '../../api';
import { downloadAuthenticatedFile } from '../../api/httpClient';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import LoadingSkeleton from '../../components/common/LoadingSkeleton';
import EmptyState from '../../components/common/EmptyState';
import { useToast } from '../../context/ToastContext';
import { PageTransition } from '../../components/common/MotionPrimitives';
import { formatINR } from '../../utils/currency';

export default function CandidateOffersPage() {
  const { addToast } = useToast();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = () => {
    setLoading(true);
    portalApi
      .getOverview()
      .then((res) => setApplications(res.data?.applications || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRespond = async (offerId, decision) => {
    try {
      await portalApi.respondOffer(offerId, { decision });
      addToast({
        title: decision === 'ACCEPT' ? 'Offer Accepted!' : 'Offer Declined',
        message: decision === 'ACCEPT' ? 'Onboarding & joining process will begin.' : 'Response recorded.',
        variant: decision === 'ACCEPT' ? 'success' : 'info'
      });
      loadData();
    } catch (err) {
      addToast({ title: 'Action Failed', message: err.message, variant: 'error' });
    }
  };

  if (loading) return <LoadingSkeleton rows={4} />;

  const appsWithOffers = applications.filter((a) => a.offer);

  return (
    <PageTransition className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Offers & Joining Status</h1>
        <p className="mt-1 text-sm text-slate-600">
          Review official offer letters, accept or decline offers, and download joining documentation.
        </p>
      </div>

      {appsWithOffers.length === 0 ? (
        <EmptyState title="No offers issued yet" description="Offers extended by hiring organisations will appear here." />
      ) : (
        <div className="space-y-4">
          {appsWithOffers.map((app) => {
            const offer = app.offer;
            const join = app.joiningRecord;
            return (
              <Card
                key={offer.id}
                title={`${offer.designation} — ${app.organisationName}`}
                subtitle={`Application Ref: ${app.applicationReference}`}
                actions={<Badge status={offer.status} />}
              >
                <div className="grid gap-4 text-xs sm:grid-cols-4">
                  <div>
                    <p className="text-slate-500">Offered Salary</p>
                    <p className="mt-0.5 font-bold text-slate-900">
                      {offer.salaryCurrency === 'INR' || !offer.salaryCurrency
                        ? formatINR(offer.offeredSalary, { maximumFractionDigits: 0 })
                        : `${offer.salaryCurrency} ${Number(offer.offeredSalary).toLocaleString()}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Department</p>
                    <p className="mt-0.5 font-medium text-slate-900">{offer.department}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Proposed Joining Date</p>
                    <p className="mt-0.5 font-medium text-slate-900">{new Date(offer.joiningDate).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Valid Until</p>
                    <p className="mt-0.5 font-medium text-slate-900">{new Date(offer.offerValidUntil).toLocaleDateString()}</p>
                  </div>
                </div>

                {offer.termsSummary && (
                  <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{offer.termsSummary}</p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {(offer.documents || []).map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() =>
                        downloadAuthenticatedFile(doc.downloadUrl, doc.fileName).catch((err) =>
                          addToast({ title: 'Download Failed', message: err.message, variant: 'error' })
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download {doc.fileName}
                    </button>
                  ))}

                  {offer.status === 'SENT' && (
                    <div className="ml-auto flex gap-2">
                      <Button size="sm" icon={Check} onClick={() => handleRespond(offer.id, 'ACCEPT')}>
                        Accept Offer
                      </Button>
                      <Button size="sm" variant="danger" icon={X} onClick={() => handleRespond(offer.id, 'REJECT')}>
                        Decline
                      </Button>
                    </div>
                  )}
                </div>

                {join && (
                  <div className="mt-5 rounded-xl border border-teal-200 bg-teal-50/40 p-4 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-teal-900">Joining & Onboarding</span>
                      <Badge status={join.status} />
                    </div>
                    <p className="mt-1 text-slate-700">
                      Location: <strong>{join.joiningLocation}</strong> · Expected Date:{' '}
                      <strong>{new Date(join.expectedJoiningDate).toLocaleDateString()}</strong>
                      {join.reportingManager ? ` · Reporting Manager: ${join.reportingManager}` : ''}
                    </p>
                    {join.joiningLetterDownloadUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          downloadAuthenticatedFile(
                            join.joiningLetterDownloadUrl,
                            join.joiningLetterFileName || 'joining-letter.pdf'
                          ).catch((err) =>
                            addToast({ title: 'Download Failed', message: err.message, variant: 'error' })
                          )
                        }
                        className="mt-2 inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:underline"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download Joining Letter
                      </button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </PageTransition>
  );
}

