# 06 — Key Workflows

## Overview

This document traces the six most complex end-to-end workflows in the system:
1. Employee submitting and getting a leave request approved
2. Monthly accrual run
3. Attendance clock-in via the kiosk
4. New employee onboarding
5. Employee termination
6. Database backup and restore

---

## 1. Leave Request: Submission to Approval

### Actors
- **Employee** (submission)
- **Manager** (recommendation stage — recommends but does not approve)
- **HR** (first decision stage — can override manager recommendation)
- **MD / Director** (final approver)

### Manager recommendation vs. approval

The manager's role is to **recommend**, not to approve or reject. Their decision (`recommended` / `not_recommended`) always forwards the request to HR (or MD if the HR stage is disabled). HR can see the manager's recommendation and notes, and can override a "not recommended" decision. Only HR and MD can finalize a rejection.

### Full sequence

```mermaid
sequenceDiagram
    participant E as Employee
    participant Client as React App
    participant API as Express API
    participant DB as PostgreSQL
    participant Email as Postmark

    E->>Client: Fills leave request form
    Client->>API: POST /api/leave-requests
    API->>DB: Validate: start ≤ today+12months (else 400)
    API->>DB: Check leave balance (total + carryOver - taken - pending >= days)
    Note over API: Annual Leave shortfall → run projection;<br/>allow with adminNote instead of hard 400
    API->>DB: Count business days (exclude weekends + public holidays)
    API->>DB: INSERT leaveRequests (status=pending_manager)
    API->>DB: UPDATE leaveBalances SET pending += days
    API->>Email: Send "new request" email to manager
    API-->>Client: 201 Created

    Manager->>Client: Opens pending requests in dashboard
    Client->>API: GET /api/leave-requests?status=pending_manager
    Manager->>Client: Submits recommendation with notes
    Client->>API: POST /api/leave-requests/:id/manager-decision
    API->>DB: UPDATE leaveRequests SET status=pending_hr, managerDecision, managerNotes
    API->>Email: Notify HR (prefixed [NOT RECOMMENDED] if applicable)
    API-->>Client: 200 OK

    HR->>Client: Reviews request — sees manager recommendation and notes
    Note over Client: Red warning banner shown if manager did not recommend
    HR->>Client: Approves or rejects
    Client->>API: POST /api/leave-requests/:id/hr-decision
    API->>DB: UPDATE leaveRequests SET status=pending_md (or rejected)
    API->>Email: Notify MD (if approved) or employee (if rejected)
    API-->>Client: 200 OK

    MD->>Client: Final approval
    Client->>API: POST /api/leave-requests/:id/md-decision {decision: "approved"}
    API->>DB: UPDATE leaveRequests SET status=approved, finalizedById, finalizedAt
    API->>DB: UPDATE leaveBalances SET taken += days, pending -= days
    API->>Email: Send approval email to employee
    API-->>Client: 200 OK
```

### Balance recalculation on rejection
```sql
UPDATE leave_balances SET pending = pending - :days WHERE user_id = :userId AND leave_type = :leaveType
```
The balance is fully restored — the employee can resubmit.

---

## 2. Monthly Accrual Run

The accrual engine fires on the **1st of each month** and credits leave earned in the **prior calendar month**.

```mermaid
flowchart TD
    A["1st of month\ndaily check fires"] --> B["Identify eligible employees\n(active at any point in prior month,\nincludes recently terminated)"]
    B --> C["For each employee:"]
    C --> D["Determine RATE\n(override or tier lookup)"]
    D --> E["Query pausing leave days\nin prior month"]
    E --> F["active_days = days_employed - pausing_days"]
    F --> G["Check idempotency\n(leaveAccrualRecords lookup)"]
    G -->|"Already exists"| H["Skip — idempotent"]
    G -->|"Not yet processed"| I["Credit annual leave\nrate × (active_days / total_days)"]
    I --> J["Write leaveAccrualRecords\n(monthly_accrual or pro_rated_accrual)"]
    J --> K{"In graduated\nsick period?"}
    K -->|Yes| L["days_worked = scheduled - leave_taken\nUpdate cumulative counter\nCredit if floor/26 increased"]
    K -->|No| M{"6-month\ntransition due?"}
    L --> M
    M -->|Yes| N["Set sick balance =\nfull_entitlement - days_taken\nMark graduated inactive"]
    M -->|No| O{"Sick 36-month\nboundary passed?"}
    N --> O
    O -->|Yes| P["Reset sick balance to full entitlement\nAdvance sick_cycle_start_date"]
    O -->|No| Q{"Last month\nof annual cycle?"}
    P --> Q
    Q -->|Yes| R["Move balance → carryOverDays\nZero total\nSet carryOverExpiry"]
    Q -->|No| S["Check forfeiture warnings\n(60-day / 30-day / expired)"]
    R --> S
    S --> T["Process custom monthly\nleave types"]
    T --> U["Settle past approved\nleave requests"]
```

