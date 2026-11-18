import type { CrmClient, CrmProgramRow } from './crm';
import { computeProgram } from './program';

/** Fila de `programs` a partir de una fila del CRM (pura, compartida por la sincronización y los tests). */
export function programRecord(clientId: string, p: CrmProgramRow, extraIssues: string[] = []) {
  const s = computeProgram({ startDate: p.startDate, contractedRaw: p.contractedRaw, crmEndDate: p.crmEndDate, crmStatusText: p.crmStatusText });
  return {
    client_id: clientId, crm_row: p.row, crm_row_hash: p.hash,
    program_key: `${clientId}:${p.startDate ?? 'sin-fecha:' + p.row}`, start_date: p.startDate,
    contracted_raw: p.contractedRaw, contracted_months: s.months, contracted_extra_raw: p.contractedRaw?.split('+')[1]?.trim() ?? null,
    crm_end_date: s.crmEndValid, computed_end_date: s.computedEnd, crm_status_text: p.crmStatusText,
    report_url: p.reportUrl, contract_url: p.contractUrl, onboarding_url: p.onboardingUrl, call_urls: p.callUrls,
    data_issues: [...p.issues, ...s.issues, ...extraIssues],
  };
}

export function clientRecord(c: CrmClient) {
  const last = c.programs[c.programs.length - 1];
  const st = computeProgram({ startDate: last.startDate, contractedRaw: last.contractedRaw, crmEndDate: last.crmEndDate, crmStatusText: last.crmStatusText });
  return {
    email: c.email, full_name: c.fullName, name_key: c.programs[0].nameKey, phone: last.phone,
    status: last.abandonNote ? 'abandoned' : st.status === 'unknown' ? 'active' : st.status,
    success_case_url: c.programs.map((p) => p.successUrl).filter(Boolean).pop() ?? null,
  };
}
