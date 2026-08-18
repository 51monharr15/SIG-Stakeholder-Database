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
  <link rel="stylesheet" href="assets/css/style.css?v=<?= (int) $cssVer ?>">
</head>
<body data-page="<?= htmlspecialchars($page, ENT_QUOTES, 'UTF-8') ?>"
      data-slug="<?= htmlspecialchars($slug ?? '', ENT_QUOTES, 'UTF-8') ?>"
      data-build="<?= htmlspecialchars($appVersion, ENT_QUOTES, 'UTF-8') ?>">
  <?php if ($page === 'home'): ?>
  <header class="site-header">
    <div class="wrap">
      <a class="brand" href="./">Meet Scheduler</a>
    </div>
  </header>
  <?php endif; ?>

  <main class="wrap<?= $page === 'scheduler' ? ' wrap-scheduler' : '' ?>">
    <?php if ($page === 'home'): ?>
      <section class="panel hero">
        <h1>Find a time everyone can make</h1>
        <p class="lede">Propose availability, compare overlaps, and agree on a place to meet.</p>
        <form id="create-form" class="create-form">
          <label>
            Meeting title
            <input type="text" name="title" placeholder="Board review" required>
          </label>
          <button type="submit">Create meeting</button>
        </form>
        <p class="hint">You get a private link with a random code. Save it — or use <strong>List my meetings</strong> below if you set a PIN when you joined as organiser.</p>
        <hr class="hero-divider">
        <h2 class="section-title">List my meetings</h2>
        <p class="meta">Enter the <strong>name</strong> and <strong>PIN</strong> you used when you registered as organiser (first person to join, with a PIN set).</p>
        <form id="list-meetings-form" class="create-form">
          <label>Your name <input type="text" name="display_name" required autocomplete="name"></label>
          <label>PIN <input type="text" name="pin" inputmode="numeric" pattern="[0-9]*" required autocomplete="off"></label>
          <button type="submit">List my meetings</button>
        </form>
        <div id="list-meetings-result" class="list-meetings-result" hidden></div>
      </section>
    <?php else: ?>
      <div id="app" class="app-loading">Loading meeting…</div>
    <?php endif; ?>
  </main>

  <footer class="site-footer">
    <div class="wrap">
      <small>Build <?= htmlspecialchars($appVersion, ENT_QUOTES, 'UTF-8') ?> · Local times · <span id="footer-tz">…</span></small>
    </div>
  </footer>

  <script src="assets/js/app.js?v=<?= (int) $jsVer ?>" defer></script>
</body>
</html>
