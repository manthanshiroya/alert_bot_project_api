#!/bin/bash

# Alert Bot Database Backup Script
# This script creates automated backups of MongoDB and Redis databases
# Usage: ./backup.sh [mongodb|redis|all] [--compress] [--encrypt]

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
DATE=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="${BACKUP_DIR}/backup_${DATE}.log"

# Database connection settings
MONGO_HOST="${MONGO_HOST:-mongodb}"
MONGO_PORT="${MONGO_PORT:-27017}"
MONGO_USERNAME="${MONGO_USERNAME:-admin}"
MONGO_PASSWORD="${MONGO_PASSWORD:-admin123}"
MONGO_DATABASE="${MONGO_DATABASE:-alert_bot_dev}"
MONGO_AUTH_DB="${MONGO_AUTH_DB:-admin}"

REDIS_HOST="${REDIS_HOST:-redis}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"

# Backup settings
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
COMPRESS="${COMPRESS:-true}"
ENCRYPT="${ENCRYPT:-false}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-}"

# Notification settings
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"
EMAIL_RECIPIENT="${EMAIL_RECIPIENT:-}"
SMTP_SERVER="${SMTP_SERVER:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case "$level" in
        "INFO")
            echo -e "${BLUE}[INFO]${NC} $message" | tee -a "$LOG_FILE"
            ;;
        "WARN")
            echo -e "${YELLOW}[WARN]${NC} $message" | tee -a "$LOG_FILE"
            ;;
        "ERROR")
            echo -e "${RED}[ERROR]${NC} $message" | tee -a "$LOG_FILE"
            ;;
        "SUCCESS")
            echo -e "${GREEN}[SUCCESS]${NC} $message" | tee -a "$LOG_FILE"
            ;;
        *)
            echo "[$timestamp] $message" | tee -a "$LOG_FILE"
            ;;
    esac
}

# Error handling
error_exit() {
    log "ERROR" "$1"
    send_notification "FAILED" "Backup failed: $1"
    exit 1
}

# Cleanup function
cleanup() {
    log "INFO" "Cleaning up temporary files..."
    rm -f /tmp/mongo_backup_*.tmp
    rm -f /tmp/redis_backup_*.tmp
}

# Trap for cleanup
trap cleanup EXIT

# Check dependencies
check_dependencies() {
    log "INFO" "Checking dependencies..."
    
    local deps=("mongodump" "redis-cli" "gzip" "tar")
    
    if [[ "$ENCRYPT" == "true" ]]; then
        deps+=("openssl")
    fi
    
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            error_exit "Required dependency '$dep' is not installed"
        fi
    done
    
    log "SUCCESS" "All dependencies are available"
}

# Create backup directory
create_backup_dir() {
    log "INFO" "Creating backup directory: $BACKUP_DIR"
    mkdir -p "$BACKUP_DIR" || error_exit "Failed to create backup directory"
    
    # Create subdirectories
    mkdir -p "$BACKUP_DIR/mongodb"
    mkdir -p "$BACKUP_DIR/redis"
    mkdir -p "$BACKUP_DIR/logs"
}

# Test database connections
test_connections() {
    log "INFO" "Testing database connections..."
    
    # Test MongoDB connection
    if ! mongosh --host "$MONGO_HOST:$MONGO_PORT" \
                 --username "$MONGO_USERNAME" \
                 --password "$MONGO_PASSWORD" \
                 --authenticationDatabase "$MONGO_AUTH_DB" \
                 --eval "db.runCommand('ping')" &>/dev/null; then
        error_exit "Failed to connect to MongoDB"
    fi
    
    # Test Redis connection
    local redis_cmd="redis-cli -h $REDIS_HOST -p $REDIS_PORT"
    if [[ -n "$REDIS_PASSWORD" ]]; then
        redis_cmd="$redis_cmd -a $REDIS_PASSWORD"
    fi
    
    if ! $redis_cmd ping &>/dev/null; then
        error_exit "Failed to connect to Redis"
    fi
    
    log "SUCCESS" "Database connections successful"
}

