@echo off
rem Starts the Quotex bot. Used by the scheduled task so it runs
rem unattended and restarts on crash.
cd /d "%~dp0"
python main.py >> data\bot_console.log 2>&1
