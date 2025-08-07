#!/bin/bash

echo "🚀 Anonymice Chat Deployment Script"
echo "=================================="

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "❌ Git repository not initialized"
    exit 1
fi

# Check if we have commits
if ! git log --oneline -1 > /dev/null 2>&1; then
    echo "❌ No commits found. Please commit your changes first."
    exit 1
fi

echo "✅ Git repository is ready"

# Check if remote is already set
if git remote get-url origin > /dev/null 2>&1; then
    echo "✅ Remote origin already set"
    REMOTE_URL=$(git remote get-url origin)
    echo "📋 Current remote: $REMOTE_URL"
else
    echo "📝 Please provide your GitHub repository URL:"
    echo "   Format: https://github.com/YOUR_USERNAME/anonymice-chat.git"
    echo ""
    read -p "Enter repository URL: " REPO_URL
    
    if [ -z "$REPO_URL" ]; then
        echo "❌ No URL provided. Exiting."
        exit 1
    fi
    
    git remote add origin "$REPO_URL"
    echo "✅ Remote origin added"
fi

# Switch to main branch
git branch -M main

# Push to GitHub
echo "📤 Pushing to GitHub..."
if git push -u origin main; then
    echo "✅ Successfully pushed to GitHub!"
    echo ""
    echo "🎉 Next Steps:"
    echo "1. Go to https://railway.app"
    echo "2. Sign up with GitHub"
    echo "3. Click 'New Project'"
    echo "4. Select 'Deploy from GitHub repo'"
    echo "5. Choose your 'anonymice-chat' repository"
    echo "6. Click 'Deploy'"
    echo ""
    echo "📋 Your app will be available at:"
    echo "   https://your-app-name.railway.app"
    echo ""
    echo "🔗 Share these URLs with friends:"
    echo "   Knock URL: https://your-app-name.railway.app/knock"
    echo "   Admin URL: https://your-app-name.railway.app/admin/{ADMIN_URL}"
else
    echo "❌ Failed to push to GitHub"
    echo "💡 Make sure:"
    echo "   - Repository exists on GitHub"
    echo "   - Repository is public"
    echo "   - You have write access"
    exit 1
fi 