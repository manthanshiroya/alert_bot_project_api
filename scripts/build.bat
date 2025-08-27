@echo off
REM =============================================================================
REM Alert Bot Project - Docker Build Script (Windows)
REM =============================================================================
REM This script helps build and manage Docker containers for the Alert Bot project

setlocal enabledelayedexpansion

REM Configuration
set PROJECT_NAME=alert-bot-project
set DOCKER_COMPOSE_FILE=docker-compose.yml
set ENV_FILE=.env
set LOG_DIR=.\logs
set DATA_DIR=.\data

REM Function to print colored output
:print_info
echo [INFO] %~1
goto :eof

:print_success
echo [SUCCESS] %~1
goto :eof

:print_warning
echo [WARNING] %~1
goto :eof

:print_error
echo [ERROR] %~1
goto :eof

REM Function to check prerequisites
:check_prerequisites
call :print_info "Checking prerequisites..."

REM Check Docker
docker --version >nul 2>&1
if errorlevel 1 (
    call :print_error "Docker is not installed. Please install Docker Desktop first."
    exit /b 1
)

REM Check Docker Compose
docker-compose --version >nul 2>&1
if errorlevel 1 (
    call :print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit /b 1
)

REM Check if Docker daemon is running
docker info >nul 2>&1
if errorlevel 1 (
    call :print_error "Docker daemon is not running. Please start Docker Desktop first."
    exit /b 1
)

call :print_success "Prerequisites check passed"
goto :eof

REM Function to setup environment
:setup_environment
call :print_info "Setting up environment..."

REM Create .env file if it doesn't exist
if not exist "%ENV_FILE%" (
    call :print_warning ".env file not found. Copying from .env.example"
    if exist ".env.example" (
        copy .env.example .env >nul
        call :print_info "Please edit .env file with your configuration"
    ) else (
        call :print_error ".env.example file not found"
        exit /b 1
    )
)

REM Create necessary directories
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
if not exist "%LOG_DIR%\api-gateway" mkdir "%LOG_DIR%\api-gateway"
if not exist "%LOG_DIR%\subscription-service" mkdir "%LOG_DIR%\subscription-service"
if not exist "%LOG_DIR%\alert-engine" mkdir "%LOG_DIR%\alert-engine"
if not exist "%LOG_DIR%\telegram-service" mkdir "%LOG_DIR%\telegram-service"
if not exist "%LOG_DIR%\mongodb" mkdir "%LOG_DIR%\mongodb"
if not exist "%LOG_DIR%\redis" mkdir "%LOG_DIR%\redis"
if not exist "%LOG_DIR%\nginx" mkdir "%LOG_DIR%\nginx"

if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
if not exist "%DATA_DIR%\mongodb" mkdir "%DATA_DIR%\mongodb"
if not exist "%DATA_DIR%\mongodb-config" mkdir "%DATA_DIR%\mongodb-config"
if not exist "%DATA_DIR%\redis" mkdir "%DATA_DIR%\redis"
if not exist "%DATA_DIR%\prometheus" mkdir "%DATA_DIR%\prometheus"
if not exist "%DATA_DIR%\grafana" mkdir "%DATA_DIR%\grafana"

if not exist ".\database\backups" mkdir ".\database\backups"

call :print_success "Environment setup completed"
goto :eof

REM Function to build images
:build_images
set service=%~1
set no_cache=%~2

call :print_info "Building Docker images..."

set build_args=
if "%no_cache%"=="true" (
    set build_args=--no-cache
)

if not "%service%"=="" (
    call :print_info "Building service: %service%"
    docker-compose build %build_args% "%service%"
) else (
    call :print_info "Building all services"
    docker-compose build %build_args%
)

if errorlevel 1 (
    call :print_error "Failed to build Docker images"
    exit /b 1
)

call :print_success "Docker images built successfully"
goto :eof

REM Function to start services
:start_services
set profile=%~1
set detached=%~2

call :print_info "Starting services..."

set compose_args=
if not "%profile%"=="" (
    set compose_args=--profile %profile%
)

if "%detached%"=="true" (
    set compose_args=%compose_args% -d
)

docker-compose up %compose_args%

if "%detached%"=="true" (
    call :print_success "Services started in detached mode"
    call :print_info "Use 'docker-compose logs -f' to view logs"
)
goto :eof

