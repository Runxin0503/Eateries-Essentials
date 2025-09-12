@echo off
echo Stopping and cleaning up Eateries Essentials container...

REM Stop the container
echo Stopping container...
docker stop eateries-app
if %ERRORLEVEL% neq 0 (
    echo Container was not running or already stopped.
)

REM Remove the container
echo Removing container...
docker rm eateries-app
if %ERRORLEVEL% neq 0 (
    echo Container was already removed or does not exist.
)

REM Optionally remove the image (uncomment if you want to clean up the image too)
REM echo Removing Docker image...
REM docker rmi eateries-essentials

echo.
echo ✅ Cleanup complete! Container stopped and removed.
echo.
echo To start the app again, run: build.bat