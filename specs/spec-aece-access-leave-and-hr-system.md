# Specification: f921f141-183f-4a23-bffe-9f52c739401a

*Generated: 2026-04-01 | Project ID: f921f141-183f-4a23-bffe-9f52c739401a*

---

## Problem Statement

**Title:** Leave Management System

**Current State:** Manual, Excel-based leave tracking leading to inaccuracies, administrative burden, and potential non-compliance with BCEA.

**Desired State:** An automated, compliant leave management system with real-time tracking, structured workflows, and elimination of manual errors.

**Pain Points:**
- Inaccurate leave balances
- Risk of non-compliance with BCEA
- Administrative burden on HR/management
- Potential data entry errors
- Potential loss of leave due to manual tracking errors

**Business Drivers:**
- Ensure compliance with BCEA and LRA
- Improve accuracy of leave tracking
- Reduce administrative overhead
- Enhance employee experience by providing clear leave visibility

**Constraints:**
- Company size: approx. 20 employees
- Legal scope: South Africa (BCEA compliance is key)

**Success Criteria:**
- Accurate, real-time leave tracking
- Automated accrual and balance updates
- Structured approval workflows
- Elimination of manual Excel errors
- Compliance with statutory requirements

---

## Stakeholder Matrix

### Employee
**Goals:**
- Accurate view of leave balances
- Easy submission of leave requests
- Understanding leave policies

**Pain Points:**
- Manual tracking errors
- Lack of real-time balance visibility
- Uncertainty about leave policies
- Potential for leave forfeiture due to manual errors

**Constraints:**
- General technical proficiency (assumed)

**Sign-off Authority:** No

---

### Line Manager
**Goals:**
- Efficiently review and recommend leave requests
- Ensure team coverage
- Understand team leave patterns

**Pain Points:**
- Manual review process
- Lack of visibility into team's upcoming leave
- Administrative overhead of approval

**Constraints:**
- Time constraints
- Decision-making authority for recommendations

**Sign-off Authority:** No

---

### Human Resources
**Goals:**
- Ensure legal compliance (BCEA, LRA)
- Maintain accurate leave records
- Manage leave policies
- Reduce administrative burden
- Provide reporting on leave trends

**Pain Points:**
- High administrative overhead
- Risk of non-compliance penalties
- Difficulty in accurate tracking and reporting
- Manual reconciliation efforts
- Dealing with errors from Excel system

**Constraints:**
- Ensuring data accuracy
- Maintaining confidentiality
- Implementing and enforcing policies

**Sign-off Authority:** Yes

---

## Scope Boundary

**In Scope:**
- Automated leave accrual (annual, sick, FRL, etc.)
- Real-time balance tracking
- Structured approval workflows (Employee -> Line Manager -> HR)
- Leave request submission with document upload
- Management of statutory leave types (Annual, Sick, FRL, Maternity, Parental, Adoption, Commissioning)
- Configurable custom leave types (e.g., Study Leave)
- Unpaid leave management with notice period and discretion
- Automated notifications (submission, pending, status)
- HR dashboard and reporting (balances, upcoming, trends, sick leave flags)
- Audit trail for all actions
- Employee profile management with future integration considerations
- Validation rules (balance, overlaps, dates)
- Configurable policy settings (forfeiture, notice periods)

**Out of Scope:**
- Payroll processing
- Integration with external payroll systems (initially, but design must allow)
- Time and attendance tracking (beyond leave)
- Performance management
- Recruitment
- Employee self-service for HR profile updates beyond basic contact info (assumed)

---

## Requirements Backlog

### Functional Requirements

#### REQ-001 — Employee Data Management
**Description:** Allow HR to create, view, update, deactivate employee profiles including contact details, manager linkage, leave cycle start date, balances, and history. Design must support future integration.
**Priority:** must-have
**Stakeholders:** hr, employee
**Acceptance Criteria:**
- HR can manage all profile fields.
- Employee records linked to managers.
- Structure supports potential future integration.

#### REQ-002 — Leave Request Submission
**Description:** Employees can submit leave requests via a portal: select type, dates, reason, upload supporting documents.
**Priority:** must-have
**Stakeholders:** employee
**Acceptance Criteria:**
- Employee can submit leave for any type.
- Reason provided.
- Supporting documents can be uploaded if required.