# Backup MongoDB
backup_mongodb() {
    log "INFO" "Starting MongoDB backup..."
    
    local backup_file="$BACKUP_DIR/mongodb/mongodb_backup_${DATE}"
    local temp_dir="/tmp/mongo_backup_${DATE}.tmp"
    
    # Create temporary directory
    mkdir -p "$temp_dir"
    
    # Perform backup
    log "INFO" "Dumping MongoDB database: $MONGO_DATABASE"
    
    if ! mongodump --host "$MONGO_HOST:$MONGO_PORT" \
                   --username "$MONGO_USERNAME" \
                   --password "$MONGO_PASSWORD" \
                   --authenticationDatabase "$MONGO_AUTH_DB" \
                   --db "$MONGO_DATABASE" \
                   --out "$temp_dir" \
                   --gzip; then
        error_exit "MongoDB dump failed"
    fi
    
    # Create archive
    log "INFO" "Creating MongoDB archive..."
    
    if [[ "$COMPRESS" == "true" ]]; then
        tar -czf "${backup_file}.tar.gz" -C "$temp_dir" .
        backup_file="${backup_file}.tar.gz"
    else
        tar -cf "${backup_file}.tar" -C "$temp_dir" .
        backup_file="${backup_file}.tar"
    fi
    
    # Encrypt if requested
    if [[ "$ENCRYPT" == "true" && -n "$ENCRYPTION_KEY" ]]; then
        log "INFO" "Encrypting MongoDB backup..."
        openssl enc -aes-256-cbc -salt -in "$backup_file" -out "${backup_file}.enc" -k "$ENCRYPTION_KEY"
        rm "$backup_file"
        backup_file="${backup_file}.enc"
    fi
    
    # Cleanup temporary directory
    rm -rf "$temp_dir"
    
    # Get file size
    local file_size=$(du -h "$backup_file" | cut -f1)
    
    log "SUCCESS" "MongoDB backup completed: $backup_file ($file_size)"
    echo "$backup_file" > "$BACKUP_DIR/mongodb/latest_backup.txt"
}

# Backup Redis
backup_redis() {
    log "INFO" "Starting Redis backup..."
    
    local backup_file="$BACKUP_DIR/redis/redis_backup_${DATE}"
    local temp_file="/tmp/redis_backup_${DATE}.tmp"
    
    # Build Redis CLI command
    local redis_cmd="redis-cli -h $REDIS_HOST -p $REDIS_PORT"
    if [[ -n "$REDIS_PASSWORD" ]]; then
        redis_cmd="$redis_cmd -a $REDIS_PASSWORD"
    fi
    
    # Force Redis to save current state
    log "INFO" "Forcing Redis BGSAVE..."
    if ! $redis_cmd BGSAVE; then
        error_exit "Redis BGSAVE failed"
    fi
    
    # Wait for background save to complete
    log "INFO" "Waiting for Redis background save to complete..."
    while [[ "$($redis_cmd LASTSAVE)" == "$($redis_cmd LASTSAVE)" ]]; do
        sleep 1
    done
    
    # Export Redis data using RDB dump
    log "INFO" "Exporting Redis data..."
    if ! $redis_cmd --rdb "$temp_file"; then
        error_exit "Redis RDB export failed"
    fi
    
    # Also export as Redis commands for human readability
    log "INFO" "Exporting Redis commands..."
    $redis_cmd --scan | while read -r key; do
        $redis_cmd DUMP "$key" | xxd -r -p | base64
    done > "${temp_file}.commands"
    
    # Create archive
    if [[ "$COMPRESS" == "true" ]]; then
        gzip -c "$temp_file" > "${backup_file}.rdb.gz"
        gzip -c "${temp_file}.commands" > "${backup_file}.commands.gz"
        backup_file="${backup_file}.rdb.gz"
    else
        cp "$temp_file" "${backup_file}.rdb"
        cp "${temp_file}.commands" "${backup_file}.commands"
        backup_file="${backup_file}.rdb"
    fi
    
    # Encrypt if requested
    if [[ "$ENCRYPT" == "true" && -n "$ENCRYPTION_KEY" ]]; then
        log "INFO" "Encrypting Redis backup..."
        openssl enc -aes-256-cbc -salt -in "$backup_file" -out "${backup_file}.enc" -k "$ENCRYPTION_KEY"
        rm "$backup_file"
        backup_file="${backup_file}.enc"
    fi
    
    # Cleanup temporary files
    rm -f "$temp_file" "${temp_file}.commands"
    
    # Get file size
    local file_size=$(du -h "$backup_file" | cut -f1)
    
    log "SUCCESS" "Redis backup completed: $backup_file ($file_size)"
    echo "$backup_file" > "$BACKUP_DIR/redis/latest_backup.txt"
}

# Clean old backups
clean_old_backups() {
    log "INFO" "Cleaning backups older than $RETENTION_DAYS days..."
    
    local deleted_count=0
    
    # Clean MongoDB backups
    while IFS= read -r -d '' file; do
        rm "$file"
        ((deleted_count++))
    done < <(find "$BACKUP_DIR/mongodb" -name "mongodb_backup_*" -type f -mtime +"$RETENTION_DAYS" -print0)
    
    # Clean Redis backups
    while IFS= read -r -d '' file; do
        rm "$file"
        ((deleted_count++))
    done < <(find "$BACKUP_DIR/redis" -name "redis_backup_*" -type f -mtime +"$RETENTION_DAYS" -print0)
    
    # Clean log files
    while IFS= read -r -d '' file; do
        rm "$file"
        ((deleted_count++))
    done < <(find "$BACKUP_DIR" -name "backup_*.log" -type f -mtime +"$RETENTION_DAYS" -print0)
    
    log "INFO" "Cleaned $deleted_count old backup files"
}

