import { CANCELLATION_LABEL, offerCopy, type Arm } from './experiment.js';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!);
}

export function renderCancelPage(arm: Arm, uid: string): string {
  const safeUid = escapeHtml(uid);
  const offer = offerCopy(arm);
  const offerButton = arm === 'pause'
    ? '<button class="choice" type="button" data-action="accept_pause">Pause for one month</button>'
    : arm === 'discount'
      ? '<button class="choice" type="button" data-action="accept_discount">Take the discount</button>'
      : '';
  const offerText = offer ? `<p>${offer}</p>${offerButton}` : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Manage subscription</title><style>
body{font:16px system-ui,sans-serif;max-width:38rem;margin:3rem auto;padding:0 1rem;color:#172033}
.choices{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1.25rem}
.choice{min-height:48px;padding:.75rem 1rem;border:2px solid #344563;border-radius:.4rem;background:#fff;color:#172033;font:inherit;font-weight:600;cursor:pointer}
.choice:focus-visible{outline:3px solid #005fcc;outline-offset:2px}
#status{min-height:1.5em}
</style></head><body><main><h1>Manage your subscription</h1>
${offerText}
<p>You can cancel your subscription now.</p><div class="choices">
<button class="choice" type="button" data-action="cancel" aria-label="${escapeHtml(CANCELLATION_LABEL[arm])}">${escapeHtml(CANCELLATION_LABEL[arm])}</button>
${arm === 'control' ? '<button class="choice" type="button" data-action="keep">Keep subscription</button>' : ''}
</div><p id="status" role="status" aria-live="polite"></p></main>
<script>
const uid=${JSON.stringify(uid)};
document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',async()=>{
  const response=await fetch('/account/cancel/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({uid,action:button.dataset.action})});
  document.querySelector('#status').textContent=response.ok?'Your choice has been recorded.':'This flow has already ended or the action is invalid.';
}));
</script></body></html>`;
}
