#!/bin/bash

echo "🔍 Checking Railway auto-deployment configuration..."
echo ""
echo "To enable auto-deployment on Railway:"
echo ""
echo "1. Go to https://railway.app"
echo "2. Select your project"
echo "3. Go to your service settings"
echo "4. Click on 'Source' tab"
echo "5. Make sure:"
echo "   - GitHub repository is connected: zohoschools2022/anonymice-chat"
echo "   - Branch is set to: main"
echo "   - 'Auto Deploy' is ENABLED"
echo ""
echo "If auto-deploy is disabled, enable it and Railway will automatically"
echo "deploy whenever you push to the main branch."
echo ""
echo "Current git remote:"
git remote -v
echo ""
echo "Current branch:"
git branch --show-current
echo ""
echo "✅ If everything is configured correctly, Railway should auto-deploy"
echo "   when you push to main branch."