#### REQ-003 — Annual Leave Management
**Description:** Manage annual leave per BCEA (1.25 days/month accrual), enforce 'earned first' rule, and company policy for forfeiture (6 months post-cycle grace).
**Priority:** must-have
**Stakeholders:** hr, employee
**Acceptance Criteria:**
- System calculates accrual correctly.
- Leave only taken when earned.
- Forfeiture rule enforced/flagged.

#### REQ-004 — Sick Leave Management
**Description:** Manage sick leave per BCEA (30 days/36 months cycle), track initial 6-month accrual (1/26 days), enforce medical certificate rules (statutory and company policy for Fri/Mon/holiday proximity).
**Priority:** must-have
**Stakeholders:** hr, employee
**Acceptance Criteria:**
- Sick leave tracked over 36m cycle.
- Initial 6m accrual correct.
- Medical certificate triggers function correctly.

#### REQ-005 — Family Responsibility Leave Management
**Description:** Manage 3 days/annual cycle FRL. Enforce eligibility (4 months employment, 4 days/week). Resets annually, no carry-over. Allow document uploads.
**Priority:** must-have
**Stakeholders:** hr, employee
**Acceptance Criteria:**
- Eligibility enforced.
- Leave granted correctly.
- Resets annually.
- Documents can be uploaded.

#### REQ-006 — Special Statutory Leave Management
**Description:** Manage Maternity, Parental, Adoption, Commissioning Parental Leave per BCEA, tracking duration and preventing overlaps.
**Priority:** must-have
**Stakeholders:** hr, employee
**Acceptance Criteria:**
- Leave durations recorded accurately.
- Overlapping bookings prevented.

#### REQ-007 — Custom Leave Type Configuration
**Description:** Allow HR to define and configure custom leave types (e.g., Study Leave) with internal rules.
**Priority:** should-have
**Stakeholders:** hr
**Acceptance Criteria:**
- HR can create new leave types.
- Configurable rules applied.

#### REQ-008 — Unpaid Leave Management
**Description:** Support unpaid leave as a configurable type, requiring approval, not affecting statutory balances. Enforce 7-day notice, with alerts for deviations. Line Manager/HR discretion applies.
**Priority:** must-have
**Stakeholders:** hr, employee, line_manager
**Acceptance Criteria:**
- Employees can request unpaid leave.
- Notice period tracked and alerted.
- Manager/HR discretion logged.
- Statutory balances unaffected.

#### REQ-009 — Workflow Steps
**Description:** Implement structured workflow: Employee Application -> Line Manager Review -> HR Decision -> Notifications.
**Priority:** must-have
**Stakeholders:** employee, line_manager, hr
**Acceptance Criteria:**
- Each workflow stage functions as described.
- Requests transition correctly.

#### REQ-010 — Notification System
**Description:** Automated email notifications for: submission (to LM/HR), pending action alerts (12h timeout), final status updates (to Employee/LM).
**Priority:** must-have
**Stakeholders:** hr, line_manager, employee
**Acceptance Criteria:**
- All specified notifications are sent accurately and timely.

#### REQ-011 — Approval Discretion & Alerts (Unpaid Leave)
**Description:** Highlight 7-day notice deviation for unpaid leave. LM recommends/HR decides with discretion, logging reasoning.
**Priority:** must-have
**Stakeholders:** hr, line_manager
**Acceptance Criteria:**
- Short notice flagged.
- Discretionary decisions logged.
- Reasoning captured.

#### REQ-012 — Leave Balance Display
**Description:** Employee portal to show current balance per type, leave taken, pending, and forfeited.
**Priority:** must-have
**Stakeholders:** employee, hr
**Acceptance Criteria:**
- Employee dashboard accurately reflects all balance info.

#### REQ-013 — Validation Rules
**Description:** Prevent leave exceeding balance (excl. unpaid), overlapping dates, pre-start date applications. Enforce sick leave certificate triggers.
**Priority:** must-have
**Stakeholders:** system, employee
**Acceptance Criteria:**
- System prevents invalid requests based on rules.

#### REQ-014 — Audit Trail
**Description:** Log all significant actions: application dates, approvals/rejections, user actions, balance changes.
**Priority:** must-have
**Stakeholders:** hr, system
**Acceptance Criteria:**
- Comprehensive and accurate log maintained.

