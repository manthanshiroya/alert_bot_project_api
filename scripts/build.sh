#!/bin/bash

# =============================================================================
# Alert Bot Project - Docker Build Script
# =============================================================================
# This script helps build and manage Docker containers for the Alert Bot project

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="alert-bot-project"
DOCKER_COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env"
LOG_DIR="./logs"
DATA_DIR="./data"

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running. Please start Docker first."
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Function to setup environment
setup_environment() {
    print_info "Setting up environment..."
    
    # Create .env file if it doesn't exist
    if [ ! -f "$ENV_FILE" ]; then
        print_warning ".env file not found. Copying from .env.example"
        if [ -f ".env.example" ]; then
            cp .env.example .env
            print_info "Please edit .env file with your configuration"
        else
            print_error ".env.example file not found"
            exit 1
        fi
    fi
    
    # Create necessary directories
    mkdir -p "$LOG_DIR"/{api-gateway,subscription-service,alert-engine,telegram-service,mongodb,redis,nginx}
    mkdir -p "$DATA_DIR"/{mongodb,mongodb-config,redis,prometheus,grafana}
    mkdir -p ./database/backups
    
    # Set proper permissions
    chmod -R 755 "$LOG_DIR"
    chmod -R 755 "$DATA_DIR"
    
    print_success "Environment setup completed"
}

# Function to build images
build_images() {
    local service="$1"
    local no_cache="$2"
    
    print_info "Building Docker images..."
    
    local build_args=""
    if [ "$no_cache" = "true" ]; then
        build_args="--no-cache"
    fi
    
    if [ -n "$service" ]; then
        print_info "Building service: $service"
        docker-compose build $build_args "$service"
    else
        print_info "Building all services"
        docker-compose build $build_args
    fi
    
    print_success "Docker images built successfully"
}

# Function to start services
start_services() {
    local profile="$1"
    local detached="$2"
    
    print_info "Starting services..."
    
    local compose_args=""
    if [ -n "$profile" ]; then
        compose_args="--profile $profile"
    fi
    
    if [ "$detached" = "true" ]; then
        compose_args="$compose_args -d"
    fi
    
    docker-compose $compose_args up $compose_args
    
    if [ "$detached" = "true" ]; then
        print_success "Services started in detached mode"
        print_info "Use 'docker-compose logs -f' to view logs"
    fi
}

# Function to stop services
stop_services() {
    print_info "Stopping services..."
    docker-compose down
    print_success "Services stopped"
}

# Function to restart services
restart_services() {
    local service="$1"
    
    if [ -n "$service" ]; then
        print_info "Restarting service: $service"
        docker-compose restart "$service"
    else
        print_info "Restarting all services"
        docker-compose restart
    fi
    
    print_success "Services restarted"
}

# Function to show service status
show_status() {
    print_info "Service status:"
    docker-compose ps
    
    print_info "\nResource usage:"
    docker stats --no-stream
}

# Function to show logs
show_logs() {
    local service="$1"
    local follow="$2"
    local tail="$3"
    
    local log_args=""
    if [ "$follow" = "true" ]; then
        log_args="-f"
    fi
    
    if [ -n "$tail" ]; then
        log_args="$log_args --tail=$tail"
    fi
    
    if [ -n "$service" ]; then
        docker-compose logs $log_args "$service"
    else
        docker-compose logs $log_args
    fi
}

# Function to clean up
cleanup() {
    local volumes="$1"
    local images="$2"
    
    print_info "Cleaning up..."
    
    # Stop and remove containers
    docker-compose down
    
    # Remove volumes if requested
    if [ "$volumes" = "true" ]; then
        print_warning "Removing volumes (this will delete all data)"
        docker-compose down -v
        docker volume prune -f
    fi
    
    # Remove images if requested
    if [ "$images" = "true" ]; then
        print_warning "Removing images"
        docker-compose down --rmi all
    fi
    
    # Clean up unused Docker resources
    docker system prune -f
    
    print_success "Cleanup completed"
}

# Function to run health checks
health_check() {
    print_info "Running health checks..."
    
    local services=("api-gateway:3000" "subscription-service:3001" "alert-engine:3002" "telegram-service:3003")
    local all_healthy=true
    
    for service in "${services[@]}"; do
        local name=$(echo $service | cut -d':' -f1)
        local port=$(echo $service | cut -d':' -f2)
        
        print_info "Checking $name..."
        if curl -f -s "http://localhost:$port/health" > /dev/null; then
            print_success "$name is healthy"
        else
            print_error "$name is not responding"
            all_healthy=false
        fi
    done
    
    if [ "$all_healthy" = "true" ]; then
        print_success "All services are healthy"
    else
        print_error "Some services are not healthy"
        exit 1
    fi
}

