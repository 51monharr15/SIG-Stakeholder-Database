<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

$configFile = __DIR__ . '/config.php';
if (!is_readable($configFile)) {
    die('<p style="color:red">Missing config.php in this directory.</p>');
}
$config = require $configFile;
$db = $config['database'] ?? null;
if (!is_array($db)) {
    die('<p style="color:red">config.php has no database settings.</p>');
}

$host    = $db['host'] ?? 'localhost';
$port    = (int) ($db['port'] ?? 3306);
$dbname  = $db['database'] ?? '';
$user    = $db['username'] ?? '';
$pass    = $db['password'] ?? '';
$charset = $db['charset'] ?? 'utf8mb4';
$prefix  = $db['prefix'] ?? '';
$table   = $prefix . 'users';
$pageSize = 50;

// Sortable columns: default direction when first clicked
$sort_options = [
    'joined_at'    => ['label' => 'Joined',    'default_dir' => 'DESC'],
    'last_seen_at' => ['label' => 'Last seen', 'default_dir' => 'DESC'],
    'username'     => ['label' => 'Username',  'default_dir' => 'ASC'],
    'nickname'     => ['label' => 'Nickname',  'default_dir' => 'ASC'],
];

$sort = (isset($_GET['sort']) && array_key_exists($_GET['sort'], $sort_options))
    ? $_GET['sort']
    : 'joined_at';

// Direction: use URL param if valid, otherwise use the column's default
$dir_param = strtoupper($_GET['dir'] ?? '');
$dir = in_array($dir_param, ['ASC', 'DESC'])
    ? $dir_param
    : $sort_options[$sort]['default_dir'];

// Build a URL for a column header click
// — same column: flip the direction
// — different column: use that column's default direction, reset to page 1
function colUrl($col, $current_sort, $current_dir, $sort_options) {
    if ($col === $current_sort) {
        $new_dir = ($current_dir === 'DESC') ? 'ASC' : 'DESC';
    } else {
        $new_dir = $sort_options[$col]['default_dir'];
    }
    return '?sort=' . urlencode($col) . '&dir=' . $new_dir . '&p=1';
}

function pageUrl($p, $sort, $dir) {
    return '?sort=' . urlencode($sort) . '&dir=' . $dir . '&p=' . $p;
}

/** Age vs server time: <1hr, Nh (up to 24h), Nd */
function ago($datetime) {
    $t = strtotime((string) $datetime);
    if ($t === false) {
        return '';
    }
    $diff = time() - $t;
    if ($diff < 0) {
        $diff = 0;
    }
    if ($diff < 3600) {
        return '<1hr';
    }
    if ($diff <= 86400) {
        return (int) floor($diff / 3600) . 'h';
    }
    return (int) floor($diff / 86400) . 'd';
}

try {
    $dsn = 'mysql:host=' . $host . ';port=' . $port . ';dbname=' . $dbname . ';charset=' . $charset;
    $pdo = new PDO(
        $dsn,
        $user,
        $pass,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
} catch (PDOException $e) {
    die('<p style="color:red">DB connection failed: ' . htmlspecialchars($e->getMessage()) . '</p>');
}

try {
    $total = (int) $pdo->query('SELECT COUNT(*) FROM `' . str_replace('`', '``', $table) . '`')->fetchColumn();
} catch (PDOException $e) {
    die('<p style="color:red">COUNT failed: ' . htmlspecialchars($e->getMessage()) . '</p>');
}

$pages  = max(1, (int) ceil($total / $pageSize));
$page   = max(1, min($pages, (int) ($_GET['p'] ?? 1)));
$offset = ($page - 1) * $pageSize;

try {
    $safeTable = '`' . str_replace('`', '``', $table) . '`';
    $stmt = $pdo->prepare(
        "SELECT username, nickname, email, joined_at, last_seen_at
         FROM {$safeTable}
         ORDER BY {$sort} {$dir}
         LIMIT :limit OFFSET :offset"
    );
    $stmt->bindValue(':limit',  $pageSize, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset,   PDO::PARAM_INT);
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    die('<p style="color:red">Query failed: ' . htmlspecialchars($e->getMessage()) . '</p>');
}

function h($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

function pager($page, $pages, $sort, $dir) {
    echo '<div class="pager">';
    if ($page > 1)
        echo '<a href="' . pageUrl($page-1, $sort, $dir) . '">&#8592; Prev</a>';
    for ($i = 1; $i <= $pages; $i++)
        echo '<a href="' . pageUrl($i, $sort, $dir) . '"' . ($i===$page ? ' class="cur"' : '') . '>' . $i . '</a>';
    if ($page < $pages)
        echo '<a href="' . pageUrl($page+1, $sort, $dir) . '">Next &#8594;</a>';
    echo '</div>';
}

// Arrow indicator: ▲ ASC, ▼ DESC
$arrow = $dir === 'DESC' ? ' &#9660;' : ' &#9650;';
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Users</title>
  <style>
    body   { font-family: sans-serif; font-size: 14px; margin: 1em; }
    h1     { font-size: 1.1em; }
    table  { border-collapse: collapse; width: 100%; }
    th,td  { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
    th     { background: #f0f0f0; white-space: nowrap; }
    th a   { text-decoration: none; color: #333; }
    th.cur { background: #dde; }
    tr:nth-child(even) { background: #fafafa; }
    .meta  { color: #666; margin-bottom: .5em; }
    .pager { margin: 1em 0; display: flex; flex-wrap: wrap; gap: 6px; }
    .pager a { padding: 5px 10px; border: 1px solid #aaa; border-radius: 3px;
               text-decoration: none; color: #333; }
    .pager a.cur { background: #333; color: #fff; border-color: #333; }
  </style>
</head>
<body>
<h1>Users</h1>
<p class="meta">
  <?= $total ?> users &nbsp;|&nbsp;
  Page <?= $page ?> of <?= $pages ?> &nbsp;|&nbsp;
  Sorted by: <strong><?= h($sort_options[$sort]['label']) ?></strong> (<?= $dir ?>)
</p>

<?php pager($page, $pages, $sort, $dir); ?>

<table>
  <thead>
    <tr>
      <?php
      $display_cols = [
          'username'     => 'Username',
          'nickname'     => 'Nickname',
          'email'        => 'Email',
          'joined_at'    => 'Joined',
          'last_seen_at' => 'Last seen',
      ];
      foreach ($display_cols as $col => $label):
          $isCur    = ($col === $sort);
          $sortable = array_key_exists($col, $sort_options);
      ?>
      <th<?= $isCur ? ' class="cur"' : '' ?>>
        <?php if ($sortable): ?>
          <a href="<?= colUrl($col, $sort, $dir, $sort_options) ?>">
            <?= $label ?><?= $isCur ? $arrow : '' ?>
          </a>
        <?php else: ?>
          <?= $label ?>
        <?php endif; ?>
      </th>
      <?php endforeach; ?>
    </tr>
  </thead>
  <tbody>
    <?php foreach ($rows as $r): ?>
    <tr>
      <td><?= h($r['username']) ?></td>
      <td><?= h($r['nickname'] ?? '') ?></td>
      <td><?= h($r['email']) ?></td>
      <td><?= $r['joined_at'] ? h($r['joined_at']) : '<em>—</em>' ?></td>
      <td><?= !empty($r['last_seen_at']) ? h(ago($r['last_seen_at'])) : '' ?></td>
    </tr>
    <?php endforeach; ?>
  </tbody>
</table>

<?php pager($page, $pages, $sort, $dir); ?>
</body>
</html>
