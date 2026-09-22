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
  const mark = (kind, text) => `<span class="mark ${kind}">${esc(text)}</span>`;
  let toastTimer;
  const toast = (msg, isError = false) => {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.toggle('error', isError);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 4500);
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
    const types = Object.entries(issuer.trustedFor).filter(([, v]) => v).map(([k]) => k.replace(/([a-z])([A-Z])/g, '$1 $2'));
    $('#id-trusted').innerHTML = issuer.trusted
      ? `${mark('ok', 'active')} <span class="ink-2">${types.length ? esc(types.join(', ')) : 'no credential types yet'}</span>`
      : mark('bad', 'revoked by governance');
    $('#id-status').innerHTML = status
      ? `version ${status.version}, anchored on chain as <span class="id" title="${esc(status.cid)}">${esc(short(status.cid, 12))}</span>`
      : 'not published yet';
    $('#id-blob').innerHTML = health.blobStore === 'kubo' ? 'the local IPFS node' : mark('warn', 'memory only: IPFS is not running');
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
      $('#copy-link').onclick = () => navigator.clipboard.writeText(offer.walletLink).then(() => toast('Link copied'));
      toast('Offer created. Open it in the wallet to claim it.');
    } catch (err) {
      toast(err.message, true);
    }
  });

  // ---- register table --------------------------------------------------------------
  async function loadCredentials() {
    const { credentials } = await api('/credentials');
    const tbody = $('#credentials tbody');
    tbody.innerHTML = credentials.length
      ? credentials
          .map(
            (r) => `<tr>
        <td><span class="id" title="${esc(r.id)}">${esc(short(r.id, 12))}</span></td>
        <td>${esc(r.type.replace(/([a-z])([A-Z])/g, '$1 $2'))}</td>
        <td class="num">${r.statusListIndex}</td>
        <td><span class="id" title="${esc(r.holderDidHash)}">${esc(short(r.holderDidHash, 8))}</span></td>
        <td>${r.revoked ? mark('bad', 'revoked') : mark('ok', 'valid')}</td>
        <td>
          <button class="button subtle small" data-preview="${esc(r.id)}">What was signed</button>
          ${r.revoked ? `<button class="button secondary small" data-unrevoke="${esc(r.id)}">Reinstate</button>` : `<button class="button destructive small" data-revoke="${esc(r.id)}">Revoke</button>`}
        </td></tr>`,
          )
          .join('')
      : '<tr class="quiet-row"><td colspan="6">Nothing issued yet.</td></tr>';
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
        toast(`${r.revoked ? 'Revoked' : 'Reinstated'}: bit ${r.statusListIndex} flipped, status list version ${r.version} anchored on chain.`);
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
      <td><strong>${esc(info.name)}</strong><br /><span class="id">${esc(info.address)}</span></td>
      <td>${info.active ? mark('ok', 'active') : mark('bad', 'revoked')}</td>
      <td>${info.trustedFor.UniversityDegreeCredential ? mark('ok', 'allowed') : mark('bad', 'not allowed')}</td>
      <td>${info.active ? `<button class="button destructive small" data-revoke-issuer="${info.address}">Revoke issuer</button>` : `<button class="button secondary small" data-reactivate-issuer="${info.address}">Reactivate</button>`}</td>
    </tr>`;
  }
  $('#issuers').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    try {
      const addr = b.dataset.revokeIssuer || b.dataset.reactivateIssuer;
      await api(`/admin/issuers/${addr}/${b.dataset.revokeIssuer ? 'revoke' : 'reactivate'}`, { method: 'POST' });
      toast(b.dataset.revokeIssuer ? 'Issuer revoked on chain. Verifiers will reject its credentials from the next block.' : 'Issuer reactivated on chain.');
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
      toast(`${b.dataset.action === 'allow' ? 'Allowed' : 'Disallowed'} ${credentialType} for this issuer.`);
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
      toast('Issuer registered.');
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
        (ev) => `<tr><td class="num">${ev.blockNumber}</td><td>${esc(ev.contract)}</td><td><strong>${esc(ev.name)}</strong></td>
        <td>${esc(JSON.stringify(ev.args))}</td></tr>`,
      )
      .join('');
  }

  $('#privacy-scan').addEventListener('click', async () => {
    const out = $('#privacy-result');
    out.classList.remove('hidden');
    out.textContent = 'Scanning every block, log and pin…';
    try {
      const r = await api('/admin/privacy-scan');
      out.textContent = JSON.stringify(r, null, 2);
      toast(`${r.hits.length} hits over ${r.blocks} blocks, ${r.logs} logs and ${r.blobs} blobs for ${r.terms} terms.`);
    } catch (err) {
      out.textContent = err.message;
      toast(err.message, true);
    }
  });

  $('#reset-demo').addEventListener('click', async () => {
    if (!confirm('Empty the register and publish a fresh, all-clear revocation list?')) return;
    try {
      const r = await api('/admin/reset', { method: 'POST' });
      toast(`Register emptied. Revocation list version ${r.version} anchored.`);
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
