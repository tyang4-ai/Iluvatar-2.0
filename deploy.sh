#!/bin/bash
# =============================================================================
# ILUVATAR 3.0 - AWS Deployment Script
# =============================================================================
# Interactive deployment script for AWS CloudFormation
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------
print_header() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}          ILUVATAR 3.0 - AWS Production Deployment          ${BLUE}║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_step() {
    echo -e "${GREEN}▶${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

check_command() {
    if ! command -v $1 &> /dev/null; then
        print_error "$1 is not installed"
        return 1
    fi
    return 0
}

# -----------------------------------------------------------------------------
# Prerequisites Check
# -----------------------------------------------------------------------------
check_prerequisites() {
    print_step "Checking prerequisites..."

    local missing=0

    if ! check_command aws; then
        print_error "AWS CLI not found. Install from: https://aws.amazon.com/cli/"
        missing=1
    fi

    if ! check_command jq; then
        print_warning "jq not found (optional but recommended)"
    fi

    if [ $missing -eq 1 ]; then
        print_error "Missing required tools. Please install and try again."
        exit 1
    fi

    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials not configured"
        print_info "Run: aws configure"
        exit 1
    fi

    local account_id=$(aws sts get-caller-identity --query Account --output text)
    local user=$(aws sts get-caller-identity --query Arn --output text)

    print_success "AWS configured"
    print_info "Account: $account_id"
    print_info "User: $user"
}

# -----------------------------------------------------------------------------
# Get Deployment Parameters
# -----------------------------------------------------------------------------
get_parameters() {
    print_step "Configuring deployment parameters..."

    # Stack name
    read -p "Stack name [iluvatar-production]: " STACK_NAME
    STACK_NAME=${STACK_NAME:-iluvatar-production}

    # AWS Region
    DEFAULT_REGION=$(aws configure get region)
    read -p "AWS Region [$DEFAULT_REGION]: " AWS_REGION
    AWS_REGION=${AWS_REGION:-$DEFAULT_REGION}

    # Instance Type
    echo ""
    print_info "Instance types:"
    print_info "  1) t3.large   - 2 vCPU, 8 GB RAM  (~\$60/month)"
    print_info "  2) t3.xlarge  - 4 vCPU, 16 GB RAM (~\$120/month) [Recommended]"
    print_info "  3) t3.2xlarge - 8 vCPU, 32 GB RAM (~\$240/month)"
    read -p "Choose instance type [2]: " INSTANCE_CHOICE
    INSTANCE_CHOICE=${INSTANCE_CHOICE:-2}

    case $INSTANCE_CHOICE in
        1) INSTANCE_TYPE="t3.large" ;;
        2) INSTANCE_TYPE="t3.xlarge" ;;
        3) INSTANCE_TYPE="t3.2xlarge" ;;
        *) INSTANCE_TYPE="t3.xlarge" ;;
    esac

    # SSH Key Pair
    echo ""
    print_info "Available EC2 key pairs:"
    aws ec2 describe-key-pairs --region $AWS_REGION --query 'KeyPairs[*].KeyName' --output text
    echo ""
    read -p "EC2 Key Pair name: " KEY_NAME

    if [ -z "$KEY_NAME" ]; then
        print_error "Key pair name is required"
        exit 1
    fi

    # Verify key exists
    if ! aws ec2 describe-key-pairs --region $AWS_REGION --key-names $KEY_NAME &> /dev/null; then
        print_error "Key pair '$KEY_NAME' not found in region $AWS_REGION"
        exit 1
    fi

    # SSH Access CIDR
    read -p "Allow SSH from (CIDR) [0.0.0.0/0]: " SSH_CIDR
    SSH_CIDR=${SSH_CIDR:-0.0.0.0/0}

    # Environment
    read -p "Environment [production]: " ENVIRONMENT
    ENVIRONMENT=${ENVIRONMENT:-production}

    # Volume Size
    read -p "Root volume size (GB) [100]: " VOLUME_SIZE
    VOLUME_SIZE=${VOLUME_SIZE:-100}

    # RDS
    read -p "Create RDS PostgreSQL? (increases cost) [n]: " CREATE_RDS
    CREATE_RDS=${CREATE_RDS:-n}
    if [[ $CREATE_RDS =~ ^[Yy]$ ]]; then
        ENABLE_RDS="true"
    else
        ENABLE_RDS="false"
    fi

    # ElastiCache
    read -p "Create ElastiCache Redis? (increases cost) [n]: " CREATE_ELASTICACHE
    CREATE_ELASTICACHE=${CREATE_ELASTICACHE:-n}
    if [[ $CREATE_ELASTICACHE =~ ^[Yy]$ ]]; then
        ENABLE_ELASTICACHE="true"
    else
        ENABLE_ELASTICACHE="false"
    fi
}

