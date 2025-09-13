@echo off

REM Check if an argument was provided
if "%1"=="" (
    echo Usage: docker-compose.bat [up^|down]
    echo   up   - Build and start the Eateries Essentials container
    echo   down - Stop and remove the Eateries Essentials container
    pause
    exit /b 1
)

REM Handle the 'up' command
if /i "%1"=="up" (
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
    echo Eateries Essentials is now running!
    echo Open your browser and go to: http://localhost:8080
    echo.
    echo To stop the app, run: docker-compose down
    goto end
)

REM Handle the 'down' command
if /i "%1"=="down" (
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
    echo Cleanup complete! Container stopped and removed.
    echo.
    echo To start the app again, run: docker-compose up
    goto end
)

REM Handle invalid arguments
echo Invalid argument: %1
echo Usage: docker-compose.bat [up^|down]
echo   up   - Build and start the Eateries Essentials container
echo   down - Stop and remove the Eateries Essentials container
pause
exit /b 1

:end