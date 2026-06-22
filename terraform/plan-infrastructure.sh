#!/bin/bash
# Exit immediately if a command exits with a non-zero status
set -e

# Define variables for TernKonnect setup
BACKEND_PROJECT_NAME="ternkonnect-backend"
BACKEND_DB_USERNAME="ternkonnectpostgres"
BACKEND_DB_NAME="ternkonnect"
BACKEND_S3_BUCKET_NAME="ternkonnect-backend-media"

FRONTEND_PROJECT_NAME="ternkonnect-frontend"
FRONTEND_S3_BUCKET_NAME="ternkonnect-frontend-site"

echo "=================================================="
echo "🔍 Starting TernKonnect Infrastructure Plan Preview"
echo "=================================================="

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# 1. Plan Backend Infrastructure
echo ""
echo "📋 [1/2] Generating Backend Infrastructure Plan..."
cd "$SCRIPT_DIR/TernKonnect-Backend/infrastructure"

echo "Initializing Terraform..."
terraform init

echo "Selecting/Creating 'ternkonnect' workspace..."
terraform workspace select ternkonnect || terraform workspace new ternkonnect

echo "Generating plan..."
terraform plan \
  -var="project_name=$BACKEND_PROJECT_NAME" \
  -var="db_username=$BACKEND_DB_USERNAME" \
  -var="db_name=$BACKEND_DB_NAME" \
  -var="s3_bucket_name=$BACKEND_S3_BUCKET_NAME"

# 2. Plan Frontend Infrastructure
echo ""
echo "📋 [2/2] Generating Frontend Infrastructure Plan..."
cd "$SCRIPT_DIR/TernKonnect-Frontend/infrastructure"

echo "Initializing Terraform..."
terraform init

echo "Selecting/Creating 'ternkonnect' workspace..."
terraform workspace select ternkonnect || terraform workspace new ternkonnect

echo "Generating plan..."
terraform plan \
  -var="project_name=$FRONTEND_PROJECT_NAME" \
  -var="s3_bucket_name=$FRONTEND_S3_BUCKET_NAME"

echo ""
echo "=================================================="
echo "✅ TernKonnect Infrastructure Plan Preview Complete!"
echo "=================================================="
