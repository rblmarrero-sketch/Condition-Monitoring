/* A phone that has synced with the fleet holds its history (cm_hist, cm_team).
   Since build 604 the readiness card is red without it, because offline the
   Due list and the history would be empty. Suites that test something else on
   a "complete, ready" phone add this init script so their phone is one. The
   1C schedule is fetched by the app itself at boot. */
module.exports = () => { try { if (!localStorage.getItem('cm_team')) {
  localStorage.setItem('cm_hist', JSON.stringify({ 'MP|TK146': { d: '2026-11-01' } }));
  localStorage.setItem('cm_team', JSON.stringify([{ t: 'MP', u: 'TK146', d: '2026-11-01', g: 1, by: 'B. Ivanov' }])); } } catch (e) {} };
