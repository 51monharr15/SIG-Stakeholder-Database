(() => {
  'use strict';

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const page = document.body.dataset.page;
  const VISIBLE_DAYS = 3;

  if (page === 'home') {
    initHome();
  } else if (page === 'scheduler') {
    initScheduler(document.body.dataset.slug);
  }

  function initHome() {
    document.getElementById('create-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      const slug = slugify(data.get('slug'));
      const title = String(data.get('title') || '').trim();
      try {
        await apiPost({ action: 'create', slug, title });
        window.location.href = `./?${encodeURIComponent(slug)}`;
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
      activeTab: tabFromUrl(),
      sortOrder: 'date',
      dragging: false,
      dragSelect: true,
    };

    try {
      state.meet = await fetchMeet(slug);
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
  }

  function tabFromUrl() {
    const p = new URLSearchParams(window.location.search);
    const t = p.get('view');
    return ['calendar', 'times', 'after'].includes(t) ? t : 'calendar';
  }

  function setTab(state, tab) {
    state.activeTab = tab;
    const url = new URL(window.location.href);
    if (tab === 'calendar') url.searchParams.delete('view');
    else url.searchParams.set('view', tab);
    history.replaceState(null, '', url);
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
    const res = await fetch('api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function render(root, state) {
    const m = state.meet;
    const attendee = m.attendees.find((a) => a.id === state.attendeeId);

    root.innerHTML = `
      <div class="meet-shell">
        <header class="panel meet-head">
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <div>
              <h1 style="margin:0">${escapeHtml(m.title)}</h1>
              <p class="meta">Link: <code>${escapeHtml(m.slug)}</code> · ID: <code>${escapeHtml(m.id)}</code> · Times in <strong>${escapeHtml(tz)}</strong></p>
            </div>
            ${m.confirmed_slot ? '<span class="badge good">Confirmed</span>' : ''}
          </div>
          ${m.confirmed_slot ? `
            <div class="confirmed">
              <strong>Confirmed:</strong> ${escapeHtml(formatSlotLocal(m.confirmed_slot))}
              ${m.confirmed_location ? ` · <strong>Location:</strong> ${escapeHtml(locationLabel(m, m.confirmed_location))}` : ''}
            </div>` : ''}
        </header>

        <nav class="tab-nav" role="tablist">
          <button type="button" class="tab${state.activeTab === 'calendar' ? ' active' : ''}" data-action="tab" data-tab="calendar">Calendar</button>
          <button type="button" class="tab${state.activeTab === 'times' ? ' active' : ''}" data-action="tab" data-tab="times">Matched times</button>
          <button type="button" class="tab${state.activeTab === 'after' ? ' active' : ''}" data-action="tab" data-tab="after">After meeting</button>
        </nav>

        ${state.activeTab === 'calendar' ? renderCalendarTab(m, state, attendee) : ''}
        ${state.activeTab === 'times' ? renderTimesTab(m, state, attendee) : ''}
        ${state.activeTab === 'after' ? renderAfterTab(m, state) : ''}
      </div>
      <div class="toast" id="toast"></div>
    `;
  }

  function renderCalendarTab(m, state, attendee) {
    const days = getVisibleDays(state.viewStart, VISIBLE_DAYS, m.show_weekends);
    const hours = buildHours(m.day_start, m.day_end, m.slot_granularity_minutes);
    const recurringSet = new Set(m.recurrence_dates || []);
    const cols = days.length || VISIBLE_DAYS;

    return `
      <section class="panel stack organizer-panel">
        <details open>
          <summary>Organiser settings</summary>
          <form class="inline-form organizer-form" data-form="update-settings">
            <div class="form-grid">
              <label>Title<input name="title" value="${escapeHtml(m.title)}"></label>
              <label>Meeting length (minutes)<input type="number" name="duration_minutes" value="${m.duration_minutes}" min="15" step="15"></label>
              <label>Grid step (minutes)<input type="number" name="slot_granularity_minutes" value="${m.slot_granularity_minutes}" min="15" step="15"></label>
              <label>Range start<input type="date" name="range_start" value="${escapeHtml(m.range_start)}"></label>
              <label>Range end<input type="date" name="range_end" value="${escapeHtml(m.range_end)}"></label>
              <label>Not before<input type="time" name="day_start" value="${escapeHtml(m.day_start)}"></label>
              <label>Not after<input type="time" name="day_end" value="${escapeHtml(m.day_end)}"></label>
              <label class="checkbox-label"><input type="checkbox" name="show_weekends" ${m.show_weekends ? 'checked' : ''}> Include weekends</label>
            </div>
            <label>Intro text for this page <span class="meta">(plain text or simple HTML: p, br, strong, em, a, ul, li)</span>
              <textarea name="organizer_intro" rows="3">${escapeHtml(m.organizer_intro || '')}</textarea>
            </label>
            <details>
              <summary>Recurrence</summary>
              <label>Recurrence type
                <select name="recurrence_type">${recurrenceOptions(m.recurrence.type)}</select>
              </label>
              <div id="recurrence-extra">${recurrenceExtraFields(m.recurrence)}</div>
            </details>
            <button type="submit">Save organiser settings</button>
          </form>
        </details>
      </section>

      ${m.organizer_intro ? `<section class="panel organizer-intro">${sanitizeHtml(m.organizer_intro)}</section>` : ''}

      <section class="panel stack calendar-panel">
        <div class="row meta-line">
          <span class="badge">${escapeHtml(m.recurrence_label)}</span>
          <span>${escapeHtml(m.range_start)} → ${escapeHtml(m.range_end)} · ${m.duration_minutes} min meeting · ${m.slot_granularity_minutes} min grid</span>
        </div>

        ${!attendee ? renderJoinForm() : `
          <p class="meta">Signed in as <strong>${escapeHtml(attendeeLabel(attendee))}</strong>
            <button type="button" class="secondary" data-action="switch-user">Switch</button>
          </p>`}

        <div class="calendar-toolbar">
          <button type="button" class="secondary" data-action="prev-days">←</button>
          <strong>${formatDayRangeLabel(days)}</strong>
          <button type="button" class="secondary" data-action="next-days">→</button>
        </div>

        <div class="calendar" style="--cal-cols:${cols}">
          <div class="cal-header">
            <div class="time-gutter"></div>
            ${days.map((d) => {
              const iso = toDateIso(d);
              const rec = recurringSet.has(iso);
              return `<div class="day-head${rec ? ' recurring' : ''}">${formatDayHead(d)}${rec ? '<br><small>recurring</small>' : ''}</div>`;
            }).join('')}
          </div>
          <div class="cal-body">
            ${hours.map((hm) => `
              <div class="time-label">${formatHour(hm)}</div>
              ${days.map((day) => renderSlotCell(m, state, day, hm, attendee)).join('')}
            `).join('')}
          </div>
        </div>

        ${attendee ? `
          <div class="row">
            <button type="button" data-action="save-availability">Save my availability</button>
            <span class="meta">${state.selectedSlots.size} slot(s) selected · drag across slots to select a range</span>
          </div>` : ''}
      </section>
    `;
  }

  function renderSlotCell(m, state, day, hm, attendee) {
    const slotIso = slotIsoFromLocal(day, hm);
    const ids = m.availability[slotIso] || [];
    const count = ids.length;
    const selected = state.selectedSlots.has(slotIso);
    const suggested = count > 0;
    const initials = ids.map((id) => attendeeInitials(m, id)).filter(Boolean);
    const label = initials.length ? initials.slice(0, 3).join(' ') + (initials.length > 3 ? '+' : '') : '';
    const names = ids.map((id) => attendeeName(m, id)).join(', ');

    return `<button type="button" class="slot${selected ? ' selected' : ''}${suggested ? ' suggested' : ''}"
      data-action="toggle-slot" data-slot="${escapeHtml(slotIso)}"
      title="${escapeHtml(names || 'No one yet')}" ${attendee ? '' : 'disabled'}>
      ${label ? `<span class="slot-initials">${escapeHtml(label)}</span>` : ''}
      ${count && !label ? `<span class="count">${count}</span>` : ''}
    </button>`;
  }

  function renderTimesTab(m, state, attendee) {
    const sorted = sortSuggestions(m, state.sortOrder);
    return `
      ${m.page_times_intro ? `<section class="panel organizer-intro">${sanitizeHtml(m.page_times_intro)}</section>` : ''}

      <section class="panel stack">
        <div class="row" style="justify-content:space-between">
          <h2 class="section-title" style="margin:0">Matched times</h2>
          <label class="sort-label">Sort
            <select data-action="sort-order">
              <option value="date"${state.sortOrder === 'date' ? ' selected' : ''}>Soonest first</option>
              <option value="count"${state.sortOrder === 'count' ? ' selected' : ''}>Most matches</option>
              <option value="names"${state.sortOrder === 'names' ? ' selected' : ''}>By names</option>
            </select>
          </label>
        </div>
        <p class="meta">Overlaps so far. You can still pick any slot on the calendar — not limited to these.</p>
        <div class="suggestions-scroll">
          ${sorted.length ? sorted.map((s) => `
            <div class="suggestion" data-action="jump-slot" data-slot="${escapeHtml(s.slot)}">
              <strong>${escapeHtml(formatSlotLocal(s.slot))}</strong>
              <span class="meta">${s.count} · ${escapeHtml(s.attendees.map((id) => attendeeLabelById(m, id)).join(', '))}</span>
            </div>`).join('') : '<p class="meta">No matches yet.</p>'}
        </div>
        <details>
          <summary>Edit intro text for this page</summary>
          <form class="inline-form" data-form="update-times-intro">
            <textarea name="page_times_intro" rows="3">${escapeHtml(m.page_times_intro || '')}</textarea>
            <button type="submit">Save intro</button>
          </form>
        </details>
      </section>

      <section class="panel stack">
        <h2 class="section-title">Attendees</h2>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Name</th><th>Initials</th><th>Contact</th><th>Slots</th></tr></thead>
            <tbody>
              ${m.attendees.length ? m.attendees.map((a) => `
                <tr data-action="highlight-attendee" data-attendee="${escapeHtml(a.id)}" class="clickable">
                  <td>${escapeHtml(a.display_name)}</td>
                  <td>${escapeHtml(a.initials || deriveInitials(a.display_name))}</td>
                  <td>${a.contact ? `<a href="${contactHref(a.contact)}">${escapeHtml(a.contact)}</a>` : '—'}</td>
                  <td>${countSlotsFor(m, a.id)}</td>
                </tr>`).join('') : '<tr><td colspan="4">No one has joined yet.</td></tr>'}
            </tbody>
          </table>
        </div>
        <p class="meta">Anyone with the meeting link can see contact details shared here.</p>
      </section>

      <section class="panel stack">
        <h2 class="section-title">Locations</h2>
        <div class="chip-list">
          ${m.locations.map((loc) => `
            <button type="button" class="chip${state.selectedLocations.has(loc.id) ? ' active' : ''}"
              data-action="toggle-location" data-location="${escapeHtml(loc.id)}">
              ${escapeHtml(loc.label)} <small>(${escapeHtml(loc.kind)})</small>
            </button>`).join('') || '<p class="meta">No locations proposed yet.</p>'}
        </div>
        ${attendee ? '<button type="button" class="secondary" data-action="save-locations">Save location preferences</button>' : ''}
        <details>
          <summary>Propose a location</summary>
          <form class="inline-form" data-form="add-location">
            <input name="label" placeholder="e.g. Zoom, Room 4B" required>
            <select name="kind"><option value="video">Video</option><option value="physical">Physical</option><option value="phone">Phone</option><option value="other">Other</option></select>
            <input name="detail" placeholder="URL, address, or dial-in">
            <button type="submit">Add location</button>
          </form>
        </details>
        <details>
          <summary>Confirm final time &amp; location</summary>
          <form class="inline-form" data-form="confirm">
            <label>Slot<input name="confirmed_slot" value="${escapeHtml(m.confirmed_slot || '')}" placeholder="Click a matched time above"></label>
            <label>Location<select name="confirmed_location"><option value="">—</option>
              ${m.locations.map((l) => `<option value="${escapeHtml(l.id)}"${m.confirmed_location === l.id ? ' selected' : ''}>${escapeHtml(l.label)}</option>`).join('')}
            </select></label>
            <button type="submit">Confirm meeting</button>
          </form>
        </details>
      </section>

      <section class="panel stack">
        <h2 class="section-title">Agenda &amp; decisions</h2>
        ${m.agenda.length ? `<ul class="list-plain">${m.agenda.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '<p class="meta">No agenda yet.</p>'}
        ${m.decisions.length ? `<p><strong>Decisions needed</strong></p><ul class="list-plain">${m.decisions.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : ''}
        <details>
          <summary>Edit agenda / decisions</summary>
          <form class="inline-form" data-form="update-meta">
            <label>Agenda<textarea name="agenda" rows="4">${escapeHtml(m.agenda.join('\n'))}</textarea></label>
            <label>Decisions<textarea name="decisions" rows="3">${escapeHtml(m.decisions.join('\n'))}</textarea></label>
            <label>Notes<textarea name="notes" rows="2">${escapeHtml(m.notes || '')}</textarea></label>
            <button type="submit">Save</button>
          </form>
        </details>
      </section>
    `;
  }

  function renderAfterTab(m, state) {
    return `
      ${m.page_after_intro ? `<section class="panel organizer-intro">${sanitizeHtml(m.page_after_intro)}</section>` : ''}

      <section class="panel stack">
        <h2 class="section-title">Recordings, transcripts &amp; AI summaries</h2>
        ${m.attachments.length ? m.attachments.map(renderAttachment).join('') : '<p class="meta">Nothing attached yet.</p>'}
        <details>
          <summary>Add attachment</summary>
          <form class="inline-form" data-form="add-attachment">
            <input name="label" placeholder="Label" required>
            <select name="type"><option value="url">URL</option><option value="text">Text summary</option></select>
            <input name="url" placeholder="https://...">
            <textarea name="body" rows="3" placeholder="Paste AI summary"></textarea>
            <button type="submit">Attach</button>
          </form>
        </details>
        <details>
          <summary>Edit intro text for this page</summary>
          <form class="inline-form" data-form="update-after-intro">
            <textarea name="page_after_intro" rows="3">${escapeHtml(m.page_after_intro || '')}</textarea>
            <button type="submit">Save intro</button>
          </form>
        </details>
      </section>

      <section class="panel">
        <p class="meta">Share link: <code>${escapeHtml(shareUrl(state.slug))}</code></p>
      </section>
    `;
  }

  function renderJoinForm() {
    return `
      <form class="inline-form join-form" data-form="join">
        <div class="form-grid">
          <label>Your name<input name="display_name" required placeholder="Alice Brown"></label>
          <label>Initials (optional)<input name="initials" maxlength="4" placeholder="AB"></label>
          <label>Contact (optional)<input name="contact" placeholder="email or phone"></label>
        </div>
        <button type="submit">Join this meeting</button>
      </form>`;
  }

  function renderAttachment(att) {
    if (att.type === 'text') {
      return `<div class="attachment"><strong>${escapeHtml(att.label)}</strong><pre class="attachment-body">${escapeHtml(att.body || '')}</pre></div>`;
    }
    return `<div class="attachment"><a href="${escapeHtml(att.url || '#')}" target="_blank" rel="noopener">${escapeHtml(att.label)}</a></div>`;
  }

  function sortSuggestions(m, order) {
    const list = (m.suggestions?.slots || []).map((s) => ({ ...s }));
    if (order === 'count') {
      list.sort((a, b) => b.count - a.count || a.slot.localeCompare(b.slot));
    } else if (order === 'names') {
      list.sort((a, b) => {
        const na = a.attendees.map((id) => attendeeName(m, id)).sort().join(', ');
        const nb = b.attendees.map((id) => attendeeName(m, id)).sort().join(', ');
        return na.localeCompare(nb) || a.slot.localeCompare(b.slot);
      });
    } else {
      list.sort((a, b) => a.slot.localeCompare(b.slot));
    }
    return list;
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
        data = await apiPost({
          action: 'join', slug: state.slug,
          display_name: fd.get('display_name'),
          contact: fd.get('contact'),
          initials: fd.get('initials') || deriveInitials(fd.get('display_name')),
          attendee_id: state.attendeeId || undefined,
        });
        state.attendeeId = data.attendee_id;
        localStorage.setItem(attendeeKey(state.slug), state.attendeeId);
      } else if (kind === 'add-location') {
        data = await apiPost({ action: 'add_location', slug: state.slug, label: fd.get('label'), kind: fd.get('kind'), detail: fd.get('detail') });
      } else if (kind === 'update-meta') {
        data = await apiPost({
          action: 'update_meta', slug: state.slug,
          agenda: lines(fd.get('agenda')), decisions: lines(fd.get('decisions')), notes: fd.get('notes'),
        });
      } else if (kind === 'update-settings') {
        data = await apiPost({
          action: 'update_meta', slug: state.slug,
          title: fd.get('title'),
          range_start: fd.get('range_start'), range_end: fd.get('range_end'),
          duration_minutes: Number(fd.get('duration_minutes')),
          slot_granularity_minutes: Number(fd.get('slot_granularity_minutes')),
          day_start: fd.get('day_start'), day_end: fd.get('day_end'),
          show_weekends: fd.get('show_weekends') === 'on',
          organizer_intro: fd.get('organizer_intro'),
          recurrence: buildRecurrenceFromForm(fd),
        });
      } else if (kind === 'update-times-intro') {
        data = await apiPost({ action: 'update_meta', slug: state.slug, page_times_intro: fd.get('page_times_intro') });
      } else if (kind === 'update-after-intro') {
        data = await apiPost({ action: 'update_meta', slug: state.slug, page_after_intro: fd.get('page_after_intro') });
      } else if (kind === 'add-attachment') {
        data = await apiPost({ action: 'add_attachment', slug: state.slug, label: fd.get('label'), type: fd.get('type'), url: fd.get('url'), body: fd.get('body') });
      } else if (kind === 'confirm') {
        data = await apiPost({ action: 'confirm', slug: state.slug, confirmed_slot: fd.get('confirmed_slot'), confirmed_location: fd.get('confirmed_location') });
      } else return;

      state.meet = data.meet;
      if (kind === 'join') restoreAttendeeSelections(state);
      render(root, state);
      toast('Saved');
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function handleClick(e, root, state) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'tab') {
      setTab(state, btn.dataset.tab);
      render(root, state);
      return;
    }

    if (action === 'toggle-slot') {
      toggleSlot(state, btn.dataset.slot);
      render(root, state);
      return;
    }

    if (action === 'toggle-location') {
      const id = btn.dataset.location;
      state.selectedLocations.has(id) ? state.selectedLocations.delete(id) : state.selectedLocations.add(id);
      render(root, state);
      return;
    }

    if (action === 'prev-days') {
      state.viewStart = addDays(state.viewStart, -VISIBLE_DAYS);
      render(root, state);
      return;
    }

    if (action === 'next-days') {
      state.viewStart = addDays(state.viewStart, VISIBLE_DAYS);
      render(root, state);
      return;
    }

    if (action === 'jump-slot') {
      const slot = btn.dataset.slot;
      state.viewStart = startOfDay(new Date(slot));
      setTab(state, 'calendar');
      state.selectedSlots.add(slot);
      render(root, state);
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

  function handleChange(e, root, state) {
    if (e.target.matches('[data-action="sort-order"]')) {
      state.sortOrder = e.target.value;
      render(root, state);
    }
    if (e.target.name === 'recurrence_type') {
      const extra = root.querySelector('#recurrence-extra');
      if (extra) extra.innerHTML = recurrenceExtraFields({ type: e.target.value });
    }
  }

  function handlePointerDown(e, root, state) {
    const slot = e.target.closest('[data-action="toggle-slot"]');
    if (!slot || !state.meet.attendees.find((a) => a.id === state.attendeeId)) return;
    state.dragging = true;
    state.dragSelect = !state.selectedSlots.has(slot.dataset.slot);
    if (state.dragSelect) state.selectedSlots.add(slot.dataset.slot);
    else state.selectedSlots.delete(slot.dataset.slot);
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
    let mins = start.hour * 60 + start.minute;
    const endMins = end.hour * 60 + end.minute;
    while (mins < endMins) {
      slots.push({ hour: Math.floor(mins / 60), minute: mins % 60 });
      mins += granularity;
    }
    return slots;
  }

  function parseTime(str) {
    const [h, m] = String(str || '08:00').split(':').map(Number);
    return { hour: h || 0, minute: m || 0 };
  }

  function recurrenceOptions(current) {
    return [
      ['none', 'One-off'], ['weekly', 'Weekly'], ['monthly_day', 'Day of month'],
      ['monthly_nth_weekday', 'Nth weekday'], ['friday_13th', 'Friday 13th'],
    ].map(([v, l]) => `<option value="${v}"${v === current ? ' selected' : ''}>${l}</option>`).join('');
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
    if (type === 'weekly') {
      base.interval = Number(fd.get('interval') || 1);
      base.weekdays = String(fd.get('weekdays') || '1').split(',').map((n) => Number(n.trim())).filter((n) => !Number.isNaN(n));
    } else if (type === 'monthly_day') {
      base.day = Number(fd.get('day') || 1);
      base.interval = Number(fd.get('interval') || 1);
    } else if (type === 'monthly_nth_weekday') {
      base.nth = Number(fd.get('nth') || 3);
      base.weekday = Number(fd.get('weekday') ?? 1);
      base.interval = Number(fd.get('interval') || 1);
    }
    return base;
  }

  function slotIsoFromLocal(day, hm) {
    const d = new Date(day);
    d.setHours(hm.hour, hm.minute, 0, 0);
    return d.toISOString();
  }

  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function toDateIso(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function formatDayHead(d) {
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function formatDayRangeLabel(days) {
    if (!days.length) return '';
    if (days.length === 1) return formatDayHead(days[0]);
    return `${formatDayHead(days[0])} – ${formatDayHead(days[days.length - 1])}`;
  }

  function formatHour(hm) {
    const d = new Date();
    d.setHours(hm.hour, hm.minute, 0, 0);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function formatSlotLocal(iso) {
    return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function attendeeName(m, id) { return m.attendees.find((a) => a.id === id)?.display_name || id; }
  function attendeeLabel(a) { return a.initials ? `${a.display_name} (${a.initials})` : a.display_name; }
  function attendeeLabelById(m, id) {
    const a = m.attendees.find((x) => x.id === id);
    return a ? attendeeLabel(a) : id;
  }
  function attendeeInitials(m, id) {
    const a = m.attendees.find((x) => x.id === id);
    return a ? (a.initials || deriveInitials(a.display_name)) : '';
  }
  function deriveInitials(name) {
    return String(name).trim().split(/\s+/).map((w) => w[0] || '').join('').slice(0, 3).toUpperCase();
  }
  function countSlotsFor(m, id) {
    return Object.values(m.availability).filter((ids) => ids.includes(id)).length;
  }
  function locationLabel(m, id) { return m.locations.find((l) => l.id === id)?.label || id; }
  function contactHref(c) { return String(c).includes('@') ? `mailto:${c}` : `tel:${c}`; }
  function lines(v) { return String(v || '').split('\n').map((s) => s.trim()).filter(Boolean); }
  function shareUrl(slug) {
    const base = window.location.pathname.replace(/\/$/, '');
    return `${window.location.origin}${base}/?${encodeURIComponent(slug)}`;
  }
  function slugify(v) {
    return String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'meet';
  }

  function sanitizeHtml(html) {
    const allowed = new Set(['P', 'BR', 'STRONG', 'EM', 'B', 'I', 'UL', 'OL', 'LI', 'A', 'SPAN', 'DIV']);
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    doc.body.querySelectorAll('*').forEach((el) => {
      if (!allowed.has(el.tagName)) el.replaceWith(...el.childNodes);
      else if (el.tagName === 'A') {
        [...el.attributes].forEach((a) => { if (a.name !== 'href') el.removeAttribute(a.name); });
        el.setAttribute('rel', 'noopener');
        el.setAttribute('target', '_blank');
      } else {
        [...el.attributes].forEach((a) => el.removeAttribute(a.name));
      }
    });
    return doc.body.innerHTML;
  }

  function escapeHtml(str) {
    return String(str).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  }

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
