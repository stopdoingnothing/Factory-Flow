// Shape of the import report returned by POST /api/backup/import and /api/backup/bootstrap-import.
// Lives in shared/ because both the server (server/backup-import.ts) and the two restore UIs
// (ModeSelect.tsx, admin/DatabaseBackupSection.tsx) need it.

export type TableResult = {
  /** Rows present in the backup file for this table. */
  attempted: number;
  /** Rows actually written to the database. */
  inserted: number;
  /**
   * Rows already present and therefore left alone. Restores are additive, so re-importing the
   * same backup is expected to skip everything rather than fail.
   */
  skipped: number;
  /** Rows rejected by the database for any other reason. */
  failed: number;
  /** Up to 10 sample error messages, for diagnosing a systemic failure. */
  errors: string[];
};

export type ImportReport = {
  tables: Record<string, TableResult>;
  totalInserted: number;
  totalSkipped: number;
  totalFailed: number;
  /**
   * Human-readable notes about data the importer had to adjust — e.g. roles derived from a
   * pre-2.0 backup, or company references cleared because the backup contained no companies.
   * Surfaced to the operator; these are not errors but they do mean the restore is not verbatim.
   */
  warnings: string[];
};

export type ImportResponse = {
  success: boolean;
  message: string;
  /** Rows inserted per table. Kept for backwards compatibility with older clients. */
  importedCounts: Record<string, number>;
  report: ImportReport;
  /** Only present on bootstrap-import: restored accounts that hold the admin role. */
  adminAccounts?: Array<{ id: string; name: string; email: string | null }>;
};
