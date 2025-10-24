#!/bin/bash

# ==============================================================================
# APPLICATION HEALTH CHECK SCRIPT
#
# This script checks the /health endpoint of the deployed application
# to verify that it is running and healthy.
#
# It retrieves the application URL from the Terraform output and attempts
# to curl the health endpoint.
#
# Usage:
#   ./scripts/health-check.sh
#
# Prerequisites:
#   - curl and jq must be installed.
#   - A 'terraform.output.json' file must exist in the 'terraform/' directory.
# ==============================================================================

set -e

# --- Configuration ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# --- Helper Functions ---
log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# --- Main Script ---
log_info "Starting application health check..."

# 1. Check for required tools
for cmd in curl jq; do
    if ! command -v $cmd &> /dev/null; then
        log_error "$cmd is not installed. Please install it to run this script."
    fi
done

# 2. Get Application URL from Terraform output
TF_OUTPUT_FILE="terraform/terraform.output.json"
if [ ! -f "$TF_OUTPUT_FILE" ]; then
    log_error "Terraform output file not found at '$TF_OUTPUT_FILE'. Please run 'terraform output -json > $TF_OUTPUT_FILE' in the 'terraform/' directory."
fi

APP_URL=$(jq -r '.application_url.value' "$TF_OUTPUT_FILE")
if [ -z "$APP_URL" ] || [ "$APP_URL" == "null" ]; then
    log_error "Could not read 'application_url' from Terraform output file."
fi

HEALTH_ENDPOINT="${APP_URL}/health"
log_info "Checking endpoint: $HEALTH_ENDPOINT"

# 3. Perform the health check
# We will try up to 5 times with a 10-second delay to give the service time to start.
MAX_ATTEMPTS=5
ATTEMPT=1
while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
    log_info "Attempt $ATTEMPT of $MAX_ATTEMPTS..."
    # The -s flag is for silent mode, -f to fail on server errors (like 404 or 500),
    # and -o /dev/null to discard the body output.
    if curl -s -f -o /dev/null "$HEALTH_ENDPOINT"; then
        log_success "Health check passed! Application is running and healthy."

        # Optional: Print the response body on success
        echo "Response from health endpoint:"
        curl -s "$HEALTH_ENDPOINT" | jq .
        echo ""
        exit 0
    else
        log_info "Health check failed. Retrying in 10 seconds..."
        sleep 10
    fi
    ATTEMPT=$((ATTEMPT + 1))
done

log_error "Application health check failed after $MAX_ATTEMPTS attempts."
log_error "The endpoint at $HEALTH_ENDPOINT is not responding with a successful status code."
log_error "Please check the ECS service logs in the AWS CloudWatch console for errors."