#!/bin/bash

# Integration script for polling restart fix
# This script helps integrate the polling restart solution

set -e  # Exit on error

echo "═══════════════════════════════════════════════════════════"
echo "  YouTube Lead Gen - Polling Restart Integration"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: package.json not found. Please run this script from the youtube-lead-gen directory.${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Found package.json"

# Step 1: Verify pollWithRestart.ts exists
echo ""
echo "Step 1: Checking for pollWithRestart.ts utility..."
if [ -f "src/lib/utils/pollWithRestart.ts" ]; then
    echo -e "${GREEN}✓${NC} Found src/lib/utils/pollWithRestart.ts"
else
    echo -e "${RED}✗${NC} Missing src/lib/utils/pollWithRestart.ts"
    echo "   Please ensure the file was created correctly."
    exit 1
fi

# Step 2: Check if SearchForm.svelte exists
echo ""
echo "Step 2: Checking SearchForm.svelte..."
if [ -f "src/lib/components/search/SearchForm.svelte" ]; then
    echo -e "${GREEN}✓${NC} Found SearchForm.svelte"
else
    echo -e "${RED}✗${NC} Missing SearchForm.svelte"
    exit 1
fi

# Step 3: Create backup
echo ""
echo "Step 3: Creating backup..."
BACKUP_FILE="src/lib/components/search/SearchForm.svelte.backup.$(date +%Y%m%d_%H%M%S)"
cp "src/lib/components/search/SearchForm.svelte" "$BACKUP_FILE"
echo -e "${GREEN}✓${NC} Backup created: $BACKUP_FILE"

# Step 4: Show instructions
echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "${YELLOW}Manual Integration Required${NC}"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Please follow these steps:"
echo ""
echo "1. Open SearchForm.svelte in your editor:"
echo "   ${YELLOW}src/lib/components/search/SearchForm.svelte${NC}"
echo ""
echo "2. Find the pollSearchJob function (around line 449)"
echo ""
echo "3. Replace the entire function (lines 449-631) with the"
echo "   content from:"
echo "   ${YELLOW}NEW_POLL_FUNCTION.txt${NC}"
echo ""
echo "4. Save the file"
echo ""
echo "5. Run: ${YELLOW}npm run dev${NC}"
echo ""
echo "6. Test by searching for 100 channels"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Detailed integration guide:"
echo "  ${YELLOW}POLLING-RESTART-INTEGRATION.md${NC}"
echo ""
echo "Backup location (for rollback if needed):"
echo "  ${GREEN}$BACKUP_FILE${NC}"
echo ""
echo "═══════════════════════════════════════════════════════════"
