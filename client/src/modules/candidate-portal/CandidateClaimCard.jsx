import React, { useState } from 'react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import { InputField } from '../../components/common/FormField';
import { portalApi } from '../../api';
import { useToast } from '../../context/ToastContext';

export default function CandidateClaimCard({ onClaimed }) {
  const { addToast } = useToast();
  const [organisationId, setOrganisationId] = useState('');
  const [applicationReference, setApplicationReference] = useState('');
  const [claiming, setClaiming] = useState(false);

  const handleClaim = async (e) => {
    e.preventDefault();
    setClaiming(true);
    try {
      const res = await portalApi.claimApplication({
        organisationId: organisationId.trim(),
        ...(applicationReference.trim() ? { applicationReference: applicationReference.trim() } : {})
      });
      addToast({
        title: 'Application Claimed',
        message: `Linked ${res.data?.claimedApplications?.length || 1} application(s) from ${res.data?.organisationName || 'organisation'}.`,
        variant: 'success'
      });
      setOrganisationId('');
      setApplicationReference('');
      if (onClaimed) await onClaimed();
    } catch (err) {
      addToast({ title: 'Claim failed', message: err.message, variant: 'error' });
    } finally {
      setClaiming(false);
    }
  };

  return (
    <Card
      title="Claim Previous Application"
      subtitle="Applied before creating your account? Enter the Organisation ID and your Application Reference to bind verified ownership."
    >
      <form onSubmit={handleClaim} className="grid gap-4 sm:grid-cols-3 sm:items-end">
        <InputField
          label="Organisation ID (UUID)"
          required
          value={organisationId}
          onChange={(e) => setOrganisationId(e.target.value)}
          placeholder="xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx"
        />
        <InputField
          label="Application Reference (Optional)"
          value={applicationReference}
          onChange={(e) => setApplicationReference(e.target.value)}
          placeholder="NXV-20261112-A1B2C3"
        />
        <Button type="submit" loading={claiming}>
          Claim Application
        </Button>
      </form>
    </Card>
  );
}

