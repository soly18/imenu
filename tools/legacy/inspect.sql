-- READ-ONLY inspection of a legacy iMenu (Delphi) MySQL database.
-- Changes nothing. Works on MySQL 5.5.
--
-- On the Win7 machine, from a Command Prompt (replace DBNAME and the password):
--   mysql -u root -p --default-character-set=utf8 DBNAME < inspect.sql > legacy-profile.txt
-- (If it complains about the charset, drop --default-character-set.)
-- Then send legacy-profile.txt back. It contains table/column names, row counts and
-- date ranges only: no customer names, no PINs, no amounts.

SELECT '== SERVER =='  AS section;
SELECT VERSION() AS mysql_version, @@character_set_server AS server_charset, @@collation_server AS server_collation;

SELECT '== DATABASE ==' AS section;
SELECT DATABASE() AS db, DEFAULT_CHARACTER_SET_NAME AS db_charset
FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE();

SELECT '== TABLES (engine, charset, rows, size MB) ==' AS section;
SELECT t.TABLE_NAME, t.ENGINE, c.CHARACTER_SET_NAME AS charset, t.TABLE_ROWS AS approx_rows,
       ROUND((t.DATA_LENGTH + t.INDEX_LENGTH) / 1048576, 2) AS size_mb
FROM information_schema.TABLES t
LEFT JOIN information_schema.COLLATION_CHARACTER_SET_APPLICABILITY c ON c.COLLATION_NAME = t.TABLE_COLLATION
WHERE t.TABLE_SCHEMA = DATABASE() ORDER BY t.TABLE_NAME;

SELECT '== COLUMNS ==' AS section;
SELECT TABLE_NAME, ORDINAL_POSITION AS pos, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE AS nullable,
       COLUMN_KEY AS key_type, CHARACTER_SET_NAME AS charset
FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME, ORDINAL_POSITION;

SELECT '== FOREIGN KEYS ==' AS section;
SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL;

SELECT '== INDEXES ==' AS section;
SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

SELECT '== VIEWS / TRIGGERS / ROUTINES ==' AS section;
SELECT 'view' AS kind, TABLE_NAME AS name FROM information_schema.VIEWS WHERE TABLE_SCHEMA = DATABASE()
UNION ALL SELECT 'trigger', TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()
UNION ALL SELECT 'routine', ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE();
