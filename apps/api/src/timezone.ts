/**
 * ERP datetimes have no zone. Running the process in UTC makes every driver (pg, mysql2,
 * tedious, oracledb) read them as UTC wall-clock values, which the template helpers format
 * in UTC — so a document dated 2026-11-09 00:00 is shown as 9 Nov whatever the host zone is.
 * Imported first by both entrypoints.
 */
process.env.TZ = 'UTC';
