const { withTransaction, getModels } = require('../../config/database');
const env = require('../../config/env');
const {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError
} = require('../../utils/AppError');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const subscriptionRepo = require('./subscription.repository');
const auditService = require('../audit/audit.service');
const platformAdapter = require('../../integrations/platform/platform.adapter');
const storageAdapter = require('../../integrations/storage/storage.adapter');

function getTreasuryConfig() {
  if (typeof env.buildTreasuryConfig === 'function') {
    return env.buildTreasuryConfig(process.env);
  }
  return {
    bankName: env.treasury?.bankName,
    accountNumber: env.treasury?.accountNumber,
    ifscCode: env.treasury?.ifscCode,
    upiId: env.treasury?.upiId,
    beneficiaryName: env.treasury?.beneficiaryName
  };
}

function isTreasuryConfigured(treasury) {
  if (typeof env.isTreasuryConfigured === 'function') {
    return env.isTreasuryConfigured(treasury);
  }
  return Boolean(
    treasury &&
    treasury.bankName &&
    treasury.accountNumber &&
    treasury.ifscCode &&
    treasury.beneficiaryName
  );
}

async function submitPaymentProof(subscriptionId, input, file, context = {}) {
  const idempotencyKey = context.idempotencyKey || input.idempotencyKey || null;

  if (idempotencyKey) {
    const existingPayment = await subscriptionRepo.findPaymentByIdempotencyKey(idempotencyKey);
    if (existingPayment) {
      const sub = await subscriptionRepo.findSubscriptionById(existingPayment.subscriptionId);
      return { subscription: sub, payment: existingPayment, idempotentReplay: true };
    }
  }

  const sub = await subscriptionRepo.findSubscriptionById(subscriptionId);
  if (!sub) {
    throw new NotFoundError('Subscription request not found');
  }

  if (!['PENDING_PAYMENT', 'REJECTED'].includes(sub.status)) {
    throw new ConflictError(`Cannot submit payment proof when subscription status is ${sub.status}`);
  }

  const treasury = getTreasuryConfig();
  if (!isTreasuryConfigured(treasury)) {
    throw new BadRequestError(
      'Payment instructions are temporarily unavailable. Please contact the platform administrator.',
      null,
      'PAYMENT_DETAILS_UNAVAILABLE'
    );
  }

  const normalizedRef = input.paymentReference.trim();
  const duplicateRef = await subscriptionRepo.findPaymentByReference(normalizedRef);
  if (duplicateRef) {
    throw new ConflictError('This payment reference has already been submitted', 'DUPLICATE_PAYMENT_REFERENCE');
  }

  if (input.amountCents !== undefined && Number(input.amountCents) !== sub.amountCents) {
    throw new BadRequestError('Payment amount does not match the server-calculated invoice amount', null, 'AMOUNT_MISMATCH');
  }

  let storedProof = null;
  if (file) {
    storedProof = await storageAdapter.saveFile({
      organisationId: null,
      folder: 'subscription-proofs',
      originalName: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer
    });
  }

  let result;
  try {
    result = await withTransaction(async (tx) => {
      const payment = await subscriptionRepo.createPayment(
        {
          subscriptionId: sub.id,
          paymentReference: normalizedRef,
          paymentMethod: input.paymentMethod.trim(),
          amountCents: sub.amountCents,
          currency: sub.currency,
          proofFileKey: storedProof?.storageKey || null,
          proofFileName: storedProof?.fileName || null,
          proofMimeType: storedProof?.mimeType || null,
          proofFileSizeBytes: storedProof?.fileSizeBytes || null,
          proofStorageProvider: storedProof?.storageProvider || null,
          proofCloudinaryPublicId: storedProof?.cloudinaryPublicId || null,
          proofCloudinaryResourceType: storedProof?.cloudinaryResourceType || null,
          proofCloudinaryFormat: storedProof?.cloudinaryFormat || null,
          proofCloudinaryVersion: storedProof?.cloudinaryVersion || null,
          proofVisibility: storedProof?.storageVisibility || 'AUTHENTICATED',
          proofChecksumSha256: storedProof?.checksumSha256 || null,
          proofScanStatus: storedProof?.scanStatus || 'NOT_SCANNED',
          proofScanCheckedAt: storedProof?.scanCheckedAt || null,
          submittedByEmail: (input.submittedByEmail || sub.adminEmail).trim().toLowerCase(),
          status: 'SUBMITTED',
          notes: input.notes || null,
          idempotencyKey
        },
        tx
      );

      const updatedSub = await subscriptionRepo.updateSubscription(
        sub.id,
        {
          status: 'PENDING_VERIFICATION',
          rejectedReason: null
        },
        tx
      );

      await auditService.recordAudit(
        {
          entityType: 'SUBSCRIPTION_PAYMENT',
          entityId: payment.id,
          action: 'PAYMENT_PROOF_SUBMITTED',
          requestId: context.requestId,
          ipAddress: context.ipAddress,
          afterState: {
            subscriptionId: sub.id,
            paymentReference: payment.paymentReference,
            status: updatedSub.status
          }
        },
        tx
      );

      return { subscription: updatedSub, payment };
    });
  } catch (err) {
    if (storedProof?.storageKey) {
      await storageAdapter.deleteFile(storedProof.storageKey, storedProof);
    }
    throw err;
  }

  await platformAdapter.submitVerificationRequest(
    {
      subscriptionId: sub.id,
      organisationName: sub.organisationName,
      adminEmail: sub.adminEmail,
      paymentReference: result.payment.paymentReference,
      amountCents: result.payment.amountCents,
      currency: result.payment.currency
    },
    { requestId: context.requestId }
  );

  return { ...result, idempotentReplay: false };
}

