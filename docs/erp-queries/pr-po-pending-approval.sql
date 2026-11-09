-- Outbox query: PR / PO not yet approved (SQL Server)
-- Source: ERP team query (2026-11-09, rev 3 adds IsComplete <> 1 AND IsClosed <> 1), rewritten as a single SELECT so it passes SqlValidator
-- (no temp table / DROP / multi-statement). Row filter is kept identical to the original script:
--   * documents with IsApproved = 0 AND IsComplete <> 1 AND IsClosed <> 1 (waiting or checked; NULL IsComplete/IsClosed is excluded as in the original)
--   * DeptCode not blank
--   * recipients: every Z_MaIL row of the document's department
-- Only technical addition: rows without an email are skipped (nothing to send to).
--
-- erp_ref_id = <doc type>:<doc no>:<email> so each recipient gets exactly one mail per document
-- (unique (connectionId, erpRefId) blocks re-sending on every 5-minute poll).
-- Column aliases become Handlebars variables in the template.

SELECT
    d.doc_type + ':' + d.order_no + ':' + LOWER(LTRIM(RTRIM(m.Email))) AS erp_ref_id,
    LTRIM(RTRIM(m.Email))                                             AS to_email,
    d.doc_type,
    d.status,
    d.order_no,
    d.doc_date,
    d.supplier_code,
    d.supplier_name,
    d.dept_code,
    d.department,
    d.approved,
    d.approved_by,
    m.Approved                                                        AS mail_approved
FROM (
    SELECT
        'PR' AS doc_type,
        CASE
            WHEN ISNULL(S.IsClosed, 0) = 1 THEN N'ยกเลิกเอกสาร'
            WHEN ISNULL(S.IsComplete, 0) = 1 THEN N'ปิดงาน'
            WHEN ISNULL(S.IsApproved, 0) = 1 THEN N'อนุมัติเอกสาร'
            WHEN ISNULL(S.IsCheck, 0) = 1 THEN N'ตรวจสอบเอกสาร'
            ELSE N'รอการอนุมัติ'
        END                             AS status,
        S.PRNo                          AS order_no,
        CONVERT(DATE, S.PRDate)         AS doc_date,
        ''                              AS supplier_code,
        ''                              AS supplier_name,
        ISNULL(S.DeptCode, ' ')         AS dept_code,
        ISNULL(S.Department, ' ')       AS department,
        ISNULL(S.IsApproved, 0)         AS approved,
        ISNULL(S.IsApprovedBy, ' ')     AS approved_by
    FROM PurchaseRequisitionHdr S WITH (NOLOCK)
    WHERE S.IsApproved = 0 AND S.IsComplete <> 1 AND S.IsClosed <> 1

    UNION ALL

    SELECT
        'PO' AS doc_type,
        CASE
            WHEN ISNULL(S.IsClosed, 0) = 1 THEN N'ยกเลิกเอกสาร'
            WHEN ISNULL(S.IsComplete, 0) = 1 THEN N'ปิดงาน'
            WHEN ISNULL(S.IsApproved, 0) = 1 THEN N'อนุมัติเอกสาร'
            WHEN ISNULL(S.IsCheck, 0) = 1 THEN N'ตรวจสอบเอกสาร'
            ELSE N'รอการอนุมัติ'
        END                             AS status,
        S.PONumber                      AS order_no,
        CONVERT(DATE, S.PODate)         AS doc_date,
        S.SupplierCode                  AS supplier_code,
        S.SupplierName                  AS supplier_name,
        ISNULL(S.DeptCode, ' ')         AS dept_code,
        ISNULL(S.Department, ' ')       AS department,
        ISNULL(S.IsApproved, 0)         AS approved,
        ISNULL(S.Appr_By, ' ')          AS approved_by
    FROM PurchaseOrderHdr S WITH (NOLOCK)
    WHERE S.IsApproved = 0 AND S.IsComplete <> 1 AND S.IsClosed <> 1
) d
INNER JOIN Z_MaIL m WITH (NOLOCK)
    ON m.DeptCode = d.dept_code
WHERE d.dept_code <> ' '
  AND LTRIM(RTRIM(ISNULL(m.Email, ''))) <> ''
