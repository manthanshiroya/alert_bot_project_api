#!/bin/bash

# Alert Bot Database Restore Script
# This script restores MongoDB and Redis databases from backups
# Usage: ./restore.sh [mongodb|redis|all] <backup_file> [--decrypt] [--force]

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
DATE=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="${BACKUP_DIR}/restore_${DATE}.log"

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

# Restore settings
DECRYPT="${DECRYPT:-false}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-}"
FORCE="${FORCE:-false}"

# Notification settings
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"
EMAIL_RECIPIENT="${EMAIL_RECIPIENT:-}"

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
    send_notification "FAILED" "Restore failed: $1"
    cleanup
    exit 1
}

# Cleanup function
cleanup() {
    log "INFO" "Cleaning up temporary files..."
    rm -rf /tmp/mongo_restore_*.tmp
    rm -rf /tmp/redis_restore_*.tmp
    rm -f /tmp/decrypted_*.tmp
}

# Trap for cleanup
trap cleanup EXIT

# Check dependencies
check_dependencies() {
    log "INFO" "Checking dependencies..."
    
    local deps=("mongorestore" "redis-cli" "tar" "gzip")
    
    if [[ "$DECRYPT" == "true" ]]; then
        deps+=("openssl")
    fi
    
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            error_exit "Required dependency '$dep' is not installed"
        fi
    done
    
    log "SUCCESS" "All dependencies are available"
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

# Validate backup file
validate_backup_file() {
    local backup_file="$1"
    
    if [[ ! -f "$backup_file" ]]; then
        error_exit "Backup file not found: $backup_file"
    fi
    
    if [[ ! -r "$backup_file" ]]; then
        error_exit "Backup file is not readable: $backup_file"
    fi
    
    log "SUCCESS" "Backup file validated: $backup_file"
}

# Decrypt backup file if needed
decrypt_backup() {
    local backup_file="$1"
    local output_file="$2"
    
    if [[ "$DECRYPT" == "true" ]]; then
        if [[ -z "$ENCRYPTION_KEY" ]]; then
            error_exit "Encryption key is required for decryption"
        fi
        
        log "INFO" "Decrypting backup file..."
        
        if ! openssl enc -aes-256-cbc -d -salt -in "$backup_file" -out "$output_file" -k "$ENCRYPTION_KEY"; then
            error_exit "Failed to decrypt backup file"
        fi
        
        log "SUCCESS" "Backup file decrypted successfully"
    else
        cp "$backup_file" "$output_file"
    fi
}

# Create database backup before restore
create_pre_restore_backup() {
    local db_type="$1"
    
    if [[ "$FORCE" == "true" ]]; then
        log "WARN" "Skipping pre-restore backup due to --force flag"
        return
    fi
    
    log "INFO" "Creating pre-restore backup of $db_type..."
    
    local backup_script="$SCRIPT_DIR/backup.sh"
    if [[ -f "$backup_script" ]]; then
        if ! "$backup_script" "$db_type"; then
            log "WARN" "Pre-restore backup failed, but continuing with restore"
        else
            log "SUCCESS" "Pre-restore backup completed"
        fi
    else
        log "WARN" "Backup script not found, skipping pre-restore backup"
    fi
}

# Restore MongoDB
restore_mongodb() {
    local backup_file="$1"
    
    log "INFO" "Starting MongoDB restore from: $backup_file"
    
    # Create pre-restore backup
    create_pre_restore_backup "mongodb"
    
    local temp_dir="/tmp/mongo_restore_${DATE}.tmp"
    local decrypted_file="/tmp/decrypted_mongo_${DATE}.tmp"
    
    # Create temporary directory
    mkdir -p "$temp_dir"
    
    # Decrypt if needed
    decrypt_backup "$backup_file" "$decrypted_file"
    
    # Extract backup
    log "INFO" "Extracting MongoDB backup..."
    
    if [[ "$decrypted_file" == *.tar.gz ]]; then
        if ! tar -xzf "$decrypted_file" -C "$temp_dir"; then
            error_exit "Failed to extract MongoDB backup"
        fi
    elif [[ "$decrypted_file" == *.tar ]]; then
        if ! tar -xf "$decrypted_file" -C "$temp_dir"; then
            error_exit "Failed to extract MongoDB backup"
        fi
    else
        error_exit "Unsupported MongoDB backup format"
    fi
    
    # Find the database directory
    local db_dir=$(find "$temp_dir" -name "$MONGO_DATABASE" -type d | head -1)
    if [[ -z "$db_dir" ]]; then
        error_exit "Database directory not found in backup"
    fi
    
    # Confirm restore operation
    if [[ "$FORCE" != "true" ]]; then
        echo -e "${YELLOW}WARNING: This will replace the existing database '$MONGO_DATABASE'${NC}"
        echo -e "${YELLOW}Are you sure you want to continue? (yes/no):${NC}"
        read -r confirmation
        if [[ "$confirmation" != "yes" ]]; then
            log "INFO" "Restore operation cancelled by user"
            exit 0
        fi
    fi
    
    # Drop existing database
    log "INFO" "Dropping existing database: $MONGO_DATABASE"
    mongosh --host "$MONGO_HOST:$MONGO_PORT" \
            --username "$MONGO_USERNAME" \
            --password "$MONGO_PASSWORD" \
            --authenticationDatabase "$MONGO_AUTH_DB" \
            --eval "db.getSiblingDB('$MONGO_DATABASE').dropDatabase()" || log "WARN" "Failed to drop existing database"
    
    # Restore database
    log "INFO" "Restoring MongoDB database..."
    
    if ! mongorestore --host "$MONGO_HOST:$MONGO_PORT" \
                      --username "$MONGO_USERNAME" \
                      --password "$MONGO_PASSWORD" \
                      --authenticationDatabase "$MONGO_AUTH_DB" \
                      --db "$MONGO_DATABASE" \
                      --gzip \
                      --drop \
                      "$db_dir"; then
        error_exit "MongoDB restore failed"
    fi
    
    # Cleanup
    rm -rf "$temp_dir"
    rm -f "$decrypted_file"
    
    log "SUCCESS" "MongoDB restore completed successfully"
}

# Restore Redis
restore_redis() {
    local backup_file="$1"
    
    log "INFO" "Starting Redis restore from: $backup_file"
    
    # Create pre-restore backup
    create_pre_restore_backup "redis"
    
    local decrypted_file="/tmp/decrypted_redis_${DATE}.tmp"
    local redis_cmd="redis-cli -h $REDIS_HOST -p $REDIS_PORT"
    
    if [[ -n "$REDIS_PASSWORD" ]]; then
        redis_cmd="$redis_cmd -a $REDIS_PASSWORD"
    fi
    
    # Decrypt if needed
    decrypt_backup "$backup_file" "$decrypted_file"
    
    # Decompress if needed
    local restore_file="$decrypted_file"
    if [[ "$decrypted_file" == *.gz ]]; then
        local decompressed_file="/tmp/redis_restore_${DATE}.tmp"
        log "INFO" "Decompressing Redis backup..."
        if ! gzip -dc "$decrypted_file" > "$decompressed_file"; then
            error_exit "Failed to decompress Redis backup"
        fi
        restore_file="$decompressed_file"
    fi
    
    # Confirm restore operation
    if [[ "$FORCE" != "true" ]]; then
        echo -e "${YELLOW}WARNING: This will replace all data in the Redis database${NC}"
        echo -e "${YELLOW}Are you sure you want to continue? (yes/no):${NC}"
        read -r confirmation
        if [[ "$confirmation" != "yes" ]]; then
            log "INFO" "Restore operation cancelled by user"
            exit 0
        fi
    fi
    
    # Flush existing Redis data
    log "INFO" "Flushing existing Redis data..."
    if ! $redis_cmd FLUSHALL; then
        log "WARN" "Failed to flush Redis data, continuing with restore"
    fi
    
    # Stop Redis writes during restore
    log "INFO" "Setting Redis to read-only mode..."
    $redis_cmd CONFIG SET stop-writes-on-bgsave-error no || true
    
    # Restore Redis data
    log "INFO" "Restoring Redis data..."
    
    if [[ "$restore_file" == *.rdb ]]; then
        # RDB format restore
        log "INFO" "Restoring from RDB format..."
        
        # Stop Redis temporarily
        $redis_cmd SHUTDOWN NOSAVE || true
        sleep 2
        
        # Copy RDB file to Redis data directory
        # Note: This requires Redis to be stopped and restarted
        log "WARN" "RDB restore requires Redis restart - please restart Redis service manually"
        
    else
        # Command format restore
        log "INFO" "Restoring from command format..."
        
        # Read and execute Redis commands
        while IFS= read -r line; do
            if [[ -n "$line" && "$line" != \#* ]]; then
                $redis_cmd eval "$line" 0 || log "WARN" "Failed to execute command: $line"
            fi
        done < "$restore_file"
    fi
    
    # Re-enable writes
    log "INFO" "Re-enabling Redis writes..."
    $redis_cmd CONFIG SET stop-writes-on-bgsave-error yes || true
    
    # Cleanup
    rm -f "$decrypted_file" "$restore_file"
    
    log "SUCCESS" "Redis restore completed successfully"
}

# Verify restore
verify_restore() {
    local db_type="$1"
    
    log "INFO" "Verifying $db_type restore..."
    
    case "$db_type" in
        "mongodb")
            # Check if database exists and has collections
            local collection_count=$(mongosh --host "$MONGO_HOST:$MONGO_PORT" \
                                            --username "$MONGO_USERNAME" \
                                            --password "$MONGO_PASSWORD" \
                                            --authenticationDatabase "$MONGO_AUTH_DB" \
                                            --eval "db.getSiblingDB('$MONGO_DATABASE').listCollectionNames().length" \
                                            --quiet)
            
            if [[ "$collection_count" -gt 0 ]]; then
                log "SUCCESS" "MongoDB restore verified: $collection_count collections found"
            else
                log "WARN" "MongoDB restore verification failed: no collections found"
            fi
            ;;
        "redis")
            # Check if Redis has data
            local redis_cmd="redis-cli -h $REDIS_HOST -p $REDIS_PORT"
            if [[ -n "$REDIS_PASSWORD" ]]; then
                redis_cmd="$redis_cmd -a $REDIS_PASSWORD"
            fi
            
            local key_count=$($redis_cmd DBSIZE)
            
            if [[ "$key_count" -gt 0 ]]; then
                log "SUCCESS" "Redis restore verified: $key_count keys found"
            else
                log "WARN" "Redis restore verification failed: no keys found"
            fi
            ;;
    esac
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
             --data "{\"attachments\":[{\"color\":\"$color\",\"text\":\"Alert Bot Restore $status: $message\"}]}" \
             "$SLACK_WEBHOOK" &>/dev/null || true
    fi
    
    # Send email notification
    if [[ -n "$EMAIL_RECIPIENT" ]]; then
        local subject="Alert Bot Restore $status"
        echo "$message" | mail -s "$subject" "$EMAIL_RECIPIENT" &>/dev/null || true
    fi
}

# List available backups
list_backups() {
    local db_type="${1:-all}"
    
    log "INFO" "Available backups for $db_type:"
    
    case "$db_type" in
        "mongodb")
            find "$BACKUP_DIR/mongodb" -name "mongodb_backup_*" -type f -exec ls -lh {} \; 2>/dev/null || log "INFO" "No MongoDB backups found"
            ;;
        "redis")
            find "$BACKUP_DIR/redis" -name "redis_backup_*" -type f -exec ls -lh {} \; 2>/dev/null || log "INFO" "No Redis backups found"
            ;;
        "all")
            echo "MongoDB backups:"
            find "$BACKUP_DIR/mongodb" -name "mongodb_backup_*" -type f -exec ls -lh {} \; 2>/dev/null || log "INFO" "No MongoDB backups found"
            echo "\nRedis backups:"
            find "$BACKUP_DIR/redis" -name "redis_backup_*" -type f -exec ls -lh {} \; 2>/dev/null || log "INFO" "No Redis backups found"
            ;;
    esac
}