async function listPlatformAdminPayments(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const { items, total } = await subscriptionRepo.listPayments({
    search: query.search,
    status: query.status,
    skip,
    take: limit
  });

  const sanitized = items.map((payment) => ({
    ...payment,
    proofDownloadUrl: payment.proofFileKey
      ? storageAdapter.buildSignedDownloadUrl({
          storageKey: payment.proofFileKey,
          fileName: payment.proofFileName,
          mimeType: payment.proofMimeType,
          organisationId: null,
          docScope: 'SUBSCRIPTION_PROOF'
        })
      : null
  }));

  return buildPaginationMeta({ items: sanitized, limit, total, page });
}

async function voidSubscriptionPayment(paymentId, input = {}, context = {}) {
  const { reason, targetStatus = 'VOIDED' } = input;
  const newStatus = targetStatus === 'ARCHIVED' ? 'ARCHIVED' : 'VOIDED';
  const auditAction = newStatus === 'ARCHIVED' ? 'PAYMENT_ARCHIVED' : 'PAYMENT_VOIDED';

  if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
    throw new BadRequestError(
      'A mandatory reason (minimum 5 characters) is required to archive or void a payment record.',
      null,
      'MANDATORY_VOID_REASON_REQUIRED'
    );
  }

  const adminActorId = context.actorUserId || null;
  const { Subscription, SubscriptionPayment } = getModels();

  return withTransaction(async (tx) => {
    const payment = await SubscriptionPayment.findByPk(paymentId, {
      transaction: tx,
      lock: tx.LOCK.UPDATE
    });

    if (!payment) {
      throw new NotFoundError('Payment record not found');
    }

    const linkedSub = payment.subscriptionId
      ? await Subscription.findByPk(payment.subscriptionId, { transaction: tx })
      : null;

    if (['VOIDED', 'ARCHIVED'].includes(payment.status)) {
      throw new ConflictError(
        `Payment ${payment.paymentReference} has already been ${payment.status} on ${payment.voidedAt || payment.updatedAt}`,
        'PAYMENT_ALREADY_VOIDED'
      );
    }

    // DATA INTEGRITY RULE: Never delete or casually void a payment linked to an active subscription without an explicit business workflow.
    if (payment.status === 'VERIFIED' && linkedSub?.status === 'ACTIVE') {
      throw new ForbiddenError(
        'Cannot void or archive a verified payment linked to an active customer subscription. Deactivation of the subscription is required first.',
        'ACTIVE_SUBSCRIPTION_PAYMENT_PROTECTED'
      );
    }

    const beforeState = {
      status: payment.status,
      verifiedBy: payment.verifiedBy,
      verifiedAt: payment.verifiedAt
    };

    const cleanReason = reason.trim();
    const now = new Date();

    payment.status = newStatus;
    payment.voidedBy = adminActorId;
    payment.voidedAt = now;
    payment.voidReason = cleanReason;
    await payment.save({ transaction: tx });

    // If subscription was in PENDING_VERIFICATION, check if there are other SUBMITTED payments
    if (linkedSub && linkedSub.status === 'PENDING_VERIFICATION') {
      const remainingSubmitted = await SubscriptionPayment.count({
        where: {
          subscriptionId: payment.subscriptionId,
          status: 'SUBMITTED'
        },
        transaction: tx
      });

      if (remainingSubmitted === 0) {
        await Subscription.update(
          { status: 'PENDING_PAYMENT' },
          { where: { id: payment.subscriptionId }, transaction: tx }
        );
      }
    }

    await auditService.recordAudit(
      {
        actorUserId: adminActorId,
        actorRole: 'PLATFORM_ADMIN',
        entityType: 'SUBSCRIPTION_PAYMENT',
        entityId: payment.id,
        action: auditAction,
        requestId: context.requestId,
        beforeState,
        afterState: {
          status: newStatus,
          voidedBy: adminActorId,
          voidedAt: now.toISOString(),
          voidReason: cleanReason
        }
      },
      tx
    );

    const updatedPayment = await subscriptionRepo.findPaymentById(payment.id, tx);
    return {
      ...updatedPayment,
      proofDownloadUrl: updatedPayment.proofFileKey
        ? storageAdapter.buildSignedDownloadUrl({
            storageKey: updatedPayment.proofFileKey,
            fileName: updatedPayment.proofFileName,
            mimeType: updatedPayment.proofMimeType,
            organisationId: null,
            docScope: 'SUBSCRIPTION_PROOF'
          })
        : null
    };
  });
}

module.exports = {
  getTreasuryConfig,
  isTreasuryConfigured,
  submitPaymentProof,
  listPlatformAdminPayments,
  voidSubscriptionPayment
};
