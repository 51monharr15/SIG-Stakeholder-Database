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

?><!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?></title>
  <link rel="stylesheet" href="assets/css/style.css">
</head>
<body data-page="<?= htmlspecialchars($page, ENT_QUOTES, 'UTF-8') ?>"
      data-slug="<?= htmlspecialchars($slug ?? '', ENT_QUOTES, 'UTF-8') ?>">
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
            Meeting link name
            <input type="text" name="slug" placeholder="e.g. board-review" required pattern="[A-Za-z0-9 _\-]+">
          </label>
          <label>
            Title (optional)
            <input type="text" name="title" placeholder="Board review">
          </label>
          <button type="submit">Create meeting</button>
        </form>
        <p class="hint">Or open an existing link: <code>meet/?your-meeting-name</code></p>
      </section>
    <?php else: ?>
      <div id="app" class="app-loading">Loading meeting…</div>
    <?php endif; ?>
  </main>

  <footer class="site-footer">
    <div class="wrap">
      <small>Local times · <span id="footer-tz">…</span></small>
    </div>
  </footer>

  <script src="assets/js/app.js" defer></script>
</body>
</html>
