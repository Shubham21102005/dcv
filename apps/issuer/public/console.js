// Issuer console: vanilla JS against the Hono API on the same origin.
(() => {
  const $ = (sel) => document.querySelector(sel);
  const api = async (path, opts = {}) => {
    const res = await fetch(path, {
      headers: { 'content-type': 'application/json' },
      ...opts,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    if (!res.ok) throw new Error(json.error || `${res.status} ${path}`);
    return json;
  };
  const short = (s, n = 10) => (typeof s === 'string' && s.length > 2 * n + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let toastTimer;
  const toast = (msg, isError = false) => {
    const el = $('#toast');
    el.textContent = msg;
    el.style.background = isError ? '#b91c1c' : '#1b1f24';
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
  };

  let issuer = null;

  // ---- tabs -----------------------------------------------------------------
  document.querySelectorAll('button.tab').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelectorAll('button.tab').forEach((x) => x.classList.toggle('active', x === b));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${b.dataset.tab}`));
    }),
  );

  // ---- identity ---------------------------------------------------------------
  async function loadIdentity() {
    issuer = await api('/did');
    const health = await api('/health');
    const status = await api('/status/1/info').catch(() => null);
    $('#issuer-did').textContent = issuer.did;
    $('#id-did').textContent = issuer.did;
    $('#id-address').textContent = issuer.address;
    $('#id-trusted').innerHTML = issuer.trusted
      ? `<span class="badge ok">active</span> for ${Object.entries(issuer.trustedFor).filter(([, v]) => v).map(([k]) => `<code>${esc(k)}</code>`).join(', ') || '<em>no types</em>'}`
      : '<span class="badge bad">revoked</span>';
    $('#id-status').innerHTML = status
      ? `v${status.version} · <code title="${esc(status.cid)}">${esc(short(status.cid))}</code> · hash <code>${esc(short(status.contentHash, 8))}</code>`
      : 'not published';
    $('#id-blob').innerHTML = health.blobStore === 'kubo' ? '<span class="badge ok">Kubo IPFS</span>' : '<span class="badge warn">memory (IPFS down)</span>';
  }

  // ---- issue ------------------------------------------------------------------
  $('#issue-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const subject = {
      name: f.get('name'),
      birthDate: f.get('birthDate'),
      studentId: f.get('studentId'),
      degree: { type: 'BachelorDegree', name: f.get('degreeName'), grade: f.get('grade'), awardedOn: f.get('awardedOn') },
    };
    try {
      const offer = await api('/credentials', { method: 'POST', body: { type: 'UniversityDegreeCredential', subject } });
      $('#offer').classList.remove('hidden');
      $('#offer-link').href = offer.walletLink;
      $('#offer-url').textContent = offer.offerUrl;
      $('#copy-link').onclick = () => navigator.clipboard.writeText(offer.walletLink).then(() => toast('Wallet link copied'));
      toast('Offer created - open it in the wallet');
    } catch (err) {
      toast(err.message, true);
    }
  });

  // ---- credentials table --------------------------------------------------------
  async function loadCredentials() {
    const { credentials } = await api('/credentials');
    const tbody = $('#credentials tbody');
    tbody.innerHTML = credentials.length
      ? credentials
          .map(
            (r) => `<tr>
        <td><code title="${esc(r.id)}">${esc(short(r.id, 12))}</code></td>
        <td>${esc(r.type)}</td>
        <td>${r.statusListIndex}</td>
        <td><code title="${esc(r.holderDidHash)}">${esc(short(r.holderDidHash, 8))}</code></td>
        <td>${r.revoked ? '<span class="badge bad">revoked</span>' : '<span class="badge ok">valid</span>'}</td>
        <td>
          <button class="ghost" data-preview="${esc(r.id)}">What I signed</button>
          ${r.revoked ? `<button class="ghost" data-unrevoke="${esc(r.id)}">Un-revoke</button>` : `<button class="ghost" data-revoke="${esc(r.id)}">Revoke</button>`}
        </td></tr>`,
          )
          .join('')
      : '<tr><td colspan="6" class="muted">No credentials issued yet.</td></tr>';
  }
  $('#credentials').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    try {
      if (b.dataset.preview) {
        const p = await api(`/credentials/${b.dataset.preview}/preview`);
        $('#preview').classList.remove('hidden');
        $('#preview-json').textContent = JSON.stringify(p, null, 2);
      } else if (b.dataset.revoke || b.dataset.unrevoke) {
        const id = b.dataset.revoke || b.dataset.unrevoke;
        b.disabled = true;
        const r = await api(`/credentials/${id}/${b.dataset.revoke ? 'revoke' : 'unrevoke'}`, { method: 'POST' });
        toast(`${r.revoked ? 'Revoked' : 'Un-revoked'} index ${r.statusListIndex} · status list v${r.version} anchored`);
        await Promise.all([loadCredentials(), loadIdentity()]);
      }
    } catch (err) {
      toast(err.message, true);
    }
  });

  // ---- governance -----------------------------------------------------------------
  async function loadIssuers() {
    if (!issuer) return;
    const info = await api(`/admin/issuers/${issuer.address}`);
    $('#issuers tbody').innerHTML = `<tr>
      <td><code>${esc(info.name)}</code><br /><span class="muted">${esc(info.address)}</span></td>
      <td>${info.active ? '<span class="badge ok">active</span>' : '<span class="badge bad">revoked</span>'}</td>
      <td>${info.trustedFor.UniversityDegreeCredential ? '<span class="badge ok">allowed</span>' : '<span class="badge bad">not allowed</span>'}</td>
      <td>${info.active ? `<button class="ghost" data-revoke-issuer="${info.address}">Revoke issuer</button>` : `<button class="ghost" data-reactivate-issuer="${info.address}">Reactivate</button>`}</td>
    </tr>`;
  }
  $('#issuers').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    try {
      const addr = b.dataset.revokeIssuer || b.dataset.reactivateIssuer;
      await api(`/admin/issuers/${addr}/${b.dataset.revokeIssuer ? 'revoke' : 'reactivate'}`, { method: 'POST' });
      toast(b.dataset.revokeIssuer ? 'Issuer revoked on-chain' : 'Issuer reactivated on-chain');
      await Promise.all([loadIssuers(), loadIdentity(), loadEvents()]);
    } catch (err) {
      toast(err.message, true);
    }
  });
  $('#type-form').addEventListener('submit', (e) => e.preventDefault());
  $('#type-form').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b || !issuer) return;
    e.preventDefault();
    const credentialType = new FormData($('#type-form')).get('credentialType');
    try {
      await api('/admin/types', { method: b.dataset.action === 'allow' ? 'POST' : 'DELETE', body: { issuer: issuer.address, credentialType } });
      toast(`${b.dataset.action === 'allow' ? 'Allowed' : 'Disallowed'} ${credentialType}`);
      await Promise.all([loadIssuers(), loadIdentity(), loadEvents()]);
    } catch (err) {
      toast(err.message, true);
    }
  });
  $('#register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('/admin/issuers', { method: 'POST', body: { address: f.get('address'), name: f.get('name'), metadataURI: '' } });
      toast('Issuer registered');
      await loadEvents();
    } catch (err) {
      toast(err.message, true);
    }
  });

  let lastEventCount = -1;
  async function loadEvents() {
    const { events } = await api('/admin/events');
    if (events.length === lastEventCount) return;
    lastEventCount = events.length;
    $('#events tbody').innerHTML = events
      .slice()
      .reverse()
      .map(
        (ev) => `<tr><td>${ev.blockNumber}</td><td>${esc(ev.contract)}</td><td><strong>${esc(ev.name)}</strong></td>
        <td><code>${esc(JSON.stringify(ev.args))}</code></td></tr>`,
      )
      .join('');
  }

  $('#privacy-scan').addEventListener('click', async () => {
    const out = $('#privacy-result');
    out.classList.remove('hidden');
    out.textContent = 'scanning…';
    try {
      const r = await api('/admin/privacy-scan');
      out.textContent = JSON.stringify(r, null, 2);
      toast(`${r.hits?.length ?? 0} hits over ${r.blocks} blocks / ${r.logs} logs / ${r.blobs} blobs for ${r.terms} terms`);
    } catch (err) {
      out.textContent = err.message;
      toast(err.message, true);
    }
  });

  $('#reset-demo').addEventListener('click', async () => {
    if (!confirm('Truncate the issuer ledger and republish status list v1?')) return;
    try {
      const r = await api('/admin/reset', { method: 'POST' });
      toast(`Ledger reset · status list v${r.version}`);
      $('#offer').classList.add('hidden');
      $('#preview').classList.add('hidden');
      await Promise.all([loadCredentials(), loadIdentity(), loadEvents()]);
    } catch (err) {
      toast(err.message, true);
    }
  });

  // ---- boot -----------------------------------------------------------------------
  (async () => {
    try {
      await loadIdentity();
      await Promise.all([loadCredentials(), loadIssuers(), loadEvents()]);
    } catch (err) {
      toast(err.message, true);
    }
    setInterval(() => loadEvents().catch(() => {}), 2000);
    setInterval(() => loadCredentials().catch(() => {}), 5000);
  })();
})();