**Idempotency guarantee:** `writeAccrualRecord()` checks for an existing row in `leaveAccrualRecords` with matching `(employee_id, leave_type, accrual_period, event_type)` before inserting. If a record exists, the event is skipped. Running the engine twice for the same month produces no duplicate credits.

---

## 3. Attendance Clock-In (Face Recognition Kiosk)

### Actors
- **Employee** (standing in front of kiosk)
- **Kiosk** (shared device running `/attendance-kiosk`)

### Sequence

```mermaid
sequenceDiagram
    participant Cam as Webcam
    participant Browser as Kiosk Browser
    participant FaceAPI as face-api.js (local)
    participant API as Express API
    participant DB as PostgreSQL

    Browser->>API: GET /api/users/face-descriptors
    API->>DB: SELECT descriptors from users + faceDescriptors tables
    API-->>Browser: Array of {userId, descriptor[128]}

    loop Every video frame
        Browser->>Cam: Capture frame
        Browser->>FaceAPI: detectSingleFace(frame).withFaceLandmarks().withFaceDescriptor()
        FaceAPI-->>Browser: 128-dimensional float32 array
        Browser->>Browser: Find nearest descriptor (Euclidean distance)
        alt Distance below threshold
            Browser->>Browser: Display matched employee name
        end
    end

    Employee->>Browser: Confirms or auto-matches
    Browser->>API: POST /api/attendance {userId, type: "in"|"out", method: "face", photoUrl}
    API->>DB: SELECT last record for userId to determine in/out
    API->>DB: INSERT attendanceRecords
    API->>DB: Check for infringement (late arrival, etc.)
    API-->>Browser: 200 OK with clock status
    Browser->>Browser: Display confirmation screen
```

### Clock-in vs Clock-out logic
The API determines whether an attendance record is `in` or `out` by checking the employee's most recent record:
- If last record was `out` (or no record exists) → this is a clock-`in`
- If last record was `in` → this is a clock-`out`

The client can override this by explicitly passing `type`.

---

## 4. New Employee Onboarding

Admin-driven workflow. Leave balances are provisioned immediately on user creation. If `startDate` is in the past, a backdated accrual backfill runs automatically to credit all months already elapsed.

```mermaid
flowchart TD
    A["Admin creates user\nPOST /api/users"] --> B["Validate with Zod\nassign employee ID"]
    B --> C{"Has startDate\nand not excludeFromLeave?"}
    C -->|Yes| D["Lookup accrual rate tiers\nDetermine RATE for 0 months service"]
    D --> E["Calculate first-month pro-ration\nRATE × (days_remaining / days_in_month)"]
    E --> F["Create leaveBalances:\nAnnual Leave = pro-rated amount\nSick Leave = 0\nFamily Responsibility = 0\nStatutory event leaves = fixed entitlements"]
    F --> G["Create sickLeaveTracking row\n(graduated_accrual_active=true,\ncumulative_days_worked=0)"]
    G --> G2{"startDate before\ncurrent month?"}
    G2 -->|Yes| G3["backfillUserAccrual() — async\nIterates each completed month:\n• Credits annual leave at correct tier rate\n• Progresses graduated sick accrual\n• Applies 6-month sick transition if due\n• Grants FRL if now eligible\nAll writes are idempotent"]
    G2 -->|No| H2["No backfill needed"]
    C -->|No| H["Skip leave provisioning"]
    G3 --> I["Admin captures face photos\nMultiAngleFaceCapture component"]
    H2 --> I
    H --> I
    I --> J["POST face descriptors → faceDescriptors table"]
    J --> K["Custom leave rules evaluated\non next startup or manual trigger"]
    K --> L["Employee can log in + use kiosk"]
```

