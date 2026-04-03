# 06 — Key Workflows

## Overview

This document traces the three most complex end-to-end workflows in the system:
1. Employee submitting and getting a leave request approved
2. Attendance clock-in via the kiosk
3. Face recognition authentication

---

## 1. Leave Request: Submission to Approval

### Actors
- **Employee** (worker)
- **Manager** (recommendation stage)
- **HR Admin** (first decision stage — can override manager recommendation)
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
    API->>DB: Check leave balance (total - taken - pending >= days)
    API->>DB: Count business days (exclude weekends + public holidays)
    API->>DB: INSERT leaveRequests (status=pending_manager)
    API->>DB: UPDATE leaveBalances SET pending += days
    API->>Email: Send "new request" email to manager
    API-->>Client: 201 Created

    Manager->>Client: Opens pending requests in admin dashboard
    Client->>API: GET /api/leave-requests?status=pending_manager
    Manager->>Client: Submits recommendation (recommended / not_recommended) with notes
    Client->>API: POST /api/leave-requests/:id/manager-decision
    API->>DB: UPDATE leaveRequests SET status=pending_hr, managerDecision, managerNotes
    API->>Email: Notify HR (email prefixed [NOT RECOMMENDED] if applicable)
    API-->>Client: 200 OK

    HR->>Client: Reviews request — sees manager recommendation and notes
    Note over Client: Red warning banner shown if manager did not recommend
    HR->>Client: Approves or rejects (can override manager recommendation)
    Client->>API: POST /api/leave-requests/:id/hr-decision
    API->>DB: UPDATE leaveRequests SET status=pending_md (or rejected)
    API->>Email: Notify MD (if approved) or employee (if rejected)
    API-->>Client: 200 OK

    MD->>Client: Final approval
    Client->>API: POST /api/leave-requests/:id/md-decision {approved: true}
    API->>DB: UPDATE leaveRequests SET status=approved
    API->>DB: UPDATE leaveBalances SET taken += days, pending -= days
    API->>Email: Send approval email to employee
    API-->>Client: 200 OK
```

### Balance recalculation on rejection
If HR or MD rejects the request:
```sql
UPDATE leave_balances SET pending = pending - :days WHERE user_id = :userId AND leave_type = :leaveType
```
The balance is fully restored — the employee can resubmit.

---

## 2. Attendance Clock-In (Face Recognition Kiosk)

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
    API->>DB: SELECT id, faceDescriptor FROM users + faceDescriptors
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

### Auto clock-out
`POST /api/attendance/auto-reset` (called by a scheduled job or admin manually) inserts a clock-`out` record for any employee who clocked in but has not clocked out by a configured end-of-day time.

---

## 3. Admin Password Reset

```mermaid
sequenceDiagram
    participant Admin as Admin
    participant Client as React App
    participant API as Express API
    participant DB as PostgreSQL
    participant Email as Postmark

    Admin->>Client: Clicks "Forgot password" on /admin login
    Client->>API: POST /api/auth/request-reset {email}
    API->>DB: SELECT user WHERE email = :email
    API->>DB: INSERT passwordResetTokens (token, userId, expiresAt = now + 1h)
    API->>Email: Send reset link with token
    API-->>Client: 200 OK (even if email not found — no enumeration)

    Admin->>Client: Clicks link in email → /reset-password?token=...
    Client->>API: POST /api/auth/reset-password {token, newPassword}
    API->>DB: SELECT passwordResetTokens WHERE token = :token AND expiresAt > now
    API->>DB: UPDATE users SET password = bcrypt(newPassword)
    API->>DB: DELETE passwordResetTokens WHERE token = :token
    API-->>Client: 200 OK
    Client->>Client: Redirect to /admin login
```

---

## 4. New Employee Onboarding

This workflow is admin-driven, not employee-driven.

```mermaid
flowchart TD
    A[Admin creates user\nPOST /api/users] --> B[System generates\nemployee ID]
    B --> C{Send credentials?}
    C -->|Yes| D[POST /api/users/:id/resend-credentials\nPostmark email with ID + temp password]
    C -->|No| E[Admin shares ID manually]
    D --> F[Admin captures face photo\nWebcamCapture component]
    E --> F
    F --> G[POST face descriptor\nstored in faceDescriptors table]
    G --> H[BCEA leave balances\nauto-provisioned from startDate]
    H --> I[Employee can now\nlog in + use kiosk]
```

Leave balances are provisioned by `POST /api/leave-balances/recalculate-sa` or triggered automatically when a user is created with BCEA-applicable settings.

---

## 5. Database Backup and Restore

### Automated backups (Docker)
The `backup` service in `docker-compose.yml` runs on the same network as the database:
```bash
# Runs hourly via cron inside the backup container
pg_dump -h db -U postgres factory_flow > /backups/backup_$(date +%Y%m%d_%H%M%S).sql
# Deletes files older than 7 days
find /backups -name "*.sql" -mtime +7 -delete
```
Backups land on the host at `./data/backups/`.

### Manual JSON backup (Admin UI)
The admin `DatabaseBackupSection` calls a server endpoint that:
1. Queries every table
2. Serialises to a JSON structure
3. Returns as a downloadable file

### Restore
The restore endpoint accepts a JSON backup file and:
1. Iterates each table's records
2. Inserts records that don't already exist (checked by primary key)
3. Never overwrites existing records — purely additive
4. Returns a count summary: `{users: 45, leaveRequests: 312, ...}`