# -----------------------------------------------------------------------------
# Show Configuration Summary
# -----------------------------------------------------------------------------
show_summary() {
    echo ""
    print_step "Deployment Configuration:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Stack Name:      $STACK_NAME"
    echo "Region:          $AWS_REGION"
    echo "Instance Type:   $INSTANCE_TYPE"
    echo "Key Pair:        $KEY_NAME"
    echo "SSH Access:      $SSH_CIDR"
    echo "Environment:     $ENVIRONMENT"
    echo "Volume Size:     ${VOLUME_SIZE}GB"
    echo "RDS PostgreSQL:  $ENABLE_RDS"
    echo "ElastiCache:     $ENABLE_ELASTICACHE"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    read -p "Proceed with deployment? [y/N]: " CONFIRM
    if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
        print_warning "Deployment cancelled"
        exit 0
    fi
}

# -----------------------------------------------------------------------------
# Deploy CloudFormation Stack
# -----------------------------------------------------------------------------
deploy_stack() {
    print_step "Deploying CloudFormation stack..."

    # Check if stack exists
    if aws cloudformation describe-stacks --region $AWS_REGION --stack-name $STACK_NAME &> /dev/null; then
        print_warning "Stack '$STACK_NAME' already exists"
        read -p "Update existing stack? [y/N]: " UPDATE
        if [[ ! $UPDATE =~ ^[Yy]$ ]]; then
            print_warning "Deployment cancelled"
            exit 0
        fi
        OPERATION="update-stack"
    else
        OPERATION="create-stack"
    fi

    # Deploy
    aws cloudformation $OPERATION \
        --region $AWS_REGION \
        --stack-name $STACK_NAME \
        --template-body file://setup/cloudformation.yml \
        --parameters \
            ParameterKey=InstanceType,ParameterValue=$INSTANCE_TYPE \
            ParameterKey=KeyName,ParameterValue=$KEY_NAME \
            ParameterKey=AllowSSHFrom,ParameterValue=$SSH_CIDR \
            ParameterKey=EnvironmentName,ParameterValue=$ENVIRONMENT \
            ParameterKey=VolumeSize,ParameterValue=$VOLUME_SIZE \
            ParameterKey=EnableRDS,ParameterValue=$ENABLE_RDS \
            ParameterKey=EnableElastiCache,ParameterValue=$ENABLE_ELASTICACHE \
        --capabilities CAPABILITY_IAM \
        --tags \
            Key=Project,Value=ILUVATAR \
            Key=Environment,Value=$ENVIRONMENT \
            Key=ManagedBy,Value=CloudFormation

    print_success "Stack deployment initiated"
    print_info "Waiting for stack to complete (this may take 5-10 minutes)..."

    # Determine correct waiter name
    if [ "$OPERATION" == "create-stack" ]; then
        WAITER="stack-create-complete"
    else
        WAITER="stack-update-complete"
    fi

    aws cloudformation wait $WAITER \
        --region $AWS_REGION \
        --stack-name $STACK_NAME

    print_success "Stack deployment complete!"
}

