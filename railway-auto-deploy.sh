#!/bin/bash

echo "🚀 Railway Auto-Deploy Setup Script"
echo "===================================="
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli@latest
fi

echo "✅ Railway CLI found: $(railway --version)"
echo ""

# Check if user is logged in
if ! railway status &> /dev/null; then
    echo "⚠️  Not logged into Railway. Please log in:"
    echo "   Run: railway login"
    echo ""
    echo "This will open a browser for authentication."
    read -p "Press Enter to continue with login, or Ctrl+C to cancel..."
    railway login
fi

echo "✅ Logged into Railway"
echo ""

# Check if project is linked
if ! railway link &> /dev/null; then
    echo "⚠️  Project not linked to Railway."
    echo "   Linking project..."
    railway link
fi

echo "✅ Project linked to Railway"
echo ""

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "📋 Current branch: $CURRENT_BRANCH"
echo ""

# Check if we're on main branch
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "⚠️  Warning: You're not on the main branch."
    echo "   Railway typically deploys from 'main' branch."
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check if there are uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "⚠️  You have uncommitted changes."
    echo "   Railway will deploy the last committed version."
    read -p "Continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check if we need to push to GitHub
LOCAL_COMMITS=$(git rev-list HEAD --not --remotes=origin/main 2>/dev/null | wc -l | tr -d ' ')
if [ "$LOCAL_COMMITS" -gt 0 ]; then
    echo "📤 You have $LOCAL_COMMITS local commit(s) not pushed to GitHub."
    echo "   Pushing to GitHub first..."
    git push origin main
    if [ $? -ne 0 ]; then
        echo "❌ Failed to push to GitHub"
        exit 1
    fi
    echo "✅ Pushed to GitHub"
    echo ""
    echo "⏳ Waiting 5 seconds for Railway to detect the push..."
    sleep 5
fi

# Try to trigger deployment
echo "🚀 Triggering Railway deployment..."
echo ""

# Method 1: Try redeploy (if service is linked)
if railway redeploy 2>/dev/null; then
    echo "✅ Deployment triggered successfully!"
    echo ""
    echo "📊 Check your Railway dashboard for deployment status:"
    echo "   https://railway.app"
    exit 0
fi

# Method 2: Try railway up
echo "🔄 Trying alternative deployment method..."
if railway up 2>/dev/null; then
    echo "✅ Deployment triggered successfully!"
    exit 0
fi

# If both methods fail, provide instructions
echo "⚠️  Could not trigger deployment automatically."
echo ""
echo "📋 To enable auto-deploy in Railway dashboard:"
echo ""
echo "1. Go to https://railway.app"
echo "2. Select your project"
echo "3. Go to Service Settings → Source"
echo "4. Make sure:"
echo "   - GitHub repository is connected"
echo "   - Branch is set to 'main'"
echo "   - 'Auto Deploy' is ENABLED"
echo ""
echo "💡 Railway should automatically deploy when you push to GitHub."
echo "   If it doesn't, check the settings above."

