@echo off
REM ============================================================================
REM  iMenu25 migration helper: run ONCE on the OLD computer (the one with MySQL 5.5).
REM  Right-click this file > "Run as administrator".
REM
REM  What it does
REM   1. creates a MySQL user "imenu_reader" that can ONLY READ one database
REM   2. opens Windows Firewall port 3306 for the home/work (private) network
REM   3. prints the values to type into iMenu25 > Migration
REM
REM  It changes nothing in the iMenu data. To undo, run remove access.bat steps at the bottom.
REM  NOTE: written for Windows 7 + MySQL 5.5; please tell me if any step fails.
REM ============================================================================
setlocal

set MYSQLBIN=C:\Program Files\MySQL\MySQL Server 5.5\bin
where mysql >nul 2>nul
if errorlevel 1 set PATH=%PATH%;%MYSQLBIN%
where mysql >nul 2>nul
if errorlevel 1 goto nomysql

set /p DB=Name of the iMenu database (e.g. imenu): 
set /p ROOTPW=MySQL root password (typing is visible): 
set PW=im%RANDOM%%RANDOM%%RANDOM%

mysql -u root -p%ROOTPW% -e "GRANT SELECT ON `%DB%`.* TO 'imenu_reader'@'%%' IDENTIFIED BY '%PW%'; FLUSH PRIVILEGES;"
if errorlevel 1 (
  echo.
  echo Could not create the read-only user. Check the root password and database name.
  pause & exit /b 1
)

netsh advfirewall firewall add rule name="MySQL 3306 (iMenu25 migration)" dir=in action=allow protocol=TCP localport=3306 profile=private,domain >nul
if errorlevel 1 echo WARNING: could not open the firewall. Run this file as administrator.

echo.
echo ====================  Type these into iMenu25 ^> Migration  ====================
echo   Address :  (one of the IPv4 addresses below)
ipconfig | findstr /i "IPv4"
echo   Port     : 3306
echo   User     : imenu_reader
echo   Password : %PW%
echo   Database : %DB%
echo ================================================================================
echo.
echo If iMenu25 still cannot connect, MySQL may only listen locally. In my.ini (the MySQL
echo folder or C:\ProgramData\MySQL) make sure there is no "bind-address=127.0.0.1" and no
echo "skip-networking", then restart the MySQL service.
echo.
echo When the migration is finished, remove the access with:
echo    mysql -u root -p -e "DROP USER 'imenu_reader'@'%%';"
echo    netsh advfirewall firewall delete rule name="MySQL 3306 (iMenu25 migration)"
echo.
pause
exit /b 0

:nomysql
echo "mysql.exe" was not found. Edit this file in Notepad: set MYSQLBIN (top of the script) to your MySQL "bin" folder.
pause
exit /b 1
