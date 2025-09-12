@echo off
echo Building and starting Eateries Essentials monolith container...

REM Stop and remove existing container if it exists
echo Cleaning up any existing container...
docker stop eateries-app 2>nul
docker rm eateries-app 2>nul

REM Build the Docker image
echo Building Docker image...
docker build -t eateries-essentials .
if %ERRORLEVEL% neq 0 (
    echo Failed to build Docker image!
    pause
    exit /b 1
)

REM Run the container with persistent data volume
echo Starting container...
docker run -d -p 8080:80 -v eateries-data:/app/data --name eateries-app eateries-essentials
if %ERRORLEVEL% neq 0 (
    echo Failed to start container!
    pause
    exit /b 1
)

echo.
echo ✅ Eateries Essentials is now running!
echo 🌐 Open your browser and go to: http://localhost:8080
echo.
echo To stop the app, run: destroy.bat