REM Function to stop services
:stop_services
call :print_info "Stopping services..."
docker-compose down
call :print_success "Services stopped"
goto :eof

REM Function to restart services
:restart_services
set service=%~1

if not "%service%"=="" (
    call :print_info "Restarting service: %service%"
    docker-compose restart "%service%"
) else (
    call :print_info "Restarting all services"
    docker-compose restart
)

call :print_success "Services restarted"
goto :eof

REM Function to show service status
:show_status
call :print_info "Service status:"
docker-compose ps

echo.
call :print_info "Resource usage:"
docker stats --no-stream
goto :eof

REM Function to show logs
:show_logs
set service=%~1
set follow=%~2
set tail=%~3

set log_args=
if "%follow%"=="true" (
    set log_args=-f
)

if not "%tail%"=="" (
    set log_args=%log_args% --tail=%tail%
)

if not "%service%"=="" (
    docker-compose logs %log_args% "%service%"
) else (
    docker-compose logs %log_args%
)
goto :eof

REM Function to clean up
:cleanup
set volumes=%~1
set images=%~2

call :print_info "Cleaning up..."

REM Stop and remove containers
docker-compose down

REM Remove volumes if requested
if "%volumes%"=="true" (
    call :print_warning "Removing volumes (this will delete all data)"
    docker-compose down -v
    docker volume prune -f
)

REM Remove images if requested
if "%images%"=="true" (
    call :print_warning "Removing images"
    docker-compose down --rmi all
)

REM Clean up unused Docker resources
docker system prune -f

call :print_success "Cleanup completed"
goto :eof

REM Function to run health checks
:health_check
call :print_info "Running health checks..."

set all_healthy=true

REM Check API Gateway
call :print_info "Checking api-gateway..."
curl -f -s "http://localhost:3000/health" >nul 2>&1
if errorlevel 1 (
    call :print_error "api-gateway is not responding"
    set all_healthy=false
) else (
    call :print_success "api-gateway is healthy"
)

REM Check Subscription Service
call :print_info "Checking subscription-service..."
curl -f -s "http://localhost:3001/health" >nul 2>&1
if errorlevel 1 (
    call :print_error "subscription-service is not responding"
    set all_healthy=false
) else (
    call :print_success "subscription-service is healthy"
)

REM Check Alert Engine
call :print_info "Checking alert-engine..."
curl -f -s "http://localhost:3002/health" >nul 2>&1
if errorlevel 1 (
    call :print_error "alert-engine is not responding"
    set all_healthy=false
) else (
    call :print_success "alert-engine is healthy"
)

REM Check Telegram Service
call :print_info "Checking telegram-service..."
curl -f -s "http://localhost:3003/health" >nul 2>&1
if errorlevel 1 (
    call :print_error "telegram-service is not responding"
    set all_healthy=false
) else (
    call :print_success "telegram-service is healthy"
)

if "%all_healthy%"=="true" (
    call :print_success "All services are healthy"
) else (
    call :print_error "Some services are not healthy"
    exit /b 1
)
goto :eof

REM Function to backup data
:backup_data
call :print_info "Creating backup..."

for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "YY=%dt:~2,2%" & set "YYYY=%dt:~0,4%" & set "MM=%dt:~4,2%" & set "DD=%dt:~6,2%"
set "HH=%dt:~8,2%" & set "Min=%dt:~10,2%" & set "Sec=%dt:~12,2%"
set "backup_dir=.\backups\%YYYY%%MM%%DD%_%HH%%Min%%Sec%"

if not exist "%backup_dir%" mkdir "%backup_dir%"

REM Backup database
docker-compose exec -T mongodb mongodump --archive > "%backup_dir%\mongodb_backup.archive"
docker-compose exec -T redis redis-cli --rdb - > "%backup_dir%\redis_backup.rdb"

REM Backup configuration
xcopy /E /I .\services "%backup_dir%\services"
copy .env "%backup_dir%\"

call :print_success "Backup created at %backup_dir%"
goto :eof

