<?php

$versionFile = __DIR__ . '/VERSION';
$appVersion = is_readable($versionFile) ? trim((string) file_get_contents($versionFile)) : 'dev';
$cssVer = is_readable(__DIR__ . '/assets/css/style.css') ? filemtime(__DIR__ . '/assets/css/style.css') : time();
$mdPath = __DIR__ . '/docs/OPERATIONS.md';
$markdown = is_readable($mdPath) ? file_get_contents($mdPath) : 'Operations guide not found.';

function meet_render_markdown(string $md): string
{
    $html = '';
    $inPre = false;
    foreach (preg_split('/\r\n|\r|\n/', $md) as $line) {
        if (str_starts_with($line, '```')) {
            if ($inPre) {
                $html .= "</code></pre>\n";
                $inPre = false;
            } else {
                $html .= "<pre><code>";
                $inPre = true;
            }
            continue;
        }
        if ($inPre) {
            $html .= htmlspecialchars($line, ENT_QUOTES, 'UTF-8') . "\n";
            continue;
        }
        if (preg_match('/^## (.+)$/', $line, $m)) {
            $html .= '<h2>' . htmlspecialchars($m[1], ENT_QUOTES, 'UTF-8') . "</h2>\n";
            continue;
        }
        if (preg_match('/^# (.+)$/', $line, $m)) {
            $html .= '<h1>' . htmlspecialchars($m[1], ENT_QUOTES, 'UTF-8') . "</h1>\n";
            continue;
        }
        if (preg_match('/^\| (.+) \|$/', $line)) {
            $html .= '<p><code>' . htmlspecialchars($line, ENT_QUOTES, 'UTF-8') . "</code></p>\n";
            continue;
        }
        if (preg_match('/^- (.+)$/', $line, $m)) {
            $html .= '<li>' . meet_inline_md($m[1]) . "</li>\n";
            continue;
        }
        if (trim($line) === '') {
            $html .= "\n";
            continue;
        }
        $html .= '<p>' . meet_inline_md($line) . "</p>\n";
    }
    if ($inPre) {
        $html .= "</code></pre>\n";
    }
    return $html;
}

function meet_inline_md(string $line): string
{
    $line = htmlspecialchars($line, ENT_QUOTES, 'UTF-8');
    $line = preg_replace('/\*\*(.+?)\*\*/', '<strong>$1</strong>', $line) ?? $line;
    $line = preg_replace('/`([^`]+)`/', '<code>$1</code>', $line) ?? $line;
    return $line;
}

?><!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Meet Scheduler — operations guide</title>
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="assets/css/style.css?v=<?= (int) $cssVer ?>">
  <style>
    .ops-doc { max-width: 52rem; line-height: 1.55; }
    .ops-doc h1 { margin-top: 0; }
    .ops-doc h2 { margin: 1.25rem 0 0.5rem; font-size: 1.1rem; }
    .ops-doc pre { background: #f8fafc; padding: 0.75rem; border-radius: 8px; overflow-x: auto; }
    .ops-doc li { margin: 0.25rem 0 0.25rem 1.1rem; }
  </style>
</head>
<body data-page="home">
  <header class="site-header">
    <div class="wrap">
      <a class="brand" href="./">Meet Scheduler</a>
    </div>
  </header>
  <main class="wrap">
    <section class="panel ops-doc">
      <?= meet_render_markdown($markdown) ?>
      <p class="meta"><a href="./">← Back to Meet Scheduler</a></p>
    </section>
  </main>
  <footer class="site-footer">
    <div class="wrap">
      <small>Build <?= htmlspecialchars($appVersion, ENT_QUOTES, 'UTF-8') ?> · <a href="./">Home</a></small>
    </div>
  </footer>
</body>
</html>
