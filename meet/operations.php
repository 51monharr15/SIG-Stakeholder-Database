<?php

/**
 * Displays docs/OPERATIONS.md in the browser.
 * Edit the Markdown file only — this page is just the viewer.
 */

$versionFile = __DIR__ . '/VERSION';
$appVersion = is_readable($versionFile) ? trim((string) file_get_contents($versionFile)) : 'dev';
$cssVer = is_readable(__DIR__ . '/assets/css/style.css') ? filemtime(__DIR__ . '/assets/css/style.css') : time();
$back = (string) ($_GET['back'] ?? './');
if ($back === '' || preg_match('/^\s*javascript:/i', $back)) {
    $back = './';
}

$mdPath = __DIR__ . '/docs/OPERATIONS.md';
$markdown = is_readable($mdPath) ? (string) file_get_contents($mdPath) : "# Guide missing\n\nCould not read `docs/OPERATIONS.md`.";

require_once __DIR__ . '/lib/Parsedown.php';
$parsedown = new Parsedown();
$parsedown->setSafeMode(true);
$html = $parsedown->text($markdown);

// Heading anchors: {#id} in the Markdown title, or auto from text
$html = preg_replace_callback(
    '/<(h[1-3])>(.*?)\s*\{#([a-z0-9\-]+)\}<\/\1>/is',
    static fn (array $m): string => '<' . $m[1] . ' id="' . htmlspecialchars($m[3], ENT_QUOTES, 'UTF-8') . '">' . $m[2] . '</' . $m[1] . '>',
    $html
) ?? $html;

// Tip / warning blockquotes
$html = preg_replace(
    '/<blockquote>\s*<p>\s*<strong>\s*Warning:\s*<\/strong>\s*/i',
    '<blockquote class="warn"><p>',
    $html
) ?? $html;
$html = preg_replace(
    '/<blockquote>\s*<p>\s*<strong>\s*Tip:\s*<\/strong>\s*/i',
    '<blockquote class="tip"><p>',
    $html
) ?? $html;

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
    .ops-wrap blockquote.tip {
      background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px;
      padding: 0.65rem 0.9rem; margin: 0.75rem 0; font-size: 0.92rem;
    }
    .ops-wrap blockquote.warn {
      background: #fefce8; border: 1px solid #fde68a; border-radius: 8px;
      padding: 0.65rem 0.9rem; margin: 0.75rem 0; font-size: 0.92rem;
    }
    .ops-wrap code { background: #f1f5f9; padding: 0.1rem 0.35rem; border-radius: 4px; font-size: 0.9em; }
    .ops-wrap pre { background: #f1f5f9; padding: 0.75rem 1rem; border-radius: 8px; overflow-x: auto; }
    .ops-wrap pre code { background: none; padding: 0; }
    .back-link { display: inline-block; margin-bottom: 1.25rem; color: var(--accent); font-size: 0.92rem; }
  </style>
</head>
<body>
  <div class="ops-wrap">
    <a class="back-link" href="<?= htmlspecialchars($back, ENT_QUOTES, 'UTF-8') ?>">← Back to meeting scheduler</a>
    <div class="ops-body">
      <?= $html ?>
    </div>
    <p class="meta" style="margin-top:1.5rem">Build <?= htmlspecialchars($appVersion, ENT_QUOTES, 'UTF-8') ?> · <a href="<?= htmlspecialchars($back, ENT_QUOTES, 'UTF-8') ?>">Back to meeting scheduler</a></p>
  </div>
</body>
</html>