#### REQ-015 — HR Dashboard & Reporting
**Description:** HR dashboard with: leave balances, upcoming leave, trends, sick leave flags. Support future reporting expansion.
**Priority:** must-have
**Stakeholders:** hr
**Acceptance Criteria:**
- Dashboard displays required info.
- Basic reporting functions available.

#### REQ-016 — Policy-Specific Configuration
**Description:** Allow HR configuration of: annual leave forfeiture rules, custom leave types, approval hierarchy.
**Priority:** must-have
**Stakeholders:** hr
**Acceptance Criteria:**
- HR can adjust key policy settings.

### Non-Functional Requirements

#### NFR-001 — Compliance
**Type:** Legal/Compliance
**Criteria:** System complies with BCEA and Labour Relations Act. All statutory entitlements, rates, and conditions correctly implemented. Audit trails support verification.

#### NFR-002 — Auditability
**Type:** Security/Audit
**Criteria:** All transactions and changes are logged for auditing purposes. Comprehensive logs generated for all user and system actions.

#### NFR-003 — Usability
**Type:** Usability
**Criteria:** Employee portal and HR/Manager interfaces are intuitive and easy to use. Users can complete tasks with minimal training.

#### NFR-004 — Future Integration
**Type:** Technical/Scalability
**Criteria:** System architecture designed to facilitate future integration with external HR or payroll systems via necessary hooks or APIs.

---

## User Story Backlog

### EPIC-001: Employee Leave Management

#### STORY-001
As an Employee, I want to submit a leave request so that my manager and HR can review and approve it.

**Priority:** must-have | **Points:** 3
**Links to:** REQ-002

**Acceptance Criteria:**
- Given I am logged into the employee portal When I navigate to the leave request section And I select a leave type (e.g., Annual Leave) And I select a start date and end date And I provide a reason for my leave And if the leave type requires supporting documentation (e.g., Sick Leave, Family Responsibility Leave), I can upload relevant files (e.g., medical certificate, birth certificate). And I click 'Submit' Then my leave request is created and sent to my Line Manager for recommendation.

**Edge Cases:**
- Requesting leave on a weekend
- Requesting more days than available (except unpaid)
- Requesting leave before employment start date
- Upload failures

#### STORY-012
As an Employee, I want to upload required supporting documents (like medical certificates or proof for family responsibility leave) when submitting a leave request so that I meet the policy requirements for approval.

**Priority:** must-have | **Points:** 2
**Links to:** REQ-002, REQ-004, REQ-005
**Depends on:** STORY-001

**Acceptance Criteria:**
- Given I am submitting a leave request for a type that requires supporting documentation (e.g., Sick Leave exceeding 2 days, Family Responsibility Leave) When I am on the leave request form Then I see an option to upload a file. And I can select a file from my device (e.g., PDF, JPG). And the file is successfully attached to my leave request.

**Edge Cases:**
- File size limits
- Unsupported file types
- Multiple file uploads

#### STORY-002
As an Employee, I want to view my current leave balances in real-time so that I know how much leave I have available for each type.

**Priority:** must-have | **Points:** 2
**Links to:** REQ-012

**Acceptance Criteria:**
- Given I am logged into the employee portal When I navigate to my leave dashboard Then I can see my current available balance for Annual Leave, Sick Leave, Family Responsibility Leave, etc. And I can see the total leave accrued, leave taken, and leave pending approval for each type.

**Edge Cases:**
- What happens if accrual hasn't run for the current month yet?
- How are balances displayed if they are complex (e.g., sick leave over 3 years)?

#### STORY-003
As an Employee, I want to view my leave history so that I can track all past leave requests and their statuses.

**Priority:** must-have | **Points:** 2
**Links to:** REQ-014

**Acceptance Criteria:**
- Given I am logged into the employee portal When I navigate to my leave history section Then I can see a list of all my past leave requests, including dates, type, status (Approved, Rejected, Pending), and any comments.

**Edge Cases:**
- Handling historical data migration

### EPIC-002: Leave Approval Workflow

#### STORY-004
As a Line Manager, I want to receive notifications for new leave requests from my direct reports so that I can review and recommend an approval or rejection promptly.

**Priority:** must-have | **Points:** 2
**Links to:** REQ-009, REQ-010, REQ-011
**Depends on:** STORY-001

