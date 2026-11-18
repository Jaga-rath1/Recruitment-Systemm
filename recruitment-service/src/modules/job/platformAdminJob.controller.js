'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/apiResponse');
const service = require('./platformAdminJob.service');

const listPlatformAdminJobs = asyncHandler(async (req, res) => {
  const result = await service.listJobs(req.query, {
    actorUserId: req.auth?.userId,
    requestId: req.requestId
  });
  return sendSuccess(res, {
    message: 'Platform Admin jobs fetched successfully',
    data: result.items,
    meta: result.meta
  });
});

const getPlatformAdminJobDetails = asyncHandler(async (req, res) => {
  const result = await service.getJobDetails(req.params.id, {
    actorUserId: req.auth?.userId,
    requestId: req.requestId
  });
  return sendSuccess(res, {
    message: 'Job details fetched successfully',
    data: result
  });
});

const unpublishPlatformAdminJob = asyncHandler(async (req, res) => {
  const result = await service.unpublishJob(req.params.id, req.body, {
    actorUserId: req.auth?.userId,
    requestId: req.requestId,
    ipAddress: req.ip
  });
  return sendSuccess(res, result);
});

const discardPlatformAdminJob = asyncHandler(async (req, res) => {
  const result = await service.discardJob(req.params.id, req.body, {
    actorUserId: req.auth?.userId,
    requestId: req.requestId,
    ipAddress: req.ip
  });
  return sendSuccess(res, result);
});

module.exports = {
  listPlatformAdminJobs,
  getPlatformAdminJobDetails,
  unpublishPlatformAdminJob,
  discardPlatformAdminJob
};
