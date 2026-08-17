(() => {
  'use strict';

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const INTRO_PLACEHOLDER = 'Add a short description for attendees — click the pencil or use Set meeting options.';
  const page = document.body.dataset.page;

  document.getElementById('footer-tz')?.replaceChildren(document.createTextNode(tz));

  if (page === 'home') {
    initHome();
  } else if (page === 'scheduler') {
    initScheduler(document.body.dataset.slug);
  }

  function initHome() {
    document.getElementById('create-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      try {
        await apiPost({ action: 'create', slug: slugify(data.get('slug')), title: String(data.get('title') || '').trim() });
        window.location.href = meetingUrl(slugify(data.get('slug')));
      } catch (err) {
        alert(err.message);
      }
    });
  }

  async function initScheduler(slug) {
    const root = document.getElementById('app');
    const state = {
      slug,
      meet: null,
      attendeeId: localStorage.getItem(attendeeKey(slug)) || '',
      selectedSlots: new Set(),
      selectedLocations: new Set(),
      viewStart: startOfDay(new Date()),
      activeTab: 'calendar',
      sortOrder: 'date',
      dragging: false,
      dragSelect: true,
      editingIntro: null,
    };

    try {
      state.meet = await fetchMeet(slug);
      const explicit = tabFromUrl();
      state.activeTab = explicit || (state.meet.attendees.length ? 'calendar' : 'organiser');
      restoreAttendeeSelections(state);
      render(root, state);
    } catch (err) {
      root.innerHTML = `<div class="error">${escapeHtml(err.message)}</div>`;
    }

    root.addEventListener('click', (e) => handleClick(e, root, state));
    root.addEventListener('change', (e) => handleChange(e, root, state));
    root.addEventListener('submit', (e) => handleSubmit(e, root, state));
    root.addEventListener('pointerdown', (e) => handlePointerDown(e, root, state));
    root.addEventListener('pointerover', (e) => handlePointerOver(e, root, state));
    window.addEventListener('pointerup', () => { state.dragging = false; });
    window.addEventListener('resize', () => { if (state.meet) render(root, state); });
  }

  function tabFromUrl() {
    const t = new URLSearchParams(window.location.search).get('view');
    return ['calendar', 'times', 'after', 'organiser'].includes(t) ? t : null;
  }

  function meetingTz(m) {
    return (m.timezone && m.timezone.trim()) ? m.timezone.trim() : tz;
  }

  /** Wall clock in meeting TZ → UTC ISO (for slot keys). */
  function wallTimeToUtcIso(y, mo, d, h, mi, timeZone) {
    let t = Date.UTC(y, mo - 1, d, h, mi);
    for (let i = 0; i < 4; i++) {
      const p = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
          timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        }).formatToParts(new Date(t)).map((x) => [x.type, x.value])
      );
      t += Date.UTC(y, mo - 1, d, h, mi) - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    }
    return new Date(t).toISOString();
  }

  function slotIsoFromMeetingDate(dateStr, hm, timeZone) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    return wallTimeToUtcIso(y, mo, d, hm.hour, hm.minute, timeZone);
  }

  function formatSlotInTz(iso, timeZone) {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone,
    });
  }

  function formatDayHeadDateStr(dateStr, timeZone) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    return new Date(wallTimeToUtcIso(y, mo, d, 12, 0, timeZone)).toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', timeZone,
    });
  }

  function formatWallHour(hm) {
    return `${String(hm.hour).padStart(2, '0')}:${String(hm.minute).padStart(2, '0')}`;
  }

  function setTab(state, tab) {
    state.activeTab = tab;
    history.replaceState(null, '', meetingUrl(state.slug, tab));
  }

  function meetingUrl(slug, view) {
    const base = `${window.location.origin}${window.location.pathname.replace(/\/$/, '')}`;
    const v = view && view !== 'calendar' ? `&view=${encodeURIComponent(view)}` : '';
    return `${base}/?=${encodeURIComponent(slug)}${v}`;
  }

  function attendeeKey(slug) { return `meet_attendee_${slug}`; }
  function slotsKey(slug, id) { return `meet_slots_${slug}_${id}`; }

  function restoreAttendeeSelections(state) {
    if (!state.attendeeId) return;
    const saved = localStorage.getItem(slotsKey(state.slug, state.attendeeId));
    if (saved) {
      try { JSON.parse(saved).forEach((s) => state.selectedSlots.add(s)); } catch (_) {}
    }
    (state.meet.location_preferences[state.attendeeId] || []).forEach((id) => state.selectedLocations.add(id));
  }

  async function fetchMeet(slug) {
    const res = await fetch(`api.php?slug=${encodeURIComponent(slug)}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Failed to load meeting');
    return data.meet;
  }

  async function apiPost(body) {
    const res = await fetch('api.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function visibleDayCount() {
    if (window.innerWidth >= 1200) return 7;
    if (window.innerWidth >= 900) return 5;
    return 3;
  }

  function render(root, state) {
    const m = state.meet;
    const attendee = m.attendees.find((a) => a.id === state.attendeeId);
    const url = shareUrl(state.slug);

    root.innerHTML = `
      <div class="meet-shell">
        <div class="sticky-top">
          <div class="sticky-top-inner">
            <div class="sticky-head row">
              <h1 class="meet-title">${escapeHtml(m.title)}</h1>
              ${m.confirmed_slot ? '<span class="badge good">Confirmed</span>' : ''}
            </div>
            ${renderIntroBlock(m, state, 'organizer_intro', m.organizer_intro, INTRO_PLACEHOLDER)}
            <p class="meta tz-banner">Not before/after times are in <strong>${escapeHtml(meetingTz(m))}</strong> · You are viewing in <strong>${escapeHtml(tz)}</strong></p>
            ${m.confirmed_slot ? `<div class="confirmed compact">Confirmed: ${escapeHtml(formatSlotInTz(m.confirmed_slot, meetingTz(m)))}${meetingTz(m) !== tz ? ` · Your time: ${escapeHtml(formatSlotLocal(m.confirmed_slot))}` : ''}${m.confirmed_location ? ` · ${escapeHtml(locationLabel(m, m.confirmed_location))}` : ''}</div>` : ''}
            <div class="share-row row">
              <input class="share-input" type="text" readonly value="${escapeHtml(url)}" id="share-url-input">
              <button type="button" class="secondary" data-action="copy-link">Copy link</button>
            </div>
            <nav class="tab-nav" role="tablist">
              ${tabBtn('calendar', 'Calendar', state)}
              ${tabBtn('times', 'Meeting details', state)}
              ${tabBtn('after', 'After meeting', state)}
              ${tabBtn('organiser', 'Set meeting options', state)}
            </nav>
          </div>
        </div>
        <div class="meet-content">
          ${state.activeTab === 'calendar' ? renderCalendarTab(m, state, attendee) : ''}
          ${state.activeTab === 'times' ? renderTimesTab(m, state, attendee) : ''}
          ${state.activeTab === 'after' ? renderAfterTab(m, state) : ''}
          ${state.activeTab === 'organiser' ? renderOrganiserTab(m, state) : ''}
        </div>
      </div>
      <div class="toast" id="toast"></div>
    `;
  }

  function tabBtn(id, label, state) {
    return `<button type="button" class="tab${state.activeTab === id ? ' active' : ''}" data-action="tab" data-tab="${id}">${label}</button>`;
  }

  function renderIntroBlock(m, state, field, text, placeholder) {
    if (state.editingIntro === field) {
      return `
        <div class="meet-intro-edit">
          <label>Meeting text <span class="label-hint">(simple HTML)</span></label>
          ${formatToolbar(field)}
          <textarea id="intro-edit-${field}" name="${field}" rows="4">${escapeHtml(text || '')}</textarea>
          <div class="row">
            <button type="button" data-action="save-intro" data-field="${field}">Save</button>
            <button type="button" class="secondary" data-action="cancel-intro">Cancel</button>
          </div>
        </div>`;
    }
    const body = (text || '').trim()
      ? sanitizeHtml(text)
      : `<span class="intro-placeholder">${escapeHtml(placeholder)}</span>`;
    return `
      <div class="meet-intro row">
        <div class="meet-intro-body">${body}</div>
        <button type="button" class="icon-btn" data-action="edit-intro" data-field="${field}" title="Edit meeting text">✎</button>
      </div>`;
  }

  function renderPageIntro(m, state, field, text, placeholder) {
    if (state.editingIntro === field) {
      return `
        <section class="panel">
          <label>Page intro <span class="label-hint">(simple HTML)</span></label>
          ${formatToolbar(field)}
          <textarea id="intro-edit-${field}" name="${field}" rows="3">${escapeHtml(text || '')}</textarea>
          <div class="row">
            <button type="button" data-action="save-intro" data-field="${field}">Save</button>
            <button type="button" class="secondary" data-action="cancel-intro">Cancel</button>
          </div>
        </section>`;
    }
    return `
      <section class="panel meet-intro row">
        <div class="meet-intro-body">${(text || '').trim() ? sanitizeHtml(text) : `<span class="intro-placeholder">${escapeHtml(placeholder)}</span>`}</div>
        <button type="button" class="icon-btn" data-action="edit-intro" data-field="${field}" title="Edit page intro">✎</button>
      </section>`;
  }

  function formatToolbar(field) {
    return `
      <div class="fmt-toolbar" data-field="${field}">
        <button type="button" class="secondary fmt-btn" data-fmt="strong" title="Strong"><b>B</b></button>
        <button type="button" class="secondary fmt-btn" data-fmt="em" title="Emphasis"><i>I</i></button>
        <button type="button" class="secondary fmt-btn" data-fmt="br" title="Line break">BR</button>
        <button type="button" class="secondary fmt-btn" data-fmt="a" title="Link">Link</button>
        <button type="button" class="secondary fmt-btn" data-fmt="ul" title="Bullet list">List</button>
      </div>`;
  }

  function renderOrganiserTab(m) {
    const mtz = meetingTz(m);
    return `
      <section class="panel stack">
        <h2 class="section-title">Set meeting options</h2>
        <form class="inline-form organizer-form" data-form="update-settings">
          <div class="form-grid">
            <label>Title<input name="title" value="${escapeHtml(m.title)}"></label>
            <label>Meeting timezone <span class="label-hint">(IANA name)</span>
              <input name="timezone" value="${escapeHtml(m.timezone || mtz)}" placeholder="e.g. America/Sao_Paulo" required>
            </label>
            <label>Meeting length (minutes)<input type="number" name="duration_minutes" value="${m.duration_minutes}" min="15" step="15"></label>
            <label>Grid step (minutes)<input type="number" name="slot_granularity_minutes" value="${m.slot_granularity_minutes}" min="15" step="15"></label>
            <label>Range start<input type="date" name="range_start" value="${escapeHtml(m.range_start)}"></label>
            <label>Range end<input type="date" name="range_end" value="${escapeHtml(m.range_end)}"></label>
            <label>Not before <span class="label-hint">(${escapeHtml(mtz)})</span><input type="time" name="day_start" value="${escapeHtml(m.day_start)}"></label>
            <label>Not after <span class="label-hint">(${escapeHtml(mtz)})</span><input type="time" name="day_end" value="${escapeHtml(m.day_end)}"></label>
            <label class="checkbox-label"><input type="checkbox" name="show_weekends" ${m.show_weekends ? 'checked' : ''}> Include weekends</label>
          </div>
          <label>Meeting text <span class="label-hint">(simple HTML — p, br, strong, em, a, ul, li)</span>
            ${formatToolbar('organizer_intro')}
            <textarea name="organizer_intro" rows="4">${escapeHtml(m.organizer_intro || '')}</textarea>
          </label>
          <details>
            <summary>Recurrence</summary>
            <label>Recurrence type<select name="recurrence_type">${recurrenceOptions(m.recurrence.type)}</select></label>
            <div id="recurrence-extra">${recurrenceExtraFields(m.recurrence)}</div>
          </details>
          <button type="submit">Save meeting options</button>
        </form>
      </section>`;
  }

  function renderCalendarTab(m, state, attendee) {
    const dayCount = visibleDayCount();
    const days = getVisibleDays(state.viewStart, dayCount, m.show_weekends);
    const mtz = meetingTz(m);
    const hours = buildHours(m.day_start, m.day_end, m.slot_granularity_minutes);
    const recurringSet = new Set(m.recurrence_dates || []);
    const saveRow = attendee ? renderSaveRow(state) : '';

    return `
      <section class="panel stack calendar-panel">
        <div class="row meta-line">
          <span class="badge">${escapeHtml(m.recurrence_label)}</span>
          <span>${escapeHtml(m.range_start)} → ${escapeHtml(m.range_end)} · Grid ${formatWallHour(hours[0] || { hour: 8, minute: 0 })}–${formatWallHour(hours[hours.length - 1] || { hour: 20, minute: 0 })} <strong>${escapeHtml(mtz)}</strong></span>
        </div>
        ${!attendee ? renderJoinForm() : `
          <p class="meta">Signed in as <strong>${escapeHtml(attendeeLabel(attendee))}</strong>
            <button type="button" class="secondary" data-action="switch-user">Switch</button>
          </p>`}
        ${saveRow}
        <div class="calendar-toolbar">
          <button type="button" class="secondary" data-action="prev-days">←</button>
          <strong>${formatDayRangeLabel(days)}</strong>
          <button type="button" class="secondary" data-action="next-days">→</button>
        </div>
        <div class="calendar" style="--cal-cols:${days.length || dayCount}">
          <div class="cal-header">
            <div class="time-gutter"></div>
            ${days.map((d) => {
              const dateStr = toDateIso(d);
              return `<div class="day-head${recurringSet.has(dateStr) ? ' recurring' : ''}">${formatDayHeadDateStr(dateStr, mtz)}${recurringSet.has(dateStr) ? '<br><small>recurring</small>' : ''}</div>`;
            }).join('')}
          </div>
          <div class="cal-body">
            ${hours.map((hm) => `
              <div class="time-label" title="${escapeHtml(mtz)}">${formatWallHour(hm)}</div>
              ${days.map((day) => renderSlotCell(m, state, toDateIso(day), hm, attendee, mtz)).join('')}
            `).join('')}
          </div>
        </div>
        ${saveRow}
      </section>`;
  }

  function renderSaveRow(state) {
    return `<div class="row save-row">
      <button type="button" data-action="save-availability">Save my availability</button>
      <span class="meta">${state.selectedSlots.size} slot(s) · drag to select a range</span>
    </div>`;
  }

  function renderSlotCell(m, state, dateStr, hm, attendee, mtz) {
    const slotIso = slotIsoFromMeetingDate(dateStr, hm, mtz);
    const ids = m.availability[slotIso] || [];
    const initials = ids.map((id) => attendeeInitials(m, id)).filter(Boolean);
    const label = initials.length ? initials.slice(0, 3).join(' ') + (initials.length > 3 ? '+' : '') : '';
    const names = ids.map((id) => attendeeName(m, id)).join(', ');
    const tip = names
      ? `${formatSlotInTz(slotIso, mtz)}${mtz !== tz ? ' · Your time: ' + formatSlotLocal(slotIso) : ''} · ${names}`
      : `${formatSlotInTz(slotIso, mtz)}${mtz !== tz ? ' · Your time: ' + formatSlotLocal(slotIso) : ''}`;
    return `<button type="button" class="slot${state.selectedSlots.has(slotIso) ? ' selected' : ''}${ids.length ? ' suggested' : ''}"
      data-action="toggle-slot" data-slot="${escapeHtml(slotIso)}" title="${escapeHtml(tip)}" ${attendee ? '' : 'disabled'}>
      ${label ? `<span class="slot-initials">${escapeHtml(label)}</span>` : ''}
      ${ids.length && !label ? `<span class="count">${ids.length}</span>` : ''}
    </button>`;
  }

  function renderTimesTab(m, state, attendee) {
    const sorted = sortSuggestions(m, state.sortOrder);
    const mtz = meetingTz(m);
    const slotVal = m.confirmed_slot || state.pendingConfirmSlot || '';
    return `
      ${renderPageIntro(m, state, 'page_times_intro', m.page_times_intro, 'Optional intro for the Meeting details page.')}
      <section class="panel stack">
        <div class="row" style="justify-content:space-between">
          <h2 class="section-title" style="margin:0">Meeting details</h2>
          <label class="sort-label">Sort
            <select data-action="sort-order">
              <option value="date"${state.sortOrder === 'date' ? ' selected' : ''}>Soonest first</option>
              <option value="count"${state.sortOrder === 'count' ? ' selected' : ''}>Most matches</option>
              <option value="names"${state.sortOrder === 'names' ? ' selected' : ''}>By names</option>
            </select>
          </label>
        </div>
        <p class="meta">Overlaps so far. You can still pick any slot on the <button type="button" class="linkish" data-action="tab" data-tab="calendar">calendar</button>.</p>
        <div class="suggestions-scroll">
          ${sorted.length ? sorted.map((s) => `
            <div class="suggestion">
              <strong>${escapeHtml(formatSlotInTz(s.slot, mtz))}</strong>
              ${mtz !== tz ? `<span class="meta">Your time: ${escapeHtml(formatSlotLocal(s.slot))}</span>` : ''}
              <span class="meta">${s.count} · ${escapeHtml(s.attendees.map((id) => attendeeLabelById(m, id)).join(', '))}</span>
              <div class="row suggestion-actions">
                <button type="button" data-action="jump-slot" data-slot="${escapeHtml(s.slot)}">Show on calendar</button>
                <button type="button" class="secondary" data-action="use-slot" data-slot="${escapeHtml(s.slot)}">Use as confirmed time</button>
              </div>
            </div>`).join('') : '<p class="meta">No matches yet.</p>'}
        </div>
      </section>
      <section class="panel stack">
        <h2 class="section-title">Attendees</h2>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Name</th><th>Initials</th><th>Contact</th><th>Slots</th></tr></thead>
            <tbody>
              ${m.attendees.length ? m.attendees.map((a) => `
                <tr><td>${escapeHtml(a.display_name)}</td><td>${escapeHtml(a.initials || deriveInitials(a.display_name))}</td>
                <td>${a.contact ? `<a href="${contactHref(a.contact)}">${escapeHtml(a.contact)}</a>` : '—'}</td>
                <td>${countSlotsFor(m, a.id)}</td></tr>`).join('') : '<tr><td colspan="4">No one has joined yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
      <section class="panel stack">
        <h2 class="section-title">Locations</h2>
        <div class="chip-list">${m.locations.map((loc) => `
          <button type="button" class="chip${state.selectedLocations.has(loc.id) ? ' active' : ''}" data-action="toggle-location" data-location="${escapeHtml(loc.id)}">
            ${escapeHtml(loc.label)} <small>(${escapeHtml(loc.kind)})</small>
          </button>`).join('') || '<p class="meta">No locations yet.</p>'}</div>
        ${attendee ? '<button type="button" class="secondary" data-action="save-locations">Save location preferences</button>' : ''}
        <details><summary>Propose a location</summary>
          <form class="inline-form" data-form="add-location">
            <input name="label" placeholder="e.g. Zoom" required>
            <select name="kind"><option value="video">Video</option><option value="physical">Physical</option><option value="phone">Phone</option><option value="other">Other</option></select>
            <input name="detail" placeholder="URL or address">
            <button type="submit">Add</button>
          </form>
        </details>
        <details open><summary>Confirm final time &amp; location</summary>
          <form class="inline-form" data-form="confirm" id="confirm-form">
            <label>Slot <span class="label-hint">(stored as UTC; shown below in meeting &amp; your time)</span>
              <input name="confirmed_slot" value="${escapeHtml(slotVal)}">
            </label>
            ${slotVal ? `<p class="meta">Meeting time (${escapeHtml(mtz)}): <strong>${escapeHtml(formatSlotInTz(slotVal, mtz))}</strong>${mtz !== tz ? ` · Your time: <strong>${escapeHtml(formatSlotLocal(slotVal))}</strong>` : ''}</p>` : ''}
            <label>Location<select name="confirmed_location"><option value="">—</option>
              ${m.locations.map((l) => `<option value="${escapeHtml(l.id)}"${m.confirmed_location === l.id ? ' selected' : ''}>${escapeHtml(l.label)}</option>`).join('')}
            </select></label>
            <button type="submit">Confirm meeting</button>
          </form>
        </details>
      </section>
      <section class="panel stack">
        <h2 class="section-title">Agenda &amp; decisions required</h2>
        ${m.agenda.length ? `<ul class="list-plain">${m.agenda.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '<p class="meta">No agenda yet.</p>'}
        ${m.decisions.length ? `<p><strong>Decisions required</strong></p><ul class="list-plain">${m.decisions.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : ''}
        <details><summary>Edit agenda / decisions</summary>
          <form class="inline-form" data-form="update-meta">
            <label>Agenda <span class="label-hint">(plain text, one item per line)</span><textarea name="agenda" rows="4">${escapeHtml(m.agenda.join('\n'))}</textarea></label>
            <label>Decisions required <span class="label-hint">(plain text, one per line)</span><textarea name="decisions" rows="3">${escapeHtml(m.decisions.join('\n'))}</textarea></label>
            <label>Notes <span class="label-hint">(plain text)</span><textarea name="notes" rows="2">${escapeHtml(m.notes || '')}</textarea></label>
            <button type="submit">Save</button>
          </form>
        </details>
      </section>`;
  }

  function renderAfterTab(m, state) {
    return `
      ${renderPageIntro(m, state, 'page_after_intro', m.page_after_intro, 'Optional intro for recordings and summaries.')}
      <section class="panel stack">
        <h2 class="section-title">Recordings, transcripts &amp; AI summaries</h2>
        ${m.attachments.length ? m.attachments.map(renderAttachment).join('') : '<p class="meta">Nothing attached yet.</p>'}
        <details><summary>Add attachment</summary>
          <form class="inline-form" data-form="add-attachment">
            <input name="label" required placeholder="Label">
            <select name="type"><option value="url">URL</option><option value="text">Text summary</option></select>
            <input name="url" placeholder="https://...">
            <textarea name="body" rows="3" placeholder="Paste summary (plain text)"></textarea>
            <button type="submit">Attach</button>
          </form>
        </details>
      </section>`;
  }

  function renderJoinForm() {
    return `<form class="inline-form join-form" data-form="join">
      <div class="form-grid">
        <label>Your name<input name="display_name" required></label>
        <label>Initials (optional)<input name="initials" maxlength="4"></label>
        <label>Contact (optional)<input name="contact" placeholder="email or phone"></label>
      </div>
      <button type="submit">Join this meeting</button>
    </form>`;
  }

  function renderAttachment(att) {
    if (att.type === 'text') return `<div class="attachment"><strong>${escapeHtml(att.label)}</strong><pre class="attachment-body">${escapeHtml(att.body || '')}</pre></div>`;
    return `<div class="attachment"><a href="${escapeHtml(att.url || '#')}" target="_blank" rel="noopener">${escapeHtml(att.label)}</a></div>`;
  }

  async function handleSubmit(e, root, state) {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const kind = form.dataset.form;
    const fd = new FormData(form);
    try {
      let data;
      if (kind === 'join') {
        data = await apiPost({ action: 'join', slug: state.slug, display_name: fd.get('display_name'), contact: fd.get('contact'),
          initials: fd.get('initials') || deriveInitials(fd.get('display_name')), attendee_id: state.attendeeId || undefined });
        state.attendeeId = data.attendee_id;
        localStorage.setItem(attendeeKey(state.slug), state.attendeeId);
      } else if (kind === 'update-settings') {
        data = await apiPost({ action: 'update_meta', slug: state.slug, title: fd.get('title'),
          range_start: fd.get('range_start'), range_end: fd.get('range_end'),
          duration_minutes: Number(fd.get('duration_minutes')), slot_granularity_minutes: Number(fd.get('slot_granularity_minutes')),
          day_start: fd.get('day_start'), day_end: fd.get('day_end'),
          timezone: String(fd.get('timezone') || '').trim() || tz,
          show_weekends: fd.get('show_weekends') === 'on',
          organizer_intro: fd.get('organizer_intro'), recurrence: buildRecurrenceFromForm(fd) });
      } else if (kind === 'update-meta') {
        data = await apiPost({ action: 'update_meta', slug: state.slug, agenda: lines(fd.get('agenda')), decisions: lines(fd.get('decisions')), notes: fd.get('notes') });
      } else if (kind === 'add-location') {
        data = await apiPost({ action: 'add_location', slug: state.slug, label: fd.get('label'), kind: fd.get('kind'), detail: fd.get('detail') });
      } else if (kind === 'add-attachment') {
        data = await apiPost({ action: 'add_attachment', slug: state.slug, label: fd.get('label'), type: fd.get('type'), url: fd.get('url'), body: fd.get('body') });
      } else if (kind === 'confirm') {
        data = await apiPost({ action: 'confirm', slug: state.slug, confirmed_slot: fd.get('confirmed_slot'), confirmed_location: fd.get('confirmed_location') });
        state.pendingConfirmSlot = null;
      } else return;
      state.meet = data.meet;
      if (kind === 'join') restoreAttendeeSelections(state);
      render(root, state);
      toast('Saved');
    } catch (err) { toast(err.message, true); }
  }

  async function handleClick(e, root, state) {
    const btn = e.target.closest('[data-action], [data-fmt]');
    if (!btn) return;

    if (btn.dataset.fmt) {
      applyFormat(btn.dataset.field || btn.closest('.fmt-toolbar')?.dataset.field, btn.dataset.fmt);
      return;
    }

    const action = btn.dataset.action;
    if (action === 'tab') { setTab(state, btn.dataset.tab); render(root, state); return; }
    if (action === 'copy-link') {
      const input = document.getElementById('share-url-input');
      try {
        await navigator.clipboard.writeText(input?.value || shareUrl(state.slug));
        toast('Link copied');
      } catch (_) { input?.select(); document.execCommand('copy'); toast('Link copied'); }
      return;
    }
    if (action === 'edit-intro') { state.editingIntro = btn.dataset.field; render(root, state); return; }
    if (action === 'cancel-intro') { state.editingIntro = null; render(root, state); return; }
    if (action === 'save-intro') {
      const field = btn.dataset.field;
      const val = document.getElementById(`intro-edit-${field}`)?.value ?? '';
      const payload = { action: 'update_meta', slug: state.slug };
      payload[field] = val;
      try {
        const data = await apiPost(payload);
        state.meet = data.meet;
        state.editingIntro = null;
        render(root, state);
        toast('Saved');
      } catch (err) { toast(err.message, true); }
      return;
    }
    if (action === 'toggle-slot') { toggleSlot(state, btn.dataset.slot); render(root, state); return; }
    if (action === 'toggle-location') {
      const id = btn.dataset.location;
      state.selectedLocations.has(id) ? state.selectedLocations.delete(id) : state.selectedLocations.add(id);
      render(root, state);
      return;
    }
    if (action === 'prev-days') { state.viewStart = addDays(state.viewStart, -visibleDayCount()); render(root, state); return; }
    if (action === 'next-days') { state.viewStart = addDays(state.viewStart, visibleDayCount()); render(root, state); return; }
    if (action === 'jump-slot') {
      state.viewStart = startOfDay(new Date(btn.dataset.slot));
      setTab(state, 'calendar');
      render(root, state);
      return;
    }
    if (action === 'use-slot') {
      state.pendingConfirmSlot = btn.dataset.slot;
      setTab(state, 'times');
      render(root, state);
      document.getElementById('confirm-form')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    if (action === 'switch-user') {
      state.attendeeId = '';
      localStorage.removeItem(attendeeKey(state.slug));
      state.selectedSlots.clear();
      state.selectedLocations.clear();
      render(root, state);
      return;
    }
    if (action === 'save-availability') {
      try {
        const data = await apiPost({ action: 'save_availability', slug: state.slug, attendee_id: state.attendeeId, slots: [...state.selectedSlots] });
        localStorage.setItem(slotsKey(state.slug, state.attendeeId), JSON.stringify([...state.selectedSlots]));
        state.meet = data.meet;
        render(root, state);
        toast('Availability saved');
      } catch (err) { toast(err.message, true); }
      return;
    }
    if (action === 'save-locations') {
      try {
        const data = await apiPost({ action: 'save_location_prefs', slug: state.slug, attendee_id: state.attendeeId, location_ids: [...state.selectedLocations] });
        state.meet = data.meet;
        render(root, state);
        toast('Location preferences saved');
      } catch (err) { toast(err.message, true); }
    }
  }

  function applyFormat(field, fmt) {
    const ta = document.getElementById(`intro-edit-${field}`) || document.querySelector(`textarea[name="${field}"]`);
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = ta.value.slice(start, end);
    let insert = sel;
    if (fmt === 'br') insert = '<br>';
    else if (fmt === 'strong') insert = `<strong>${sel || 'text'}</strong>`;
    else if (fmt === 'em') insert = `<em>${sel || 'text'}</em>`;
    else if (fmt === 'a') {
      const href = prompt('Link URL:', 'https://');
      if (!href) return;
      insert = `<a href="${href}">${sel || 'link text'}</a>`;
    } else if (fmt === 'ul') insert = `<ul>\n<li>${sel || 'item'}</li>\n</ul>`;
    ta.value = ta.value.slice(0, start) + insert + ta.value.slice(end);
    ta.focus();
  }

  function handleChange(e, root, state) {
    if (e.target.matches('[data-action="sort-order"]')) { state.sortOrder = e.target.value; render(root, state); }
    if (e.target.name === 'recurrence_type') {
      const extra = root.querySelector('#recurrence-extra');
      if (extra) extra.innerHTML = recurrenceExtraFields({ type: e.target.value });
    }
  }

  function handlePointerDown(e, root, state) {
    const slot = e.target.closest('[data-action="toggle-slot"]');
    if (!slot || !state.attendeeId) return;
    state.dragging = true;
    state.dragSelect = !state.selectedSlots.has(slot.dataset.slot);
    toggleSlot(state, slot.dataset.slot);
    render(root, state);
  }

  function handlePointerOver(e, root, state) {
    if (!state.dragging) return;
    const slot = e.target.closest('[data-action="toggle-slot"]');
    if (!slot) return;
    if (state.dragSelect) state.selectedSlots.add(slot.dataset.slot);
    else state.selectedSlots.delete(slot.dataset.slot);
    render(root, state);
  }

  function toggleSlot(state, slot) {
    state.selectedSlots.has(slot) ? state.selectedSlots.delete(slot) : state.selectedSlots.add(slot);
  }

  function sortSuggestions(m, order) {
    const list = (m.suggestions?.slots || []).map((s) => ({ ...s }));
    if (order === 'count') list.sort((a, b) => b.count - a.count || a.slot.localeCompare(b.slot));
    else if (order === 'names') list.sort((a, b) => attendeeName(m, a.attendees[0]).localeCompare(attendeeName(m, b.attendees[0])) || a.slot.localeCompare(b.slot));
    else list.sort((a, b) => a.slot.localeCompare(b.slot));
    return list;
  }

  function getVisibleDays(start, count, showWeekends) {
    const days = [];
    let cursor = startOfDay(new Date(start));
    let guard = 0;
    while (days.length < count && guard < 366) {
      const dow = cursor.getDay();
      if (showWeekends || (dow !== 0 && dow !== 6)) days.push(new Date(cursor));
      cursor = addDays(cursor, 1);
      guard++;
    }
    return days;
  }

  function buildHours(startStr, endStr, granularity) {
    const start = parseTime(startStr);
    const end = parseTime(endStr);
    const slots = [];
    for (let mins = start.hour * 60 + start.minute; mins < end.hour * 60 + end.minute; mins += granularity) {
      slots.push({ hour: Math.floor(mins / 60), minute: mins % 60 });
    }
    return slots;
  }

  function parseTime(str) {
    const [h, m] = String(str || '08:00').split(':').map(Number);
    return { hour: h || 0, minute: m || 0 };
  }

  function recurrenceOptions(current) {
    return [['none', 'One-off'], ['weekly', 'Weekly'], ['monthly_day', 'Day of month'], ['monthly_nth_weekday', 'Nth weekday'], ['friday_13th', 'Friday 13th']]
      .map(([v, l]) => `<option value="${v}"${v === current ? ' selected' : ''}>${l}</option>`).join('');
  }

  function recurrenceExtraFields(rec) {
    const type = rec.type || 'none';
    if (type === 'weekly') return `<label>Every N weeks<input type="number" name="interval" value="${rec.interval || 1}" min="1"></label><label>Weekdays (0=Sun…6=Sat)<input name="weekdays" value="${(rec.weekdays || [1]).join(',')}"></label>`;
    if (type === 'monthly_day') return `<label>Day of month<input type="number" name="day" value="${rec.day || 1}" min="1" max="31"></label><label>Every N months<input type="number" name="interval" value="${rec.interval || 1}" min="1"></label>`;
    if (type === 'monthly_nth_weekday') return `<label>Nth<input type="number" name="nth" value="${rec.nth || 3}"></label><label>Weekday<input type="number" name="weekday" value="${rec.weekday ?? 1}" min="0" max="6"></label><label>Every N months<input type="number" name="interval" value="${rec.interval || 1}" min="1"></label>`;
    return '<p class="meta">No extra fields.</p>';
  }

  function buildRecurrenceFromForm(fd) {
    const type = fd.get('recurrence_type');
    const base = { type };
    if (type === 'weekly') { base.interval = Number(fd.get('interval') || 1); base.weekdays = String(fd.get('weekdays') || '1').split(',').map((n) => Number(n.trim())).filter((n) => !Number.isNaN(n)); }
    else if (type === 'monthly_day') { base.day = Number(fd.get('day') || 1); base.interval = Number(fd.get('interval') || 1); }
    else if (type === 'monthly_nth_weekday') { base.nth = Number(fd.get('nth') || 3); base.weekday = Number(fd.get('weekday') ?? 1); base.interval = Number(fd.get('interval') || 1); }
    return base;
  }

  function slotIsoFromLocal(day, hm) {
    const d = new Date(day);
    d.setHours(hm.hour, hm.minute, 0, 0);
    return d.toISOString();
  }

  function startOfDay(date) { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
  function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
  function toDateIso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function formatDayHead(d) { return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); }
  function formatDayRangeLabel(days) {
    if (!days.length) return '';
    return days.length === 1 ? formatDayHead(days[0]) : `${formatDayHead(days[0])} – ${formatDayHead(days[days.length - 1])}`;
  }
  function formatHour(hm) { const d = new Date(); d.setHours(hm.hour, hm.minute, 0, 0); return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  function formatSlotLocal(iso) { return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function attendeeName(m, id) { return m.attendees.find((a) => a.id === id)?.display_name || id; }
  function attendeeLabel(a) { return a.initials ? `${a.display_name} (${a.initials})` : a.display_name; }
  function attendeeLabelById(m, id) { const a = m.attendees.find((x) => x.id === id); return a ? attendeeLabel(a) : id; }
  function attendeeInitials(m, id) { const a = m.attendees.find((x) => x.id === id); return a ? (a.initials || deriveInitials(a.display_name)) : ''; }
  function deriveInitials(name) { return String(name).trim().split(/\s+/).map((w) => w[0] || '').join('').slice(0, 3).toUpperCase(); }
  function countSlotsFor(m, id) { return Object.values(m.availability).filter((ids) => ids.includes(id)).length; }
  function locationLabel(m, id) { return m.locations.find((l) => l.id === id)?.label || id; }
  function contactHref(c) { return String(c).includes('@') ? `mailto:${c}` : `tel:${c}`; }
  function lines(v) { return String(v || '').split('\n').map((s) => s.trim()).filter(Boolean); }
  function shareUrl(slug) { return meetingUrl(slug); }
  function slugify(v) { return String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'meet'; }

  function sanitizeHtml(html) {
    const allowed = new Set(['P', 'BR', 'STRONG', 'EM', 'B', 'I', 'UL', 'OL', 'LI', 'A', 'SPAN', 'DIV']);
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    doc.body.querySelectorAll('*').forEach((el) => {
      if (!allowed.has(el.tagName)) el.replaceWith(...el.childNodes);
      else if (el.tagName === 'A') {
        [...el.attributes].forEach((a) => { if (a.name !== 'href') el.removeAttribute(a.name); });
        el.setAttribute('rel', 'noopener'); el.setAttribute('target', '_blank');
      } else [...el.attributes].forEach((a) => el.removeAttribute(a.name));
    });
    return doc.body.innerHTML;
  }

  function escapeHtml(str) { return String(str).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }

  let toastTimer;
  function toast(msg, isError = false) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.style.background = isError ? '#b91c1c' : '#111827';
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }
})();
