-- Outbox query: PR / PO waiting for approval (SQL Server)
-- Source: ERP team query (2026-11-09), rewritten as a single SELECT so it passes SqlValidator
-- (no temp table / DROP / multi-statement).
--
-- Agreed rules:
--   * notify only status "รอการอนุมัติ": not approved, not checked, not completed, not closed
--   * recipients: Z_MaIL rows of the document's department with Approved = 1
--   * one row = one mail; erp_ref_id = <doc type>:<doc no>:<email> so each approver gets
--     exactly one mail per document (unique (connectionId, erpRefId) blocks re-sending every 5 min)
-- Column aliases become Handlebars variables in the template.

SELECT
    d.doc_type + ':' + d.order_no + ':' + LOWER(LTRIM(RTRIM(m.Email))) AS erp_ref_id,
    LTRIM(RTRIM(m.Email))                                             AS to_email,
    d.doc_type,
    d.order_no,
    d.doc_date,
    d.supplier_code,
    d.supplier_name,
    d.dept_code,
    d.department,
    N'รอการอนุมัติ'                                                     AS status
FROM (
    SELECT
        'PR'                       AS doc_type,
        S.PRNo                     AS order_no,
        CONVERT(DATE, S.PRDate)    AS doc_date,
        ''                         AS supplier_code,
        ''                         AS supplier_name,
        S.DeptCode                 AS dept_code,
        ISNULL(S.Department, '')   AS department
    FROM PurchaseRequisitionHdr S WITH (NOLOCK)
    WHERE S.IsApproved = 0
      AND ISNULL(S.IsCheck, 0) = 0
      AND ISNULL(S.IsComplete, 0) = 0
      AND ISNULL(S.IsClosed, 0) = 0

    UNION ALL

    SELECT
        'PO'                       AS doc_type,
        S.PONumber                 AS order_no,
        CONVERT(DATE, S.PODate)    AS doc_date,
        ISNULL(S.SupplierCode, '') AS supplier_code,
        ISNULL(S.SupplierName, '') AS supplier_name,
        S.DeptCode                 AS dept_code,
        ISNULL(S.Department, '')   AS department
    FROM PurchaseOrderHdr S WITH (NOLOCK)
    WHERE S.IsApproved = 0
      AND ISNULL(S.IsCheck, 0) = 0
      AND ISNULL(S.IsComplete, 0) = 0
      AND ISNULL(S.IsClosed, 0) = 0
) d
INNER JOIN Z_MaIL m WITH (NOLOCK)
    ON m.DeptCode = d.dept_code
WHERE LTRIM(RTRIM(ISNULL(d.dept_code, ''))) <> ''
  AND m.Approved = 1
  AND LTRIM(RTRIM(ISNULL(m.Email, ''))) <> ''