# Show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS] <database_type> <backup_file>

Database Types:
  mongodb     Restore MongoDB database
  redis       Restore Redis database
  all         Restore both databases (requires two backup files)
  list        List available backups

Options:
  --decrypt   Decrypt backup file before restore
  --force     Skip confirmations and pre-restore backup
  --help      Show this help message

Environment Variables:
  MONGO_HOST, MONGO_PORT, MONGO_USERNAME, MONGO_PASSWORD
  REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
  ENCRYPTION_KEY (required for --decrypt)
  BACKUP_DIR (default: /backups)

Examples:
  $0 mongodb /backups/mongodb/mongodb_backup_20240101_120000.tar.gz
  $0 redis /backups/redis/redis_backup_20240101_120000.rdb.gz --decrypt
  $0 list mongodb
  $0 all /backups/mongodb/mongo.tar.gz /backups/redis/redis.rdb.gz --force
EOF
}

# Main function
main() {
    if [[ $# -eq 0 ]]; then
        show_usage
        exit 1
    fi
    
    local db_type="$1"
    shift
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --decrypt)
                DECRYPT="true"
                shift
                ;;
            --force)
                FORCE="true"
                shift
                ;;
            --help)
                show_usage
                exit 0
                ;;
            -*)
                log "ERROR" "Unknown option: $1"
                show_usage
                exit 1
                ;;
            *)
                break
                ;;
        esac
    done
    
    # Handle list command
    if [[ "$db_type" == "list" ]]; then
        list_backups "${1:-all}"
        exit 0
    fi
    
    # Validate arguments
    if [[ $# -eq 0 ]]; then
        log "ERROR" "Backup file is required"
        show_usage
        exit 1
    fi
    
    local start_time=$(date +%s)
    
    log "INFO" "Starting Alert Bot database restore (type: $db_type)"
    
    # Setup
    mkdir -p "$BACKUP_DIR"
    check_dependencies
    test_connections
    
    # Perform restore
    case "$db_type" in
        "mongodb")
            local backup_file="$1"
            validate_backup_file "$backup_file"
            restore_mongodb "$backup_file"
            verify_restore "mongodb"
            ;;
        "redis")
            local backup_file="$1"
            validate_backup_file "$backup_file"
            restore_redis "$backup_file"
            verify_restore "redis"
            ;;
        "all")
            if [[ $# -lt 2 ]]; then
                log "ERROR" "Two backup files required for 'all' restore"
                exit 1
            fi
            local mongo_backup="$1"
            local redis_backup="$2"
            validate_backup_file "$mongo_backup"
            validate_backup_file "$redis_backup"
            restore_mongodb "$mongo_backup"
            restore_redis "$redis_backup"
            verify_restore "mongodb"
            verify_restore "redis"
            ;;
        *)
            log "ERROR" "Invalid database type: $db_type. Use 'mongodb', 'redis', 'all', or 'list'"
            show_usage
            exit 1
            ;;
    esac
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log "SUCCESS" "Restore completed successfully in ${duration} seconds"
    send_notification "SUCCESS" "Restore completed successfully in ${duration} seconds"
}

# Run main function with all arguments
main "$@"