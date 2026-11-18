const PERMISSION_CATALOG = [
  { code: 'organisation:view', name: 'View Organisation', module: 'organisation', description: 'View organisation profile and subscription status' },
  { code: 'organisation:manage', name: 'Manage Organisation', module: 'organisation', description: 'Update organisation recruitment configuration' },
  { code: 'employee:view', name: 'View Employees', module: 'employee', description: 'View employees and employee recruitment activity' },
  { code: 'employee:create', name: 'Create & Invite Employees', module: 'employee', description: 'Add and invite employees to the organisation' },
  { code: 'employee:manage', name: 'Manage Employee Access', module: 'employee', description: 'Assign roles, customize permissions, and deactivate recruitment access' },
  { code: 'role:view', name: 'View Roles & Permissions', module: 'role', description: 'View recruitment roles and permission matrix' },
  { code: 'role:manage', name: 'Manage Roles & Permissions', module: 'role', description: 'Update role permissions and create custom roles' },
  { code: 'job:view', name: 'View Internal Jobs', module: 'job', description: 'View draft, published, unpublished, and closed jobs' },
  { code: 'job:hrms:sync', name: 'Sync HRMS Jobs', module: 'job', description: 'Consume and sync approved requisitions from HRMS Job API' },
  { code: 'job:create', name: 'Create Manual Jobs', module: 'job', description: 'Create manual job requisitions' },
  { code: 'job:edit', name: 'Edit Jobs', module: 'job', description: 'Edit manual jobs and configure recruitment fields on HRMS jobs' },
  { code: 'job:publish', name: 'Publish & Close Jobs', module: 'job', description: 'Publish, unpublish, and close job listings' },
  { code: 'application:view', name: 'View Applications', module: 'application', description: 'View candidate applications and resumes' },
  { code: 'application:screen', name: 'Screen Applications', module: 'application', description: 'Shortlist, reject, or place applications on hold' },
  { code: 'application:final_decision', name: 'Final Candidate Selection', module: 'application', description: 'Review interview results and mark final selection' },
  { code: 'candidate:view', name: 'View Candidates', module: 'candidate', description: 'View candidate profiles and application history' },
  { code: 'interview:schedule', name: 'Schedule & Assign Interviews', module: 'interview', description: 'Schedule or reschedule interviews and assign interviewers' },
  { code: 'interview:view_all', name: 'View All Interviews', module: 'interview', description: 'View all organisation interviews and evaluation feedback' },
  { code: 'interview:technical:view_assigned', name: 'View Assigned Technical Interviews', module: 'interview', description: 'View technical interviews assigned to self' },
  { code: 'interview:technical:feedback', name: 'Submit Technical Feedback', module: 'interview', description: 'Submit feedback on assigned technical interviews' },
  { code: 'interview:managerial:view_assigned', name: 'View Assigned Managerial Interviews', module: 'interview', description: 'View managerial interviews assigned to self' },
  { code: 'interview:managerial:feedback', name: 'Submit Managerial Feedback', module: 'interview', description: 'Submit feedback on assigned managerial interviews' },
  { code: 'offer:view', name: 'View Offers', module: 'offer', description: 'View candidate offers and offer documents' },
  { code: 'offer:manage', name: 'Process & Send Offers', module: 'offer', description: 'Create offers, upload offer letters, and dispatch offers' },
  { code: 'offer:salary_approve', name: 'Approve Offer Salary', module: 'offer', description: 'Formally approve candidate salary offers exceeding budget bands or requiring executive sign-off' },
  { code: 'joining:view', name: 'View Joining Records', module: 'joining', description: 'View candidate joining and onboarding records' },
  { code: 'joining:manage', name: 'Manage Joining & Hire', module: 'joining', description: 'Initiate joining, upload joining letter, and confirm hire' },
  { code: 'report:view', name: 'View Recruitment Reports', module: 'report', description: 'View recruitment analytics and pipeline metrics' },
  { code: 'audit:view', name: 'View Audit Logs', module: 'audit', description: 'Inspect recruitment security and workflow audit logs' },
  { code: 'candidate:self', name: 'Candidate Portal Self-Service', module: 'candidate_portal', description: 'Manage own candidate profile, applications, interviews, offers, and joining status' }
];

const DEFAULT_ORG_ROLES = [
  {
    code: 'ORGANISATION_ADMIN',
    name: 'Organisation Admin',
    description: 'Full organisation recruitment administration, employee access control, role management, jobs, offers, joining, and reporting.',
    permissions: PERMISSION_CATALOG.filter((p) => p.code !== 'candidate:self').map((p) => p.code)
  },
  {
    code: 'RECRUITER',
    name: 'Recruiter',
    description: 'End-to-end hiring execution: jobs, applications, candidate screening, interview scheduling, final selection, offers, and joining.',
    permissions: [
      'organisation:view',
      'employee:view',
      'job:view',
      'job:hrms:sync',
      'job:create',
      'job:edit',
      'job:publish',
      'application:view',
      'application:screen',
      'application:final_decision',
      'candidate:view',
      'interview:schedule',
      'interview:view_all',
      'offer:view',
      'offer:manage',
      'joining:view',
      'joining:manage',
      'report:view'
    ]
  },
  {
    code: 'TECHNICAL_INTERVIEWER',
    name: 'Technical Interviewer',
    description: 'Restricted to viewing assigned technical interviews and submitting technical evaluation feedback.',
    permissions: [
      'interview:technical:view_assigned',
      'interview:technical:feedback'
    ]
  },
  {
    code: 'SENIOR_INTERVIEWER',
    name: 'Senior Interviewer',
    description: 'Restricted to viewing assigned managerial interviews and submitting leadership/behavioural evaluation feedback.',
    permissions: [
      'interview:managerial:view_assigned',
      'interview:managerial:feedback'
    ]
  },
  {
    code: 'CANDIDATE',
    name: 'Candidate',
    description: 'Self-service portal role restricted strictly to own profile, applications, interview schedules, offers, and stage tracking.',
    permissions: ['candidate:self']
  }
];

module.exports = {
  PERMISSION_CATALOG,
  DEFAULT_ORG_ROLES
};