# -----------------------------------------------------------------------------
# Get Stack Outputs
# -----------------------------------------------------------------------------
get_outputs() {
    print_step "Retrieving stack outputs..."

    OUTPUTS=$(aws cloudformation describe-stacks \
        --region $AWS_REGION \
        --stack-name $STACK_NAME \
        --query 'Stacks[0].Outputs')

    PUBLIC_IP=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="PublicIP") | .OutputValue')
    SSH_COMMAND=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="SSHCommand") | .OutputValue')
    ORCHESTRATOR_API=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="OrchestratorAPI") | .OutputValue')
    N8N_UI=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="n8nUI") | .OutputValue')
    GRAFANA=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="GrafanaDashboard") | .OutputValue')
    VAULT_UI=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="VaultUI") | .OutputValue')
    ARCHIVE_BUCKET=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="ArchiveBucketName") | .OutputValue')
}

# -----------------------------------------------------------------------------
# Display Results
# -----------------------------------------------------------------------------
display_results() {
    echo ""
    print_success "Deployment successful!"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${GREEN}Access Information:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Public IP:        $PUBLIC_IP"
    echo "SSH Command:      $SSH_COMMAND"
    echo ""
    echo "Services:"
    echo "  Orchestrator:   $ORCHESTRATOR_API"
    echo "  n8n Workflows:  $N8N_UI"
    echo "  Grafana:        $GRAFANA"
    echo "  Vault:          $VAULT_UI"
    echo ""
    echo "S3 Archive:       $ARCHIVE_BUCKET"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "1. Wait 2-3 minutes for instance initialization"
    echo ""
    echo "2. SSH to your instance:"
    echo "   $SSH_COMMAND"
    echo ""
    echo "3. Configure environment:"
    echo "   cd iluvatar-2.0"
    echo "   cp .env.template .env"
    echo "   nano .env"
    echo ""
    echo "4. Add your API keys to .env:"
    echo "   - ANTHROPIC_API_KEY"
    echo "   - DISCORD_BOT_TOKEN"
    echo "   - GITHUB_TOKEN"
    echo ""
    echo "5. Start services:"
    echo "   sudo systemctl start iluvatar-orchestrator"
    echo ""
    echo "6. Check status:"
    echo "   ./status.sh"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# -----------------------------------------------------------------------------
# Save Configuration
# -----------------------------------------------------------------------------
save_config() {
    cat > deployment-info.txt <<EOF
ILUVATAR Deployment Information
================================
Date: $(date)
Stack Name: $STACK_NAME
Region: $AWS_REGION

Access:
-------
Public IP: $PUBLIC_IP
SSH: $SSH_COMMAND

Services:
---------
Orchestrator: $ORCHESTRATOR_API
n8n: $N8N_UI
Grafana: $GRAFANA
Vault: $VAULT_UI

Resources:
----------
S3 Bucket: $ARCHIVE_BUCKET
Instance Type: $INSTANCE_TYPE
Key Pair: $KEY_NAME

CloudFormation:
---------------
Stack: https://console.aws.amazon.com/cloudformation/home?region=$AWS_REGION#/stacks/stackinfo?stackId=$STACK_NAME
EC2: https://console.aws.amazon.com/ec2/v2/home?region=$AWS_REGION#Instances:
S3: https://s3.console.aws.amazon.com/s3/buckets/$ARCHIVE_BUCKET

To delete this deployment:
--------------------------
aws cloudformation delete-stack --region $AWS_REGION --stack-name $STACK_NAME
EOF

    print_success "Configuration saved to deployment-info.txt"
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
main() {
    print_header
    check_prerequisites
    get_parameters
    show_summary
    deploy_stack
    get_outputs
    display_results
    save_config

    echo ""
    print_success "Deployment complete! 🚀"
    echo ""
}

# Run main function
main "$@"
