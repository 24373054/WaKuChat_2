#!/bin/bash

# Waku Encrypted Chat - Demo Script
# 演示脚本：2用户单聊 + 3用户群聊 + 撤回演示

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CLI_DIR="$PROJECT_ROOT/packages/cli"
DEMO_DIR="$PROJECT_ROOT/.demo-data"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_banner() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║           Waku Encrypted Chat - Demo Script               ║"
    echo "║     2用户单聊 + 3用户群聊 + 撤回演示                        ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_step() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}▶ $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

print_info() {
    echo -e "${YELLOW}[i]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

wait_for_user() {
    echo -e "\n${YELLOW}Press Enter to continue...${NC}"
    read -r
}

check_prerequisites() {
    print_step "Checking Prerequisites"
    
    # Check if CLI is built
    if [ ! -f "$CLI_DIR/dist/index.js" ]; then
        print_info "Building CLI package..."
        cd "$PROJECT_ROOT"
        pnpm --filter @waku-chat/cli build
    fi
    print_success "CLI package is ready"
    
    # Check if network is running
    local healthy=0
    for port in 8545 8546 8547; do
        if curl -sf "http://localhost:$port/health" > /dev/null 2>&1; then
            ((healthy++))
        fi
    done
    
    if [ $healthy -lt 1 ]; then
        print_error "Waku network is not running!"
        print_info "Start it with: ./scripts/start-local-network.sh"
        exit 1
    fi
    print_success "Waku network is running ($healthy/3 nodes healthy)"
}

setup_demo_environment() {
    print_step "Setting Up Demo Environment"
    
    # Clean previous demo data
    rm -rf "$DEMO_DIR"
    mkdir -p "$DEMO_DIR/alice" "$DEMO_DIR/bob" "$DEMO_DIR/charlie"
    
    print_success "Demo directories created"
}

# Run CLI command for a specific user
run_as() {
    local user=$1
    shift
    WAKU_CHAT_DATA_DIR="$DEMO_DIR/$user" node "$CLI_DIR/dist/index.js" "$@"
}

# Create identity for a user (non-interactive)
create_identity() {
    local user=$1
    local password="demo123456"
    
    print_info "Creating identity for $user..."
    
    # Use expect-like approach with heredoc
    WAKU_CHAT_DATA_DIR="$DEMO_DIR/$user" node "$CLI_DIR/dist/index.js" identity create <<EOF
$password
$password
EOF
    
    print_success "Identity created for $user"
}

demo_part1_identities() {
    print_step "Part 1: Creating User Identities"
    
    echo "We'll create 3 users: Alice, Bob, and Charlie"
    echo ""
    
    create_identity "alice"
    create_identity "bob"
    create_identity "charlie"
    
    print_success "All identities created!"
    
    echo ""
    print_info "Each user now has:"
    echo "  - A secp256k1 key pair"
    echo "  - A unique userId (derived from public key)"
    echo "  - Encrypted identity storage"
}

demo_part2_dm() {
    print_step "Part 2: Direct Message (Alice ↔ Bob)"
    
    echo "Alice and Bob will exchange encrypted messages"
    echo ""
    
    print_info "This demonstrates:"
    echo "  - ECDH key exchange for shared secret"
    echo "  - AES-256-GCM message encryption"
    echo "  - ECDSA message signing"
    echo ""
    
    print_info "In a real scenario, Alice and Bob would:"
    echo "  1. Exchange public keys out-of-band"
    echo "  2. Create a DM conversation"
    echo "  3. Send encrypted messages via Waku Relay"
    echo ""
    
    print_success "DM demonstration concept complete"
    print_info "Use the interactive CLI for actual messaging:"
    echo "  waku-chat conversation create-dm"
    echo "  waku-chat message send"
}

demo_part3_group() {
    print_step "Part 3: Group Chat (Alice, Bob, Charlie)"
    
    echo "Alice creates a group and invites Bob and Charlie"
    echo ""
    
    print_info "This demonstrates:"
    echo "  - Group key generation"
    echo "  - ECIES key distribution"
    echo "  - Multi-party encrypted messaging"
    echo "  - Admin permission management"
    echo ""
    
    print_info "Group chat flow:"
    echo "  1. Alice creates group → becomes admin"
    echo "  2. Alice generates invite with encrypted group key"
    echo "  3. Bob and Charlie join using invite"
    echo "  4. All members can send/receive encrypted messages"
    echo ""
    
    print_success "Group chat demonstration concept complete"
    print_info "Use the interactive CLI for actual group chat:"
    echo "  waku-chat conversation create-group"
    echo "  waku-chat conversation invite <group-id>"
    echo "  waku-chat conversation join-group"
}

demo_part4_revoke() {
    print_step "Part 4: Message Revocation"
    
    echo "Demonstrating message revocation in decentralized network"
    echo ""
    
    print_info "Revocation mechanism:"
    echo "  1. Sender creates tombstone control message"
    echo "  2. Tombstone contains: targetMessageId + signature"
    echo "  3. Other clients mark message as 'revoked'"
    echo "  4. UI shows '[Message revoked]' instead of content"
    echo ""
    
    print_info "Permission rules:"
    echo "  - DM: Only original sender can revoke"
    echo "  - Group: Original sender OR admin can revoke"
    echo ""
    
    echo -e "${YELLOW}⚠ Important limitation:${NC}"
    echo "  In a decentralized network, revocation is 'best effort'."
    echo "  Messages already received cannot be forcibly deleted."
    echo "  Revocation only affects future displays of the message."
    echo ""
    
    print_success "Revocation demonstration concept complete"
    print_info "Use the interactive CLI for actual revocation:"
    echo "  waku-chat message revoke <conv-id> <msg-id>"
}

demo_part5_interactive() {
    print_step "Part 5: Interactive Demo Mode"
    
    echo "You can now use the CLI interactively!"
    echo ""
    
    print_info "Available commands:"
    echo ""
    echo "  Identity Management:"
    echo "    waku-chat identity create    - Create new identity"
    echo "    waku-chat identity show      - Show current identity"
    echo ""
    echo "  Conversations:"
    echo "    waku-chat conv create-dm     - Create direct message"
    echo "    waku-chat conv create-group  - Create group chat"
    echo "    waku-chat conv join-group    - Join existing group"
    echo "    waku-chat conv list          - List conversations"
    echo ""
    echo "  Messages:"
    echo "    waku-chat msg send           - Send a message"
    echo "    waku-chat msg history        - View message history"
    echo "    waku-chat msg revoke         - Revoke a message"
    echo "    waku-chat msg delete         - Delete locally"
    echo ""
    echo "  Interactive Chat:"
    echo "    waku-chat chat               - Enter chat mode"
    echo ""
}

show_summary() {
    print_step "Demo Summary"
    
    echo "This demo showcased the Waku Encrypted Chat SDK:"
    echo ""
    echo "  ✓ Identity Management"
    echo "    - secp256k1 key pair generation"
    echo "    - Encrypted identity storage"
    echo "    - userId derivation from public key"
    echo ""
    echo "  ✓ Direct Messaging"
    echo "    - ECDH shared secret derivation"
    echo "    - AES-256-GCM encryption"
    echo "    - ECDSA message signing"
    echo ""
    echo "  ✓ Group Chat"
    echo "    - Group key generation"
    echo "    - ECIES key distribution"
    echo "    - Admin permission management"
    echo ""
    echo "  ✓ Message Revocation"
    echo "    - Tombstone control messages"
    echo "    - Permission-based revocation"
    echo "    - Decentralized limitations"
    echo ""
    echo "  ✓ Waku Protocol Integration"
    echo "    - Relay mode for full nodes"
    echo "    - LightPush/Filter for light clients"
    echo "    - Store protocol for history"
    echo ""
    
    print_info "For more details, see:"
    echo "  - README.md"
    echo "  - .kiro/specs/waku-encrypted-chat/design.md"
}

cleanup() {
    print_step "Cleanup"
    
    echo "Demo data is stored in: $DEMO_DIR"
    echo ""
    
    read -p "Do you want to clean up demo data? (y/N) " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$DEMO_DIR"
        print_success "Demo data cleaned up"
    else
        print_info "Demo data preserved for further testing"
    fi
}

show_help() {
    print_banner
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  run       Run the full demo (default)"
    echo "  quick     Run quick demo without pauses"
    echo "  clean     Clean up demo data"
    echo "  help      Show this help message"
    echo ""
    echo "Prerequisites:"
    echo "  1. Start local Waku network: ./scripts/start-local-network.sh"
    echo "  2. Build packages: pnpm build"
}

# Main execution
main() {
    print_banner
    
    check_prerequisites
    setup_demo_environment
    
    demo_part1_identities
    wait_for_user
    
    demo_part2_dm
    wait_for_user
    
    demo_part3_group
    wait_for_user
    
    demo_part4_revoke
    wait_for_user
    
    demo_part5_interactive
    wait_for_user
    
    show_summary
    
    cleanup
    
    echo ""
    print_success "Demo complete!"
}

quick_demo() {
    print_banner
    
    check_prerequisites
    setup_demo_environment
    
    demo_part1_identities
    demo_part2_dm
    demo_part3_group
    demo_part4_revoke
    demo_part5_interactive
    show_summary
    
    echo ""
    print_success "Quick demo complete!"
}

# Parse arguments
case "${1:-run}" in
    run)
        main
        ;;
    quick)
        quick_demo
        ;;
    clean)
        rm -rf "$DEMO_DIR"
        print_success "Demo data cleaned up"
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