# Send notification
send_notification() {
    local status="$1"
    local message="$2"
    
    # Send Slack notification
    if [[ -n "$SLACK_WEBHOOK" ]]; then
        local color="good"
        if [[ "$status" == "FAILED" ]]; then
            color="danger"
        fi
        
        curl -X POST -H 'Content-type: application/json' \
             --data "{\"attachments\":[{\"color\":\"$color\",\"text\":\"Alert Bot Backup $status: $message\"}]}" \
             "$SLACK_WEBHOOK" &>/dev/null || true
    fi
    
    # Send email notification
    if [[ -n "$EMAIL_RECIPIENT" && -n "$SMTP_SERVER" ]]; then
        local subject="Alert Bot Backup $status"
        echo "$message" | mail -s "$subject" "$EMAIL_RECIPIENT" &>/dev/null || true
    fi
}

# Generate backup report
generate_report() {
    local start_time="$1"
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log "INFO" "Generating backup report..."
    
    local report_file="$BACKUP_DIR/backup_report_${DATE}.txt"
    
    cat > "$report_file" << EOF
Alert Bot Database Backup Report
================================

Backup Date: $(date)
Duration: ${duration} seconds
Backup Directory: $BACKUP_DIR

MongoDB Backup:
$(ls -la "$BACKUP_DIR/mongodb/mongodb_backup_${DATE}"* 2>/dev/null || echo "No MongoDB backup found")

Redis Backup:
$(ls -la "$BACKUP_DIR/redis/redis_backup_${DATE}"* 2>/dev/null || echo "No Redis backup found")

Disk Usage:
$(df -h "$BACKUP_DIR")

Backup Files Count:
- MongoDB: $(find "$BACKUP_DIR/mongodb" -name "mongodb_backup_*" -type f | wc -l)
- Redis: $(find "$BACKUP_DIR/redis" -name "redis_backup_*" -type f | wc -l)

Log File: $LOG_FILE
EOF
    
    log "SUCCESS" "Backup report generated: $report_file"
}

# Verify backup integrity
verify_backup() {
    log "INFO" "Verifying backup integrity..."
    
    # Verify MongoDB backup
    local mongodb_backup=$(find "$BACKUP_DIR/mongodb" -name "mongodb_backup_${DATE}*" -type f | head -1)
    if [[ -n "$mongodb_backup" ]]; then
        if [[ "$mongodb_backup" == *.tar.gz ]]; then
            if tar -tzf "$mongodb_backup" &>/dev/null; then
                log "SUCCESS" "MongoDB backup integrity verified"
            else
                log "ERROR" "MongoDB backup integrity check failed"
            fi
        fi
    fi
    
    # Verify Redis backup
    local redis_backup=$(find "$BACKUP_DIR/redis" -name "redis_backup_${DATE}*" -type f | head -1)
    if [[ -n "$redis_backup" ]]; then
        if [[ "$redis_backup" == *.gz ]]; then
            if gzip -t "$redis_backup" &>/dev/null; then
                log "SUCCESS" "Redis backup integrity verified"
            else
                log "ERROR" "Redis backup integrity check failed"
            fi
        fi
    fi
}

# Main function
main() {
    local backup_type="${1:-all}"
    local start_time=$(date +%s)
    
    log "INFO" "Starting Alert Bot database backup (type: $backup_type)"
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --compress)
                COMPRESS="true"
                shift
                ;;
            --encrypt)
                ENCRYPT="true"
                shift
                ;;
            --no-compress)
                COMPRESS="false"
                shift
                ;;
            *)
                shift
                ;;
        esac
    done
    
    # Setup
    check_dependencies
    create_backup_dir
    test_connections
    
    # Perform backups
    case "$backup_type" in
        "mongodb")
            backup_mongodb
            ;;
        "redis")
            backup_redis
            ;;
        "all")
            backup_mongodb
            backup_redis
            ;;
        *)
            error_exit "Invalid backup type: $backup_type. Use 'mongodb', 'redis', or 'all'"
            ;;
    esac
    
    # Post-backup tasks
    verify_backup
    clean_old_backups
    generate_report "$start_time"
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log "SUCCESS" "Backup completed successfully in ${duration} seconds"
    send_notification "SUCCESS" "Backup completed successfully in ${duration} seconds"
}

# Run main function with all arguments
main "$@"