REM Function to show help
:show_help
echo Alert Bot Project - Docker Build Script (Windows)
echo.
echo Usage: %~nx0 [COMMAND] [OPTIONS]
echo.
echo Commands:
echo   build [SERVICE]     Build Docker images (optionally for specific service)
echo   start [PROFILE]     Start services (dev, production, monitoring)
echo   stop                Stop all services
echo   restart [SERVICE]   Restart services (optionally specific service)
echo   status              Show service status and resource usage
echo   logs [SERVICE]      Show logs (optionally for specific service)
echo   health              Run health checks on all services
echo   backup              Create backup of data and configuration
echo   cleanup             Clean up containers and resources
echo   setup               Setup environment and directories
echo.
echo Options:
echo   --no-cache          Build without using cache
echo   --detached, -d      Run in detached mode
echo   --follow, -f        Follow log output
echo   --tail N            Show last N lines of logs
echo   --volumes           Include volumes in cleanup
echo   --images            Include images in cleanup
echo.
echo Examples:
echo   %~nx0 setup                           # Setup environment
echo   %~nx0 build                           # Build all images
echo   %~nx0 build api-gateway --no-cache    # Build specific service without cache
echo   %~nx0 start dev -d                    # Start in development mode (detached)
echo   %~nx0 logs api-gateway -f             # Follow logs for API gateway
echo   %~nx0 restart alert-engine            # Restart alert engine service
echo   %~nx0 cleanup --volumes               # Clean up including volumes
goto :eof

REM Main script logic
set command=%1
shift

if "%command%"=="setup" (
    call :check_prerequisites
    call :setup_environment
    goto :end
)

if "%command%"=="build" (
    set service=
    set no_cache=false
    
    :parse_build_args
    if "%1"=="" goto :build_done
    if "%1"=="--no-cache" (
        set no_cache=true
        shift
        goto :parse_build_args
    ) else (
        set service=%1
        shift
        goto :parse_build_args
    )
    
    :build_done
    call :check_prerequisites
    call :build_images "!service!" "!no_cache!"
    goto :end
)

if "%command%"=="start" (
    set profile=
    set detached=false
    
    :parse_start_args
    if "%1"=="" goto :start_done
    if "%1"=="-d" (
        set detached=true
        shift
        goto :parse_start_args
    )
    if "%1"=="--detached" (
        set detached=true
        shift
        goto :parse_start_args
    ) else (
        set profile=%1
        shift
        goto :parse_start_args
    )
    
    :start_done
    call :check_prerequisites
    call :start_services "!profile!" "!detached!"
    goto :end
)

if "%command%"=="stop" (
    call :stop_services
    goto :end
)

if "%command%"=="restart" (
    call :restart_services "%1"
    goto :end
)

if "%command%"=="status" (
    call :show_status
    goto :end
)

if "%command%"=="logs" (
    set service=
    set follow=false
    set tail=
    
    :parse_logs_args
    if "%1"=="" goto :logs_done
    if "%1"=="-f" (
        set follow=true
        shift
        goto :parse_logs_args
    )
    if "%1"=="--follow" (
        set follow=true
        shift
        goto :parse_logs_args
    )
    if "%1"=="--tail" (
        set tail=%2
        shift
        shift
        goto :parse_logs_args
    ) else (
        set service=%1
        shift
        goto :parse_logs_args
    )
    
    :logs_done
    call :show_logs "!service!" "!follow!" "!tail!"
    goto :end
)

if "%command%"=="health" (
    call :health_check
    goto :end
)

if "%command%"=="backup" (
    call :backup_data
    goto :end
)

if "%command%"=="cleanup" (
    set volumes=false
    set images=false
    
    :parse_cleanup_args
    if "%1"=="" goto :cleanup_done
    if "%1"=="--volumes" (
        set volumes=true
        shift
        goto :parse_cleanup_args
    )
    if "%1"=="--images" (
        set images=true
        shift
        goto :parse_cleanup_args
    ) else (
        shift
        goto :parse_cleanup_args
    )
    
    :cleanup_done
    call :cleanup "!volumes!" "!images!"
    goto :end
)

if "%command%"=="help" (
    call :show_help
    goto :end
)

if "%command%"=="--help" (
    call :show_help
    goto :end
)

if "%command%"=="-h" (
    call :show_help
    goto :end
)

if "%command%"=="" (
    call :show_help
    goto :end
)

REM Unknown command
call :print_error "Unknown command: %command%"
call :show_help
exit /b 1

:end
endlocal