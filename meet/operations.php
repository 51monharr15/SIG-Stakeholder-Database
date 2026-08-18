<?php

$versionFile = __DIR__ . '/VERSION';
$appVersion = is_readable($versionFile) ? trim((string) file_get_contents($versionFile)) : 'dev';
$cssVer = is_readable(__DIR__ . '/assets/css/style.css') ? filemtime(__DIR__ . '/assets/css/style.css') : time();
$mdPath = __DIR__ . '/docs/OPERATIONS.md';
$markdown = is_readable($mdPath) ? file_get_contents($mdPath) : 'Operations guide not found.';

function meet_inline_md(string $line): string
{
    $line = htmlspecialchars($line, ENT_QUOTES, 'UTF-8');
    $line = preg_replace('/\*\*(.+?)\*\*/', '<strong>$1</strong>', $line) ?? $line;
    $line = preg_replace('/`([^`]+)`/', '<code>$1</code>', $line) ?? $line;
    return $line;
}

/** @return list<string>|null */
function meet_parse_table_row(string $line): ?array
{
    $line = trim($line);
    if ($line === '' || !str_starts_with($line, '|')) {
        return null;
    }
    $inner = trim($line, '|');
    $cells = array_map('trim', explode('|', $inner));
    return $cells === [] ? null : $cells;
}

function meet_is_table_separator(array $cells): bool
{
    if ($cells === []) {
        return false;
    }
    foreach ($cells as $cell) {
        if (!preg_match('/^:?-{3,}:?$/', $cell)) {
            return false;
        }
    }
    return true;
}

function meet_render_table(array $rows): string
{
    if ($rows === []) {
        return '';
    }
    $header = array_shift($rows);
    $html = '<table class="ops-table"><thead><tr>';
    foreach ($header as $cell) {
        $html .= '<th>' . meet_inline_md($cell) . '</th>';
    }
    $html .= '</tr></thead><tbody>';
    foreach ($rows as $row) {
        $html .= '<tr>';
        foreach ($row as $cell) {
            $html .= '<td>' . meet_inline_md($cell) . '</td>';
        }
        $html .= '</tr>';
    }
    $html .= '</tbody></table>';
    return $html;
}

function meet_render_markdown(string $md): string
{
    $lines = preg_split('/\r\n|\r|\n/', $md);
    $html = '';
    $inPre = false;
    $inUl = false;
    $inOl = false;
    $i = 0;
    $count = count($lines);

    $closeLists = static function () use (&$html, &$inUl, &$inOl): void {
        if ($inUl) {
            $html .= "</ul>\n";
            $inUl = false;
        }
        if ($inOl) {
            $html .= "</ol>\n";
            $inOl = false;
        }
    };

    while ($i < $count) {
        $line = $lines[$i];

        if (str_starts_with($line, '```')) {
            $closeLists();
            if ($inPre) {
                $html .= "</code></pre>\n";
                $inPre = false;
            } else {
                $html .= "<pre><code>";
                $inPre = true;
            }
            $i++;
            continue;
        }

        if ($inPre) {
            $html .= htmlspecialchars($line, ENT_QUOTES, 'UTF-8') . "\n";
            $i++;
            continue;
        }

        if (preg_match('/^### (.+)$/', $line, $m)) {
            $closeLists();
            $html .= '<h3>' . meet_inline_md($m[1]) . "</h3>\n";
            $i++;
            continue;
        }
        if (preg_match('/^## (.+)$/', $line, $m)) {
            $closeLists();
            $html .= '<h2>' . meet_inline_md($m[1]) . "</h2>\n";
            $i++;
            continue;
        }
        if (preg_match('/^# (.+)$/', $line, $m)) {
            $closeLists();
            $html .= '<h1>' . meet_inline_md($m[1]) . "</h1>\n";
            $i++;
            continue;
        }

        $tableRow = meet_parse_table_row($line);
        if ($tableRow !== null) {
            $closeLists();
            $tableRows = [];
            while ($i < $count) {
                $row = meet_parse_table_row($lines[$i]);
                if ($row === null) {
                    break;
                }
                if (!meet_is_table_separator($row)) {
                    $tableRows[] = $row;
                }
                $i++;
            }
            $html .= meet_render_table($tableRows);
            continue;
        }

        if (preg_match('/^- (.+)$/', $line, $m)) {
            if ($inOl) {
                $html .= "</ol>\n";
                $inOl = false;
            }
            if (!$inUl) {
                $html .= "<ul>\n";
                $inUl = true;
            }
            $html .= '<li>' . meet_inline_md($m[1]) . "</li>\n";
            $i++;
            continue;
        }

        if (preg_match('/^\d+\. (.+)$/', $line, $m)) {
            if ($inUl) {
                $html .= "</ul>\n";
                $inUl = false;
            }
            if (!$inOl) {
                $html .= "<ol>\n";
                $inOl = true;
            }
            $html .= '<li>' . meet_inline_md($m[1]) . "</li>\n";
            $i++;
            continue;
        }

        if (trim($line) === '') {
            $closeLists();
            $html .= "\n";
            $i++;
            continue;
        }

        $closeLists();
        $html .= '<p>' . meet_inline_md($line) . "</p>\n";
        $i++;
    }

    $closeLists();
    if ($inPre) {
        $html .= "</code></pre>\n";
    }
    return $html;
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
    .ops-doc h1 { margin-top: 0; font-size: 1.45rem; }
    .ops-doc h2 { margin: 1.25rem 0 0.5rem; font-size: 1.15rem; }
    .ops-doc h3 { margin: 1rem 0 0.35rem; font-size: 1rem; font-weight: 600; }
    .ops-doc pre { background: #f8fafc; padding: 0.75rem; border-radius: 8px; overflow-x: auto; font-size: 0.88rem; }
    .ops-doc ul, .ops-doc ol { margin: 0.35rem 0 0.75rem 1.25rem; }
    .ops-doc li { margin: 0.2rem 0; }
    .ops-doc p { margin: 0.35rem 0 0.65rem; }
    .ops-table {
      width: 100%;
      border-collapse: collapse;
      margin: 0.5rem 0 1rem;
      font-size: 0.92rem;
    }
    .ops-table th, .ops-table td {
      border: 1px solid var(--line, #e5e7eb);
      padding: 0.4rem 0.55rem;
      text-align: left;
      vertical-align: top;
    }
    .ops-table th { background: #f8fafc; font-weight: 600; }
    .ops-table tbody tr:nth-child(even) { background: #fafbfc; }
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