**Acceptance Criteria:**
- Given an employee has submitted a leave request When the request is submitted Then I receive an email notification with a link to the request. And the request appears in my 'Pending Approvals' queue in the system. And if the leave request is for Unpaid Leave submitted with less than 7 days' notice, the notification will highlight this deviation. And if no action is taken on a submitted leave request (any type) within 12 hours, I will receive a reminder notification.

**Edge Cases:**
- Manager is on leave
- Manager is unresponsive
- System notification failures

#### STORY-005
As a Line Manager, I want to review leave requests and provide a recommendation (Approve/Reject) with mandatory comments so that HR has the necessary context for their decision.

**Priority:** must-have | **Points:** 3
**Links to:** REQ-009, REQ-011
**Depends on:** STORY-004

**Acceptance Criteria:**
- Given I have received a leave request notification When I open the request in the system And I view the employee's available balance and team calendar (if available) And if the leave is Unpaid Leave requested with less than 7 days' notice, I can still choose to Recommend Approval or Rejection, noting the short notice. And I select 'Recommend Approval' or 'Recommend Rejection' And I enter mandatory comments explaining my decision (especially if recommending rejection or noting short notice) And I click 'Submit Recommendation' Then the request status is updated to 'Manager Recommended Approval' or 'Manager Recommended Rejection' and sent to HR.

**Edge Cases:**
- Manager recommends rejection without valid reason
- Manager forgets to add comments

#### STORY-006
As HR personnel, I want to review leave requests with the Line Manager's recommendation and make the final Approve/Reject decision so that the leave is officially actioned.

**Priority:** must-have | **Points:** 3
**Links to:** REQ-009, REQ-011
**Depends on:** STORY-005

**Acceptance Criteria:**
- Given a leave request has a recommendation from the Line Manager When I access the request in the HR portal And I review the details, recommendation, comments, and any uploaded supporting documents. And if the leave is Unpaid Leave requested with less than 7 days' notice, this deviation and the manager's recommendation/comments regarding it are clearly visible. And I have the discretion to Approve or Reject the request, even if the 7-day notice for Unpaid Leave was not met. And I select 'Approve' or 'Reject' And I add optional comments (especially for rejection or noting discretion exercised). And I click 'Finalize Decision' Then the leave request status is updated to 'Approved' or 'Rejected'. And the employee's leave balance is adjusted if approved. And automated notifications are sent.

**Edge Cases:**
- HR approves against manager's recommendation
- HR rejects without clear reason
- Document format issues

#### STORY-018
As HR and Line Manager, we want to receive timely email alerts for all submitted leave applications so that we are aware of pending actions.

**Priority:** must-have | **Points:** 2
**Links to:** REQ-010
**Depends on:** STORY-001

**Acceptance Criteria:**
- Given an employee submits any type of leave request When the request is successfully submitted Then an automated email notification is sent to the designated Line Manager. And an automated email notification is sent to the designated HR personnel. And these notifications contain key details of the request (employee, dates, type).

**Edge Cases:**
- Multiple managers/HR contacts
- Incorrect email addresses

#### STORY-019
As HR and Line Manager, we want to receive pending action alerts if a leave application is not addressed within 12 hours so that we can ensure timely processing and avoid delays.

**Priority:** must-have | **Points:** 3
**Links to:** REQ-010
**Depends on:** STORY-004, STORY-005, STORY-006

**Acceptance Criteria:**
- Given a leave application has been submitted and is awaiting action from a Line Manager or HR When 12 hours have passed since submission (or last action) And the request has not been approved, rejected, or recommended Then a reminder notification (email) is sent to the responsible individual (Line Manager or HR). And this alert clearly states the application details and the pending status.

**Edge Cases:**
- System downtime during the 12-hour window
- Concurrent actions causing alerts to be sent erroneously

### EPIC-003: Leave Entitlement & Calculation Logic

#### STORY-007
As HR, I need the system to automatically accrue Annual Leave for employees at a rate of 1.25 days per month, visible in real-time.

**Priority:** must-have | **Points:** 5
**Links to:** REQ-003
**Depends on:** REQ-003

**Acceptance Criteria:**
- Given an employee has an active profile and a defined 'Leave Cycle Start Date' When the system runs its monthly accrual process Then the employee's Annual Leave balance is increased by 1.25 days (pro-rated for the first partial month if necessary). And this updated balance is visible to the employee and HR.

