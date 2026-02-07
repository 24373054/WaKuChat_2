#!/bin/bash

# Waku Encrypted Chat - Local Network Startup Script
# 一键启动本地 Waku 测试网络

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKER_DIR="$PROJECT_ROOT/docker"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_banner() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║         Waku Encrypted Chat - Local Test Network          ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[i]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running. Please start Docker."
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose."
        exit 1
    fi
    
    print_status "Docker is available"
}

get_compose_cmd() {
    if docker compose version &> /dev/null 2>&1; then
        echo "docker compose"
    else
        echo "docker-compose"
    fi
}

start_network() {
    print_banner
    check_docker
    
    COMPOSE_CMD=$(get_compose_cmd)
    
    print_info "Starting Waku test network (3 nodes)..."
    cd "$DOCKER_DIR"
    
    # Pull latest images
    print_info "Pulling nwaku images..."
    $COMPOSE_CMD pull
    
    # Start containers
    print_info "Starting containers..."
    $COMPOSE_CMD up -d
    
    print_info "Waiting for nodes to be healthy..."
    
    # Wait for all nodes to be healthy
    local max_wait=120
    local waited=0
    local interval=5
    
    while [ $waited -lt $max_wait ]; do
        local healthy_count=0
        
        for port in 8545 8546 8547; do
            if curl -sf "http://localhost:$port/health" > /dev/null 2>&1; then
                ((healthy_count++))
            fi
        done
        
        if [ $healthy_count -eq 3 ]; then
            break
        fi
        
        echo -ne "\r  Waiting... ($healthy_count/3 nodes healthy, ${waited}s elapsed)"
        sleep $interval
        ((waited+=interval))
    done
    
    echo ""
    
    # Final status check
    local all_healthy=true
    echo ""
    print_info "Node Status:"
    echo "  ┌─────────┬──────────┬─────────────────┐"
    echo "  │  Node   │  Status  │    REST API     │"
    echo "  ├─────────┼──────────┼─────────────────┤"
    
    for i in 1 2 3; do
        local port=$((8544 + i))
        if curl -sf "http://localhost:$port/health" > /dev/null 2>&1; then
            echo -e "  │ nwaku$i  │  ${GREEN}healthy${NC}  │ localhost:$port │"
        else
            echo -e "  │ nwaku$i  │  ${RED}unhealthy${NC}│ localhost:$port │"
            all_healthy=false
        fi
    done
    
    echo "  └─────────┴──────────┴─────────────────┘"
    echo ""
    
    if [ "$all_healthy" = true ]; then
        print_status "All nodes are healthy!"
        echo ""
        print_info "Network is ready. You can now run the demo:"
        echo "    ./scripts/demo.sh"
        echo ""
        print_info "To view logs:"
        echo "    cd docker && docker-compose logs -f"
        echo ""
        print_info "To stop the network:"
        echo "    ./scripts/start-local-network.sh stop"
    else
        print_warning "Some nodes are not healthy. Check logs with:"
        echo "    cd docker && docker-compose logs"
    fi
}

stop_network() {
    print_banner
    
    COMPOSE_CMD=$(get_compose_cmd)
    
    print_info "Stopping Waku test network..."
    cd "$DOCKER_DIR"
    
    $COMPOSE_CMD down
    
    print_status "Network stopped"
}

clean_network() {
    print_banner
    
    COMPOSE_CMD=$(get_compose_cmd)
    
    print_warning "This will remove all containers and volumes!"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Cleaning up Waku test network..."
        cd "$DOCKER_DIR"
        
        $COMPOSE_CMD down -v --remove-orphans
        
        print_status "Network cleaned"
    else
        print_info "Cancelled"
    fi
}

status_network() {
    print_banner
    
    COMPOSE_CMD=$(get_compose_cmd)
    
    print_info "Checking network status..."
    cd "$DOCKER_DIR"
    
    echo ""
    $COMPOSE_CMD ps
    echo ""
    
    print_info "Node Health:"
    for i in 1 2 3; do
        local port=$((8544 + i))
        if curl -sf "http://localhost:$port/health" > /dev/null 2>&1; then
            print_status "nwaku$i (port $port): healthy"
        else
            print_error "nwaku$i (port $port): unhealthy or not running"
        fi
    done
}

logs_network() {
    COMPOSE_CMD=$(get_compose_cmd)
    
    cd "$DOCKER_DIR"
    $COMPOSE_CMD logs -f "$@"
}

show_help() {
    print_banner
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  start   Start the local Waku test network (default)"
    echo "  stop    Stop the network"
    echo "  status  Show network status"
    echo "  logs    Show container logs (follow mode)"
    echo "  clean   Stop and remove all containers and volumes"
    echo "  help    Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0              # Start the network"
    echo "  $0 start        # Start the network"
    echo "  $0 stop         # Stop the network"
    echo "  $0 status       # Check node status"
    echo "  $0 logs nwaku1  # View logs for nwaku1"
}

# Main
case "${1:-start}" in
    start)
        start_network
        ;;
    stop)
        stop_network
        ;;
    status)
        status_network
        ;;
    logs)
        shift
        logs_network "$@"
        ;;
    clean)
        clean_network
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
