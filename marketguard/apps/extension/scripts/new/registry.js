// scripts/new/registry.js
(() => {
  const MG = (window.MG = window.MG || {});

  const RE_SEBI_REG = /\bIN[AHZP]\d{8}\b/i;
  const RE_PAN      = /\b[A-Z]{5}\d{4}[A-Z]\b/i;
  const RE_UPI      = MG.UPI_REGEX || /\b[a-z0-9._-]+@[a-z]{2,}\b/i;

  MG.classifyQuery = function classifyQuery(text) {
    const t = String(text || '').trim();
    if (!t) return null;
    if (RE_SEBI_REG.test(t)) return { kind: 'reg_no', value: t.toUpperCase() };
    if (RE_PAN.test(t))      return { kind: 'pan',    value: t.toUpperCase() };
    if (RE_UPI.test(t))      return { kind: 'upi',    value: t.toLowerCase() };
    return { kind: 'name', value: t };
  };

  MG.registryVerify = function registryVerify(params) {
    return MG.services.registryVerify(params);
  };

  MG.summarizeMatches = function summarizeMatches(json) {
    const n = Number(json?.count || json?.matches?.length || 0);
    if (!n) return 'No match';
    const first = (json.matches && json.matches[0]) || {};
    const who = first?.full_name || first?.username || first?.upi_id || first?.sebi_reg_no || 'match';
    const typ = first?.intermediary_type ? ` • ${first.intermediary_type}` : '';
    const risk = first?.risk?.level ? ` • ${first.risk.level}` : '';
    return `${n} match${n>1?'es':''}: ${who}${typ}${risk}`;
  };
})();


