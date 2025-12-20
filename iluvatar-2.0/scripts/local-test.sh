#!/bin/bash
#
# ILUVATAR Local Testing Environment
#
# Starts n8n, Redis, and PostgreSQL for local workflow testing.
# No container-in-container complexity.
#
# Usage:
#   ./scripts/local-test.sh        # Start services
#   ./scripts/local-test.sh stop   # Stop services
#   ./scripts/local-test.sh logs   # View logs
#   ./scripts/local-test.sh debug  # Start with debug tools (redis-commander, pgadmin)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.local.yml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_banner() {
    echo -e "${BLUE}"
    echo "  _____ _     _   ___     _____ _____ ___  ___  "
    echo " |_   _| |   | | | \ \   / / _ \_   _/ _ \|  _ \ "
    echo "   | | | |   | | | |\ \ / / |_| || |/ /_\ \ |_) |"
    echo "   | | | |___| |_| | \ V /|  _  || ||  _  |  _ < "
    echo "   |_| |_____|_____|  \_/ |_| |_||_||_| |_|_| \_\\"
    echo ""
    echo "  Local Testing Environment"
    echo -e "${NC}"
}

check_requirements() {
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Error: Docker is not installed${NC}"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        echo -e "${RED}Error: Docker Compose is not installed${NC}"
        exit 1
    fi

    # Check for API key
    if [ -z "$ANTHROPIC_API_KEY" ]; then
        echo -e "${YELLOW}Warning: ANTHROPIC_API_KEY not set. AI features will not work.${NC}"
        echo "Set it with: export ANTHROPIC_API_KEY=your-key"
    fi
}

start_services() {
    local profile=""
    if [ "$1" == "debug" ]; then
        profile="--profile debug"
    fi

    echo -e "${GREEN}Starting ILUVATAR local test environment...${NC}"
    echo ""

    # Use docker compose (v2) or docker-compose (v1)
    if docker compose version &> /dev/null; then
        docker compose -f "$COMPOSE_FILE" $profile up -d
    else
        docker-compose -f "$COMPOSE_FILE" $profile up -d
    fi

    echo ""
    echo -e "${GREEN}Services started!${NC}"
    echo ""
    echo -e "  ${BLUE}n8n:${NC}        http://localhost:5678"
    echo -e "  ${BLUE}Redis:${NC}      localhost:6379"
    echo -e "  ${BLUE}PostgreSQL:${NC} localhost:5432"

    if [ "$1" == "debug" ]; then
        echo ""
        echo -e "  ${YELLOW}Debug Tools:${NC}"
        echo -e "  ${BLUE}Redis Commander:${NC} http://localhost:8081"
        echo -e "  ${BLUE}pgAdmin:${NC}         http://localhost:8082 (admin@iluvatar.local / localdev)"
    fi

    echo ""
    echo -e "To view logs: ${YELLOW}./scripts/local-test.sh logs${NC}"
    echo -e "To stop:      ${YELLOW}./scripts/local-test.sh stop${NC}"
}

stop_services() {
    echo -e "${YELLOW}Stopping ILUVATAR local test environment...${NC}"

    if docker compose version &> /dev/null; then
        docker compose -f "$COMPOSE_FILE" --profile debug down
    else
        docker-compose -f "$COMPOSE_FILE" --profile debug down
    fi

    echo -e "${GREEN}Services stopped.${NC}"
}

show_logs() {
    local service="${1:-}"

    if docker compose version &> /dev/null; then
        docker compose -f "$COMPOSE_FILE" logs -f $service
    else
        docker-compose -f "$COMPOSE_FILE" logs -f $service
    fi
}

show_status() {
    echo -e "${BLUE}Service Status:${NC}"
    echo ""

    if docker compose version &> /dev/null; then
        docker compose -f "$COMPOSE_FILE" ps
    else
        docker-compose -f "$COMPOSE_FILE" ps
    fi
}

# Main
cd "$PROJECT_DIR"
print_banner
check_requirements

case "${1:-start}" in
    start)
        start_services
        ;;
    debug)
        start_services debug
        ;;
    stop)
        stop_services
        ;;
    logs)
        show_logs "$2"
        ;;
    status)
        show_status
        ;;
    restart)
        stop_services
        start_services
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|logs|status|debug}"
        echo ""
        echo "  start   - Start core services (n8n, redis, postgres)"
        echo "  debug   - Start with debug tools (redis-commander, pgadmin)"
        echo "  stop    - Stop all services"
        echo "  restart - Restart all services"
        echo "  logs    - View logs (optional: logs <service>)"
        echo "  status  - Show service status"
        exit 1
        ;;
esac