**Edge Cases:**
- Leap years
- Employees starting mid-cycle
- Employees on unpaid leave during accrual period

#### STORY-008
As HR, I need the system to track Sick Leave entitlement over a 36-month cycle (30 days for a 5-day worker) and manage accrual for the first 6 months (1 day per 26 worked).

**Priority:** must-have | **Points:** 5
**Links to:** REQ-004
**Depends on:** REQ-004

**Acceptance Criteria:**
- Given an employee has an active profile When the system tracks sick leave usage Then it correctly calculates the remaining entitlement within the current 36-month cycle. And for employees within their first 6 months, it tracks days worked and accrues sick leave accordingly.

**Edge Cases:**
- Handling cycle resets
- Employees working different numbers of days per week

#### STORY-009
As HR, I need the system to enforce the rules for Family Responsibility Leave, ensuring it's locked until eligibility criteria (4 months employment, 4 days/week) are met and resets annually.

**Priority:** must-have | **Points:** 3
**Links to:** REQ-005
**Depends on:** REQ-005

**Acceptance Criteria:**
- Given an employee's profile indicates they have worked less than 4 months or work fewer than 4 days a week When they attempt to apply for Family Responsibility Leave Then the system prevents them from selecting this leave type. And once eligible, the system allows them to apply for up to 3 days per annual cycle.

**Edge Cases:**
- Employee eligibility changing mid-cycle

#### STORY-010
As HR, I need the system to manage Maternity, Parental, Adoption, and Commissioning Parental Leave according to BCEA regulations, including blocking overlapping leave types and tracking the duration.

**Priority:** must-have | **Points:** 3
**Links to:** REQ-006
**Depends on:** REQ-006

**Acceptance Criteria:**
- Given an employee applies for Maternity Leave (or other related leave types) When the dates are entered Then the system calculates the 4 months (Maternity) or 10 days/weeks (others) duration. And the system prevents the employee from booking other leave types that overlap with this period. And the system enforces the post-birth 6-week non-working period for Maternity Leave.

**Edge Cases:**
- Medically required early start for maternity
- Premature births

#### STORY-011
As HR, I need the system to support configurable custom leave types, such as Study Leave, allowing us to define accrual and usage rules internally.

**Priority:** should-have | **Points:** 3
**Links to:** REQ-007
**Depends on:** REQ-007

**Acceptance Criteria:**
- Given I am an HR administrator When I access the leave type configuration section Then I can create a new leave type (e.g., "Study Leave") And define its specific rules (e.g., accrual rate, eligibility, if approval is needed).

**Edge Cases:**
- Modifying rules for existing custom leave types

#### STORY-013
As an Employee, I want to request Unpaid Leave so that I can take time off when I have exhausted other leave types or for reasons not covered by specific entitlements, subject to approval.

**Priority:** must-have | **Points:** 3
**Links to:** REQ-008
**Depends on:** REQ-008

**Acceptance Criteria:**
- Given I am logged into the employee portal When I navigate to the leave request section And I select 'Unpaid Leave' as the leave type And I select the start and end dates And I provide a reason for the unpaid leave And the system validates that the request is submitted at least 7 calendar days in advance. If the request is submitted with less than 7 days' notice, the system displays a warning message highlighting the deviation and that manager/HR discretion will apply. And I click 'Submit' Then the request is sent to my Line Manager for recommendation and then to HR for final approval. And the system does not deduct from any statutory leave balances.

**Edge Cases:**
- Requesting unpaid leave that spans across pay periods
- Manager/HR rejecting unpaid leave
- System date/time zone issues

### EPIC-004: System Administration & Reporting

#### STORY-014
As an HR Administrator, I want to manage employee profiles (create, edit, deactivate) so that all employee data is accurate and up-to-date in the system, with the capability for future integration.

**Priority:** must-have | **Points:** 5
**Links to:** REQ-001
**Depends on:** REQ-001

**Acceptance Criteria:**
- Given I am logged in as an HR Administrator When I navigate to the employee management section Then I can add a new employee with all required fields (Full Name, Employee ID, Start Date, etc.). And I can edit existing employee details. And I can deactivate employee profiles. And the system architecture supports potential future export/API for integration with HR/Payroll systems.

**Edge Cases:**
- Duplicate employee IDs
- Data validation errors during entry

