<?php
$versionFile = __DIR__ . '/VERSION';
$appVersion = is_readable($versionFile) ? trim((string) file_get_contents($versionFile)) : 'dev';
$cssVer = is_readable(__DIR__ . '/assets/css/style.css') ? filemtime(__DIR__ . '/assets/css/style.css') : time();
$back = (string) ($_GET['back'] ?? './');
if ($back === '' || preg_match('/^\s*javascript:/i', $back)) {
    $back = './';
}
?><!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Installation, Operations and Maintenance Guide</title>
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="assets/css/style.css?v=<?= (int) $cssVer ?>">
  <style>
    .ops-wrap { max-width: 820px; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
    .ops-wrap h1 { margin-top: 0; font-size: 1.6rem; }
    .ops-wrap h2 { font-size: 1.2rem; margin-top: 2rem; border-top: 1px solid #d8dee6; padding-top: 0.75rem; }
    .ops-wrap h3 { font-size: 1rem; margin-top: 1.25rem; }
    .ops-wrap ol, .ops-wrap ul { line-height: 1.7; padding-left: 1.4rem; }
    .ops-wrap li { margin-bottom: 0.35rem; }
    .ops-wrap .tip {
      background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px;
      padding: 0.65rem 0.9rem; margin: 0.75rem 0; font-size: 0.92rem;
    }
    .ops-wrap .warn {
      background: #fefce8; border: 1px solid #fde68a; border-radius: 8px;
      padding: 0.65rem 0.9rem; margin: 0.75rem 0; font-size: 0.92rem;
    }
    .ops-wrap code { background: #f1f5f9; padding: 0.1rem 0.35rem; border-radius: 4px; font-size: 0.9em; }
    .back-link { display: inline-block; margin-bottom: 1.25rem; color: var(--accent); font-size: 0.92rem; }
    .section-card { background: #fff; border: 1px solid #d8dee6; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); padding: 1.25rem 1.5rem; margin-bottom: 1.25rem; }
  </style>
</head>
<body>
  <div class="ops-wrap">
    <a class="back-link" href="<?= htmlspecialchars($back, ENT_QUOTES, 'UTF-8') ?>">← Back to meeting scheduler</a>
    <h1>Installation, Operations and Maintenance Guide</h1>
    <p>How to run and use the meeting scheduler — for organisers, attendees, and anyone installing or maintaining a copy.</p>

    <div class="section-card">
      <h2 style="margin-top:0;border:none;padding:0">Contents</h2>
      <ol>
        <li><a href="#operations">Operations — using the scheduler</a></li>
        <li><a href="#maintenance">Maintenance</a></li>
        <li><a href="#installation">Installation</a></li>
      </ol>
    </div>

    <div class="section-card" id="operations">
      <h2 style="margin-top:0;border:none;padding:0">1. Operations — using the scheduler</h2>

      <h3>Buttons (colour meaning)</h3>
      <ul>
        <li><strong>Blue</strong> — an action that saves or changes meeting data (Save, Accept proposed start, Add attendee, Copy meeting link).</li>
        <li><strong>Green</strong> — navigation (dashboard tabs, “Go to…”).</li>
        <li><strong>Light grey / neutral</strong> — Cancel or Close (still clickable).</li>
        <li><strong>Muted grey</strong> — disabled but visible. Hover or long-press for “Disabled because …”.</li>
      </ul>

      <h3>Setting up a meeting (organiser)</h3>
      <ol>
        <li>On the home page, enter a title and press <strong>Create meeting</strong>. Save the private URL.</li>
        <li>Use <strong>Getting started</strong> for the checklist, or open tabs directly.</li>
        <li><strong>Meeting options</strong> — edit title and description, meeting length, calendar slot duration, weekends, recurrence, and the earliest/latest date and daily hours.</li>
        <li><strong>Attendees</strong> — add yourself first (you become organiser). Optionally set a <strong>passcode</strong> (2–20 characters, stored as lowercase) so you can use <em>Find my meetings</em> later.</li>
        <li>Optionally add other proposed attendees and grant organiser rights. Anyone with the link can also add themselves. An identity without a passcode can be claimed by anyone.</li>
        <li><strong>My availability</strong> — mark free slots; save any time. Clicking a selected slot deselects it — save again after changes.</li>
        <li><strong>Locations</strong> — propose online or physical places and mark which work for you. Initials show who has OK’d each location.</li>
        <li><strong>Copy meeting link</strong> and send it so others can record availability, locations, agenda, and attachments.</li>
        <li>On <strong>Set confirmed meeting details</strong>, click a start slot (proposed), choose a location, then press <strong>Accept proposed start as scheduled start time</strong>. Status becomes <em>Scheduled</em> (or <em>Rescheduled</em> if you change it later).</li>
      </ol>

      <h3>Joining a meeting (attendee)</h3>
      <ol>
        <li>Open the meeting link. Status is shown at the top of every page.</li>
        <li>On <strong>Attendees</strong>, press <em>This is me</em> or add yourself. Use your passcode if prompted.</li>
        <li>Mark availability on <strong>My availability</strong>; vote or propose on <strong>Locations</strong>.</li>
        <li>Open <strong>Set confirmed meeting details</strong> to see overlaps (organisers set the scheduled time; the accept button is disabled for others).</li>
        <li>Use <strong>Agenda, Attachments and Records</strong> for agenda, decisions, notes, and after-meeting materials.</li>
      </ol>

      <h3>Dashboard tabs</h3>
      <dl style="line-height:1.7">
        <dt><strong>Getting started</strong></dt>
        <dd>Persistent setup checklist for organisers.</dd>
        <dt><strong>Overview</strong></dt>
        <dd>Summary: status, description, agenda, attendees, best start times, location popularity.</dd>
        <dt><strong>Attendees</strong></dt>
        <dd>Register, claim identity, edit details and passcode, organiser roles.</dd>
        <dt><strong>My availability</strong></dt>
        <dd>Your free times on the calendar grid.</dd>
        <dt><strong>Set confirmed meeting details</strong></dt>
        <dd>Overlap view and organiser scheduling. Selecting a confirmed meeting time requires organiser status.</dd>
        <dt><strong>Locations</strong></dt>
        <dd>Propose and vote; see who OK’d each place.</dd>
        <dt><strong>Agenda, Attachments and Records</strong></dt>
        <dd>Agenda and notes; attachments; recordings, transcripts, and summaries.</dd>
        <dt><strong>Meeting options</strong> <em>(organiser)</em></dt>
        <dd>Title, description, length, slot duration, date/time window, timezone, recurrence.</dd>
      </dl>

      <h3 id="passcodes">Passcodes</h3>
      <p>A passcode protects your attendee row and lets you find meetings from the home page without the URL.</p>
      <ul>
        <li>2 to 20 characters: letters, digits, spaces, and safe specials (not <code>|</code>). Stored as all lowercase.</li>
        <li><em>Find my meetings</em> needs registered name <strong>and</strong> passcode.</li>
        <li>Change or remove it under <strong>Edit my details</strong> on Attendees.</li>
      </ul>
      <div class="warn"><strong>Passcodes are not strong security.</strong> Anyone with the meeting link can see the attendee list. They cannot claim a passcode-protected row without the passcode.</div>

      <h3>Status values</h3>
      <ul>
        <li><strong>Enter organiser details</strong> — no attendees yet.</li>
        <li><strong>Enter attendee details</strong> — attendees present; time/location not yet accepted.</li>
        <li><strong>Scheduled</strong> — organiser accepted a start time and location.</li>
        <li><strong>Rescheduled</strong> — organiser changed a previously scheduled time or location.</li>
        <li><strong>Past</strong> — current time is after the scheduled start.</li>
        <li><strong>Summarised</strong> — past, and records/attachments exist.</li>
      </ul>

      <div class="tip"><strong>Design note for maintainers:</strong> availability is stored in UTC; the calendar grid hours use the meeting timezone so everyone marks the same slots. Each person also sees times in their browser timezone.</div>
    </div>

    <div class="section-card" id="maintenance">
      <h2 style="margin-top:0;border:none;padding:0">2. Maintenance</h2>
      <ul>
        <li>Meeting data lives under <code>meet/data/meets/</code> as plain-text <code>.meet</code> files. Back up that directory.</li>
        <li>Do not put <code>|</code> characters in passcodes or pipe-separated fields — they break the file format.</li>
        <li>After deploying updates, hard-refresh browsers (Ctrl+F5) so <code>app.js</code> and <code>style.css</code> reload.</li>
        <li>Housekeeping idea (future): delete old meetings from <em>Find my meetings</em> after the confirmed date (or last availability date) has passed, re-checking name + passcode.</li>
      </ul>
    </div>

    <div class="section-card" id="installation">
      <h2 style="margin-top:0;border:none;padding:0">3. Installation</h2>
      <div class="warn"><strong>Not a hardened application.</strong> Meet Scheduler is built for trusted groups sharing a private link. It aims to stop easy mistakes (wrong pane, accidental edits by non-organisers), not to resist a determined attacker who has the meeting URL or crafts API requests. Do not use it where strong authentication, audit trails, or hostile-user security are required.</div>
      <h3>Local PHP test server</h3>
      <p>Serve from the <code>meet</code> directory (the folder that contains <code>index.php</code>), not its parent:</p>
      <pre><code>cd path\to\SIG-Stakeholder-Database\meet
php -S localhost:8000</code></pre>
      <p>Open <code>http://localhost:8000/</code>. Requires PHP 8.1+.</p>
      <h3>Production</h3>
      <p>Deploy the <code>meet</code> tree to your web server (Apache recommended). Ensure <code>meet/data/</code> is writable by the web user. Pretty URLs are optional; query-string links like <code>?=slug</code> always work.</p>
    </div>

    <p class="meta" style="margin-top:1.5rem">Build <?= htmlspecialchars($appVersion, ENT_QUOTES, 'UTF-8') ?> · <a href="<?= htmlspecialchars($back, ENT_QUOTES, 'UTF-8') ?>">Back to meeting scheduler</a></p>
  </div>
</body>
</html>
