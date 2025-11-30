#!/bin/bash

echo "🔧 Setting up git hooks for Railway auto-deploy"
echo "================================================"
echo ""

# Create hooks directory if it doesn't exist
mkdir -p .git/hooks

# Create post-push hook
cat > .git/hooks/post-push << 'HOOK_EOF'
#!/bin/bash
# This hook runs after a successful git push

echo ""
echo "🚀 Checking Railway deployment status..."
echo ""

# Check if Railway CLI is available
if command -v railway &> /dev/null; then
    echo "✅ Railway CLI found"
    
    # Check if logged in
    if railway status &> /dev/null; then
        echo "✅ Logged into Railway"
        echo ""
        echo "💡 Railway should auto-deploy if configured in dashboard."
        echo "   If not, run: railway redeploy"
    else
        echo "⚠️  Not logged into Railway"
        echo "   Run: railway login"
    fi
else
    echo "⚠️  Railway CLI not installed"
    echo "   Install with: npm install -g @railway/cli"
fi

echo ""
HOOK_EOF

chmod +x .git/hooks/post-push
echo "✅ Git hook installed: .git/hooks/post-push"
echo ""
echo "📋 This hook will run after each git push"
echo "   It will check Railway status and provide deployment info"
echo ""

