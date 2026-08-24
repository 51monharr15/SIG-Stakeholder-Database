<?php

require __DIR__ . '/lib/autoload.php';

use Meet\MeetFile;

function meet_resolve_slug(): ?string
{
    if (!empty($_GET['m'])) {
        return MeetFile::slugify((string) $_GET['m']);
    }

    $qs = $_SERVER['QUERY_STRING'] ?? '';
    if ($qs !== '' && !str_contains($qs, '=')) {
        return MeetFile::slugify(urldecode(explode('&', $qs, 2)[0]));
    }

    if (preg_match('/^=([^&]+)/', $qs, $m)) {
        return MeetFile::slugify(urldecode($m[1]));
    }

    if (!empty($_GET['slug'])) {
        return MeetFile::slugify((string) $_GET['slug']);
    }

    return null;
}

$slug = meet_resolve_slug();
$page = $slug ? 'scheduler' : 'home';
$title = $slug ? MeetFile::titleFromSlug($slug) : 'Meet Scheduler';

$versionFile = __DIR__ . '/VERSION';
$appVersion = is_readable($versionFile) ? trim((string) file_get_contents($versionFile)) : 'dev';
$cssVer = is_readable(__DIR__ . '/assets/css/style.css') ? filemtime(__DIR__ . '/assets/css/style.css') : time();
$jsVer = is_readable(__DIR__ . '/assets/js/app.js') ? filemtime(__DIR__ . '/assets/js/app.js') : time();

?><!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?></title>
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="assets/css/style.css?v=<?= (int) $cssVer ?>">
</head>
<body data-page="<?= htmlspecialchars($page, ENT_QUOTES, 'UTF-8') ?>"
      data-slug="<?= htmlspecialchars($slug ?? '', ENT_QUOTES, 'UTF-8') ?>"
      data-build="<?= htmlspecialchars($appVersion, ENT_QUOTES, 'UTF-8') ?>">
  <?php if ($page === 'home'): ?>
  <header class="site-header">
    <div class="wrap wrap-landing">
      <a class="brand" href="./">Simon's Meeting Scheduler</a>
    </div>
  </header>
  <?php endif; ?>

  <main class="wrap<?= $page === 'scheduler' ? ' wrap-scheduler' : ' wrap-landing' ?>">
    <?php if ($page === 'home'): ?>
      <div class="landing-stack">
        <section class="pane-region tint-create">
          <h1 class="section-title">Find a meeting time everyone can make</h1>
          <p class="lede">Propose availability, compare overlaps, and agree on a place to meet.</p>
          <p class="hint">Meeting locations can be online (URL) and physical (Simultaneously!). Times are shown to attendees in their local timezone (and UTC as 'reference').</p>
          <p class="hint" id="home-local-time">Your local time zone is …</p>
          <form id="create-form" class="create-form">
            <label>
              Meeting title
              <input type="text" name="title" placeholder="Board review" required>
            </label>
            <button type="submit">Create meeting</button>
          </form>
          <p class="hint">The <strong>Create meeting</strong> button generates a private link with a random URL. <strong>Save it and SEND to other proposed Attendees.</strong></p>
        </section>
        <section class="pane-region tint-find">
          <h2 class="section-title">Find my meetings</h2>
          <p class="meta">Enter the <strong>registered identity</strong> (exactly as when you joined) and <strong>passcode</strong> for a list of matching meetings.</p>
          <form id="list-meetings-form" class="create-form">
            <div class="find-meetings-fields">
              <label>Registered identity <input type="text" name="display_name" required autocomplete="username" placeholder="e.g. Alice@gmail.com or Bob"></label>
              <label>Passcode
                <input type="password" name="pin" id="find-pin-input" required autocomplete="off" maxlength="20" title="Stored as all lowercase. Letters, numbers, spaces, and safe specials. 2 to 20 characters.">
              </label>
            </div>
            <button type="submit">List my meetings</button>
          </form>
          <div id="list-meetings-result" class="list-meetings-result" hidden></div>
        </section>
      </div>
    <?php else: ?>
      <div id="app" class="app-loading">Loading meeting…</div>
    <?php endif; ?>
  </main>

  <footer class="site-footer">
    <div class="wrap">
      <small>Build <?= htmlspecialchars($appVersion, ENT_QUOTES, 'UTF-8') ?> · Local times · <span id="footer-tz">…</span> · <a href="operations.php">Installation, Operations and Maintenance Guide</a></small>
    </div>
  </footer>

  <script src="assets/js/app.js?v=<?= (int) $jsVer ?>" defer></script>
</body>
</html>
