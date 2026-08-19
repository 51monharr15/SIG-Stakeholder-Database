<?php
$versionFile = __DIR__ . '/VERSION';
$appVersion = is_readable($versionFile) ? trim((string) file_get_contents($versionFile)) : 'dev';
$cssVer = is_readable(__DIR__ . '/assets/css/style.css') ? filemtime(__DIR__ . '/assets/css/style.css') : time();
?><!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>How to use the meeting scheduler</title>
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
    <a class="back-link" href="./">← Back to meeting scheduler</a>
    <h1>How to use the meeting scheduler</h1>
    <p>This page explains everything you need to know — whether you are setting up a brand-new meeting or joining one that someone else has created.</p>

    <div class="section-card">
      <h2 style="margin-top:0;border:none;padding:0">Contents</h2>
      <ol>
        <li><a href="#organiser">Setting up a meeting — organiser guide</a></li>
        <li><a href="#attendee">Joining a meeting — attendee guide</a></li>
        <li><a href="#tabs">What each tab does</a></li>
        <li><a href="#pins">PINs — what they are and why they matter</a></li>
        <li><a href="#links">The meeting link — keep it safe</a></li>
        <li><a href="#faq">Common questions</a></li>
      </ol>
    </div>

    <div class="section-card" id="organiser">
      <h2 style="margin-top:0;border:none;padding:0">1. Setting up a meeting — organiser guide</h2>

      <p>You start on the home page by entering a title and pressing <strong>Create meeting</strong>. The scheduler generates a private link with a random code and takes you straight to your new meeting. <strong>Save that link immediately</strong> — it is the only way back unless you set a PIN.</p>

      <h3>Step 1 — Set meeting options</h3>
      <p>Open the <strong>Meeting options</strong> tab (visible only to you as organiser until other attendees join).</p>
      <ul>
        <li><strong>Title</strong> — change it to something your attendees will recognise.</li>
        <li><strong>Meeting length</strong> — how long the meeting will be, in minutes. This determines how many consecutive calendar grid steps an attendee needs to mark as free before they count as "available" for the full meeting.</li>
        <li><strong>Grid step</strong> — how finely people can mark their availability. 15 minutes means quarter-hour slots; 30 minutes means half-hour slots.</li>
        <li><strong>Not before / Not after</strong> — the earliest and latest start time the calendar will show. Use your local office hours as a guide.</li>
        <li><strong>Timezone</strong> — the timezone used for the calendar grid. Set this to your timezone or the location of the meeting. Each person still sees times in their own browser timezone as well.</li>
        <li><strong>Include weekends</strong> — tick this if Saturday or Sunday are possible meeting days.</li>
        <li><strong>Description for attendees</strong> — optional text shown on the Overview page. Use it to explain the purpose of the meeting to people who receive the link.</li>
        <li><strong>Recurrence</strong> — if this is a regular meeting (e.g. monthly on the 3rd Monday), set it here. The calendar will highlight recurring dates. Leave as One-off for a one-time meeting.</li>
      </ul>
      <p>Press <strong>Save meeting options</strong> when done.</p>

      <h3>Step 2 — Add yourself as the first attendee</h3>
      <p>Open the <strong>Attendees</strong> tab. Fill in the <em>Add new attendee</em> form with your name (and optionally your initials, contact, and a numeric PIN). Choose <strong>Myself</strong> and press <strong>Add attendee</strong>.</p>
      <p>You will be signed in automatically and marked as the organiser.</p>
      <div class="tip"><strong>Why add a PIN?</strong> A PIN lets you find this meeting from the home page using <em>Find my meetings</em>, without needing the link. It also protects your row from being claimed by someone else. See <a href="#pins">PINs</a> below.</div>

      <h3>Step 3 — Mark your availability</h3>
      <p>Open <strong>My availability</strong>. The calendar shows the date range and time grid you configured. Click or tap any slot to mark yourself as free at that time. Click again to deselect. On a desktop, you can drag across multiple slots to select a range.</p>
      <p>Press <strong>Save my availability</strong> when done. You can come back and update your availability at any time.</p>

      <h3>Step 4 — Optionally propose a location</h3>
      <p>Open <strong>Locations</strong>. Use <em>Propose a location</em> to add an online meeting link (Zoom, Teams, Google Meet, or other URL), a physical venue, a hybrid option, or a dial-in number. You can add several options — attendees vote on them.</p>

      <h3>Step 5 — Share the link</h3>
      <p>Press <strong>Copy link</strong> at the top of the page and send it to your attendees by email, chat, or any other method. Anyone with the link can add themselves to the meeting.</p>

      <h3>Step 6 — Wait for attendees to respond, then agree the time</h3>
      <p>As attendees mark their availability, open <strong>Group availability</strong> to see when everyone (or most people) are free. When you find a good slot, press <strong>Use as meeting start</strong> on that slot — this carries the time to the <strong>Agree time</strong> tab.</p>
      <p>On <strong>Agree time</strong>, choose the final location from the dropdown and press <strong>Agree meeting time &amp; location</strong>. The meeting status badge changes to <strong>Agreed</strong> and the agreed time appears on the dashboard for all attendees.</p>
      <p>You can update the agreed time or location at any time by returning to <strong>Agree time</strong>.</p>
    </div>

    <div class="section-card" id="attendee">
      <h2 style="margin-top:0;border:none;padding:0">2. Joining a meeting — attendee guide</h2>

      <p>You have been sent a link that looks something like <code>https://example.com/meet/?=abc123xyz</code>. Open it in a browser.</p>

      <h3>Step 1 — Sign in or register</h3>
      <p>Open the <strong>Attendees</strong> tab.</p>
      <ul>
        <li>If you can see your name in the list, press <strong>This is me</strong> on your row. Enter your PIN if prompted.</li>
        <li>If your name is not there, fill in the <em>Add new attendee</em> form at the bottom of the page. Choose <strong>Myself</strong>, enter your name, and optionally set a PIN.</li>
      </ul>
      <p>Once signed in, your row is highlighted in the attendee table.</p>

      <h3>Step 2 — Mark your availability</h3>
      <p>Open <strong>My availability</strong>. Click or tap every slot when you are free. You can drag across slots on a desktop. Press <strong>Save my availability</strong> when done.</p>
      <p>Come back and update this whenever your availability changes — there is no deadline.</p>

      <h3>Step 3 — Review locations and vote</h3>
      <p>Open <strong>Locations</strong>. Click any location that would work for you — it turns blue to show it is selected. You can select several. Press <strong>Save my location preferences</strong> to record your choices.</p>
      <p>If you have a venue or online link to suggest, use <em>Propose a location</em> at the top of the tab.</p>

      <h3>Step 4 — Check the group overlap</h3>
      <p>Open <strong>Group availability</strong> to see when you and others are free at the same time. This is read-only — you cannot change anything here, but it is useful to understand what the organiser will see.</p>

      <h3>Step 5 — Check the agreed time</h3>
      <p>Open <strong>Agree time</strong> to see the current proposed or agreed meeting time and location. Only the organiser can change this, but you can see what has been decided.</p>

      <div class="tip">These steps can be done in any order and repeated as often as you like. The meeting evolves over time — check back if the organiser asks you to update your availability.</div>
    </div>

    <div class="section-card" id="tabs">
      <h2 style="margin-top:0;border:none;padding:0">3. What each tab does</h2>
      <dl style="line-height:1.7">
        <dt><strong>Overview</strong></dt>
        <dd>A summary of the meeting: current status, attendees, best overlap times, and any agenda or notes. For a new meeting, shows the setup steps.</dd>

        <dt><strong>Attendees</strong></dt>
        <dd>Add yourself or others, sign in to your existing row, edit your details (name, initials, contact, PIN), and see who has been invited.</dd>

        <dt><strong>My availability</strong></dt>
        <dd>The calendar grid. Mark every slot when you are free, then save. The organiser has set the time range — you mark within it.</dd>

        <dt><strong>Group availability</strong></dt>
        <dd>Shows when everyone's availability overlaps. "Everyone available" slots are the best candidates. "Not everyone available" slots show partial matches with details of who is free and who is not.</dd>

        <dt><strong>Locations</strong></dt>
        <dd>Propose meeting venues (online, physical, or hybrid), mark which ones work for you, and save your preferences.</dd>

        <dt><strong>Agree time</strong></dt>
        <dd>The organiser uses this to lock in the final meeting time and location. Attendees can see the current agreed or proposed time here.</dd>

        <dt><strong>Notes &amp; agenda</strong></dt>
        <dd>Pre-meeting agenda items, decisions required before the meeting, and preparatory notes. Anyone can edit these.</dd>

        <dt><strong>Records</strong></dt>
        <dd>After the meeting: attach recordings, transcripts, URLs, or paste AI-generated summaries.</dd>

        <dt><strong>Meeting options</strong> <em>(organiser only)</em></dt>
        <dd>All the settings that control the calendar grid: meeting length, grid step, time window, timezone, recurrence, and description for attendees.</dd>
      </dl>
    </div>

    <div class="section-card" id="pins">
      <h2 style="margin-top:0;border:none;padding:0">4. PINs — what they are and why they matter</h2>
      <p>A PIN is a short numeric code you choose when you add yourself to a meeting. PINs are optional but recommended.</p>
      <ul>
        <li><strong>Find your meetings</strong> — on the home page, use <em>Find my meetings</em> and enter your display name and PIN to get a list of all meetings you have joined. Without a PIN, you can only get back to a meeting via its link.</li>
        <li><strong>Security</strong> — if another person knows your display name, they cannot sign in as you on the Attendees tab without your PIN.</li>
        <li><strong>To set or change your PIN</strong> — open <strong>Attendees</strong>, press <strong>Edit my details</strong>, then press <strong>Set PIN</strong> or <strong>Change PIN</strong>. If you already have a PIN, you will need to enter it before setting a new one.</li>
      </ul>
      <div class="warn"><strong>PINs are not a strong security measure.</strong> This scheduler is designed for trusted groups sharing a private link. Anyone with the meeting link can see the list of attendees (but cannot sign in as a PIN-protected attendee without the PIN).</div>
    </div>

    <div class="section-card" id="links">
      <h2 style="margin-top:0;border:none;padding:0">5. The meeting link — keep it safe</h2>
      <p>The meeting URL contains a random 12-character code, for example <code>?=a7f3b2c91d04</code>. This code is the only identifier for your meeting.</p>
      <ul>
        <li>There is no login system. Anyone with the link can access the meeting.</li>
        <li>If you lose the link, use <em>Find my meetings</em> on the home page with your display name and PIN.</li>
        <li>To share the meeting: press <strong>Copy link</strong> at the top of the meeting page.</li>
        <li>Meetings are not listed publicly anywhere — only people you share the link with can find it.</li>
      </ul>
    </div>

    <div class="section-card" id="faq">
      <h2 style="margin-top:0;border:none;padding:0">6. Common questions</h2>

      <h3>I can see my name in the attendee list but I am not signed in. What do I do?</h3>
      <p>Open <strong>Attendees</strong> and press <strong>This is me</strong> on your row. Enter your PIN if you set one. If you did not set a PIN, press Continue without entering anything — you will be signed in immediately.</p>

      <h3>My name appears twice. How do I fix it?</h3>
      <p>Sign in to your correct row using <strong>This is me</strong>. If you see a duplicate row with your name, an <strong>Remove duplicate (keep me)</strong> button will appear on that row. Press it to merge the duplicate into your row.</p>
      <p>If you are an organiser, you can also use the <em>Merge duplicate attendees</em> tool at the bottom of the Attendees tab to merge any two rows.</p>

      <h3>I cannot see the Meeting options tab.</h3>
      <p>Meeting options is only visible to organisers. If you were added as a regular attendee, the organiser can grant you organiser rights from their Attendees view.</p>

      <h3>The calendar is greyed out and I cannot mark slots.</h3>
      <p>You need to be signed in as an attendee before you can mark availability. Open <strong>Attendees</strong> and sign in or add yourself first.</p>

      <h3>I have marked my availability but the Group availability tab still shows no overlaps.</h3>
      <p>Make sure you pressed <strong>Save my availability</strong> after marking your slots. Also check that you have marked enough consecutive slots — the meeting requires <?php /* duration note */ ?> a certain number of consecutive grid steps equal to the meeting length. For example, a 60-minute meeting with a 15-minute grid step needs 4 consecutive slots marked.</p>

      <h3>Can I change the agreed time after it has been set?</h3>
      <p>Yes — open <strong>Agree time</strong> and use <em>Update agreed time &amp; location</em>. Only organisers can do this.</p>

      <h3>Will attendees be notified by email?</h3>
      <p>No — the scheduler does not send any emails. Share the meeting link with people directly. When the time is agreed, let them know separately.</p>
    </div>

    <p class="meta" style="margin-top:1.5rem">Build <?= htmlspecialchars($appVersion, ENT_QUOTES, 'UTF-8') ?> · <a href="./">Back to meeting scheduler</a></p>
  </div>
</body>
</html>