**Backdated employees:** When an employee's `startDate` pre-dates the current month, `backfillUserAccrual()` (in `server/leave-accrual.ts`) iterates every completed month and credits accrual for each. This ensures an employee added months after their actual start date receives the correct balance immediately, without waiting for the monthly run. The backfill uses `writeAccrualRecord()`, so re-running it or overlapping with a regular monthly run produces no duplicates.

**Note on sick leave:** Sick leave starts at 0. During the first 6 months it accrues at 1 day per 26 working days (tracked via the `sickLeaveTracking` row). For backfilled months, the full scheduled working days are used since no actual leave records exist for those periods. FRL starts at 0 until the 4-month eligibility gate is reached.

---

## 5. Employee Termination

When an employee is offboarded, the system immediately calculates a final pro-rated accrual for the partial month.

```mermaid
sequenceDiagram
    participant Admin
    participant API as Express API
    participant DB as PostgreSQL
    participant Engine as leave-accrual.ts
    participant Email as Postmark

    Admin->>API: PATCH /api/users/:id {terminationDate: "2026-04-15"}
    API->>DB: UPDATE users SET termination_date = "2026-04-15"
    Note over API: terminationDate newly set — trigger settlement
    API->>Engine: processTerminationSettlement(userId, "2026-04-15")
    Engine->>DB: Lookup accrual rate tiers
    Engine->>Engine: Determine RATE (override or tier)
    Engine->>DB: Query pausing leave days in April
    Engine->>Engine: active_days = days employed in April (1–15) - pausing days
    Engine->>Engine: accrual = RATE × (active_days / 30)
    Engine->>DB: Check idempotency (leaveAccrualRecords)
    Engine->>DB: UPDATE leaveBalances SET total += accrual
    Engine->>DB: INSERT leaveAccrualRecords (termination_settlement)
    Engine->>Email: Notify all HR users with final balance details
    API-->>Admin: 200 OK (settlement runs async)
```

After termination:
- The employee's `leaveBalances` reflect the final post-settlement balance
- The employee is excluded from future monthly accrual runs (`terminationDate < first_day_of_prior_month`)
- Remaining balance is available for payroll payout calculation (payout itself is out of scope)

---

## 6. Database Backup and Restore

### Automated backups (Docker)
The `backup` service in `docker-compose.yml` runs a continuous loop:
```bash
# Runs every 6 hours (4x/day). Keeps the last 90 days of dumps.
while true; do
  FILENAME=/backups/factoryflow_$(date +%Y%m%d_%H%M%S).sql.gz
  pg_dump -h db -U factoryflow factoryflow | gzip > $FILENAME
  find /backups -name 'factoryflow_*.sql.gz' -mtime +90 -delete
  sleep 21600
done
```
Backups land on the host at `./data/backups/` as gzipped SQL files.

### Manual JSON backup (Admin UI)
The `DatabaseBackupSection` calls `GET /api/backup/export` which:
1. Queries every table
2. Serialises to a JSON structure
3. Returns as a downloadable file

### Admin restore (JSON)
`POST /api/backup/import` accepts a JSON backup file and:
1. Validates the file structure and reports record counts before executing
2. Iterates each table's records
3. Inserts records that don't already exist (checked by primary key)
4. Never overwrites existing records — purely additive
5. Returns a count summary: `{users: 45, leaveRequests: 312, ...}`

Requires an authenticated admin session.

### Bootstrap restore (home page, no login)
For first-time setup on an empty database, the ModeSelect home page (`/`) provides a bootstrap restore modal that:
1. Accepts a JSON backup file
2. Calls `POST /api/backup/bootstrap-validate` to verify the DB is empty and the file is valid
3. If valid, calls `POST /api/backup/import` to load the backup
4. Does not require a login session — only works when the database has no users