# Function to backup data
backup_data() {
    print_info "Creating backup..."
    
    local backup_dir="./backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"
    
    # Backup database
    docker-compose exec -T mongodb mongodump --archive > "$backup_dir/mongodb_backup.archive"
    docker-compose exec -T redis redis-cli --rdb - > "$backup_dir/redis_backup.rdb"
    
    # Backup configuration
    cp -r ./services "$backup_dir/"
    cp .env "$backup_dir/"
    
    print_success "Backup created at $backup_dir"
}

# Function to show help
show_help() {
    echo "Alert Bot Project - Docker Build Script"
    echo ""
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  build [SERVICE]     Build Docker images (optionally for specific service)"
    echo "  start [PROFILE]     Start services (dev, production, monitoring)"
    echo "  stop                Stop all services"
    echo "  restart [SERVICE]   Restart services (optionally specific service)"
    echo "  status              Show service status and resource usage"
    echo "  logs [SERVICE]      Show logs (optionally for specific service)"
    echo "  health              Run health checks on all services"
    echo "  backup              Create backup of data and configuration"
    echo "  cleanup             Clean up containers and resources"
    echo "  setup               Setup environment and directories"
    echo ""
    echo "Options:"
    echo "  --no-cache          Build without using cache"
    echo "  --detached, -d      Run in detached mode"
    echo "  --follow, -f        Follow log output"
    echo "  --tail N            Show last N lines of logs"
    echo "  --volumes           Include volumes in cleanup"
    echo "  --images            Include images in cleanup"
    echo ""
    echo "Examples:"
    echo "  $0 setup                           # Setup environment"
    echo "  $0 build                           # Build all images"
    echo "  $0 build api-gateway --no-cache    # Build specific service without cache"
    echo "  $0 start dev -d                    # Start in development mode (detached)"
    echo "  $0 logs api-gateway -f             # Follow logs for API gateway"
    echo "  $0 restart alert-engine            # Restart alert engine service"
    echo "  $0 cleanup --volumes               # Clean up including volumes"
}

# Main script logic
main() {
    local command="$1"
    shift
    
    case "$command" in
        "setup")
            check_prerequisites
            setup_environment
            ;;
        "build")
            local service=""
            local no_cache=false
            
            while [[ $# -gt 0 ]]; do
                case $1 in
                    --no-cache)
                        no_cache=true
                        shift
                        ;;
                    *)
                        service="$1"
                        shift
                        ;;
                esac
            done
            
            check_prerequisites
            build_images "$service" "$no_cache"
            ;;
        "start")
            local profile=""
            local detached=false
            
            while [[ $# -gt 0 ]]; do
                case $1 in
                    -d|--detached)
                        detached=true
                        shift
                        ;;
                    *)
                        profile="$1"
                        shift
                        ;;
                esac
            done
            
            check_prerequisites
            start_services "$profile" "$detached"
            ;;
        "stop")
            stop_services
            ;;
        "restart")
            local service="$1"
            restart_services "$service"
            ;;
        "status")
            show_status
            ;;
        "logs")
            local service=""
            local follow=false
            local tail=""
            
            while [[ $# -gt 0 ]]; do
                case $1 in
                    -f|--follow)
                        follow=true
                        shift
                        ;;
                    --tail)
                        tail="$2"
                        shift 2
                        ;;
                    *)
                        service="$1"
                        shift
                        ;;
                esac
            done
            
            show_logs "$service" "$follow" "$tail"
            ;;
        "health")
            health_check
            ;;
        "backup")
            backup_data
            ;;
        "cleanup")
            local volumes=false
            local images=false
            
            while [[ $# -gt 0 ]]; do
                case $1 in
                    --volumes)
                        volumes=true
                        shift
                        ;;
                    --images)
                        images=true
                        shift
                        ;;
                    *)
                        shift
                        ;;
                esac
            done
            
            cleanup "$volumes" "$images"
            ;;
        "help"|"--help"|"-h"|"")
            show_help
            ;;
        *)
            print_error "Unknown command: $command"
            show_help
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"