#### STORY-015
As an HR Administrator, I want to configure the system's leave types, including statutory and custom ones like Unpaid Leave, so that the system accurately reflects company policies.

**Priority:** must-have | **Points:** 3
**Links to:** REQ-007, REQ-008
**Depends on:** REQ-007, REQ-008

**Acceptance Criteria:**
- Given I am logged in as an HR Administrator When I access the leave type configuration Then I can view and edit settings for statutory leave types (Annual, Sick, etc.). And I can create new custom leave types (e.g., Unpaid Leave), defining their rules (e.g., requires approval, doesn't accrue, doesn't count towards balance). And I can configure the default notice period (e.g., 7 days) for specific leave types (like Unpaid Leave) and set whether deviations trigger alerts or require specific justifications.

**Edge Cases:**
- Modifying rules for existing custom leave types

#### STORY-016
As an HR Manager, I want to access a dashboard displaying key leave metrics (balances, upcoming leave, trends, sick leave flags) so that I can effectively monitor leave across the organization and identify potential issues.

**Priority:** must-have | **Points:** 5
**Links to:** REQ-015
**Depends on:** REQ-015

**Acceptance Criteria:**
- Given I am logged in as an HR Manager When I access the HR dashboard Then I can view a summary of current leave balances per employee and leave type. And I can see a list of upcoming approved and pending leave. And the system highlights employees flagged for excessive sick leave patterns. And I can access basic reports on leave trends (e.g., total leave taken by type).

**Edge Cases:**
- Handling large volumes of data for reporting
- Performance of dashboard loading

#### STORY-017
As HR, I need the system to maintain a comprehensive audit trail of all leave-related activities so that we have a record for compliance and troubleshooting.

**Priority:** must-have | **Points:** 3
**Links to:** REQ-014
**Depends on:** REQ-014

**Acceptance Criteria:**
- Given any action is performed within the leave management system (e.g., request submitted, approved, rejected, balance adjusted, profile updated) When the action is completed Then a record is created in the audit log detailing the action, the user who performed it, the date/time, and relevant details.

**Edge Cases:**
- Concurrent actions
- System errors during logging

---

## Traceability Matrix

| Stakeholder | Pain Point | Requirement | Stories | Status |
|---|---|---|---|---|
| Employee | Inaccurate balances, manual process burden | REQ-001 |  | Gap |
| Employee | Inaccurate balances, inability to track leave | REQ-002 | STORY-001, STORY-012 | Complete |
| Employee | Inaccurate balances, lack of visibility | REQ-003 | STORY-002 | Complete |
| Employee | Difficulty planning/knowing leave status | REQ-003 | STORY-003 | Complete |
| HR | Manual tracking, errors, compliance risk | REQ-004 | STORY-007 | Complete |
| HR | Manual tracking, errors, compliance risk | REQ-005 | STORY-008 | Complete |
| HR | Manual tracking, errors, compliance risk | REQ-006 | STORY-009 | Complete |
| HR | Manual tracking, errors, compliance risk | REQ-007 | STORY-010 | Complete |
| HR | Need for flexible policy support | REQ-008 | STORY-011 | Complete |
| HR | Need for flexible policy support | REQ-009 |  | Gap |
| HR | Administrative burden, error risk | REQ-010 |  | Gap |
| Line Manager | Inefficient review process, lack of info | REQ-011 | STORY-004, STORY-005 | Complete |
| HR | Inefficient finalization, risk of errors | REQ-012 | STORY-006 | Complete |
| HR/Employee | Need for audit trail | REQ-014 | STORY-003 | Complete |
| Employee | Need to meet policy requirements for specific leave | REQ-002 | STORY-012 | Complete |
| Employee | Need to meet policy requirements for specific leave | REQ-005 | STORY-012 | Complete |
| Employee | Need to meet policy requirements for specific leave | REQ-006 | STORY-012 | Complete |

**Gaps:** REQ-001 (Employee Data Management): Currently has no associated user stories. We need stories for HR/Admin to manage employee profiles.; REQ-009 (Unpaid Leave): Needs stories detailing how employees request and how it's approved/tracked, ensuring it doesn't affect other balances.; REQ-010 (Reporting): Needs stories for HR to access the dashboard and generate specific reports (leave balances, upcoming leave, trends, sick leave flags).

**Conflicts:** None

---
