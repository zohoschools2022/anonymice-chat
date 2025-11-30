# Railway Auto-Deploy Fix Guide

## Issue
Railway is not auto-deploying after code changes are pushed to GitHub.

## Solution Steps

### Step 1: Check Railway Dashboard Settings

1. Go to https://railway.app and log in
2. Select your project
3. Click on your service (the one running the chat app)
4. Go to **Settings** → **Source** tab
5. Verify the following:
   - ✅ **GitHub Repository**: Should be connected to `zohoschools2022/anonymice-chat`
   - ✅ **Branch**: Should be set to `main`
   - ✅ **Auto Deploy**: Should be **ENABLED**
   - ⚠️ **Wait for CI**: Should be **DISABLED** (unless you have CI/CD)

### Step 2: Reconnect GitHub (if needed)

If auto-deploy is still not working:

1. In Railway dashboard, go to **Settings** → **Source**
2. Click **"Disconnect"** from GitHub
3. Click **"Connect GitHub"** again
4. Select the repository: `zohoschools2022/anonymice-chat`
5. Select branch: `main`
6. Enable **"Auto Deploy"**
7. Save settings

### Step 3: Verify GitHub Webhook

Railway should automatically create a webhook in your GitHub repository. To verify:

1. Go to https://github.com/zohoschools2022/anonymice-chat/settings/hooks
2. Look for a webhook from Railway (should have `railway.app` in the URL)
3. If webhook is missing or failed, Railway will recreate it when you reconnect

### Step 4: Test Manual Deployment

To verify Railway can deploy:

1. In Railway dashboard, press `CMD + K` (or `CTRL + K` on Windows)
2. Type "Deploy Latest Commit"
3. Select it to manually trigger a deployment
4. This will deploy the latest commit from `main` branch

### Step 5: Check Recent Deployments

1. In Railway dashboard, go to **Deployments** tab
2. Check if recent commits are showing up
3. If commits are there but not deploying, check the deployment logs

## Common Issues

### Issue: "Wait for CI" is enabled
**Fix**: Disable "Wait for CI" in Settings → Source if you don't have CI/CD

### Issue: Wrong branch selected
**Fix**: Make sure branch is set to `main` (not `master` or another branch)

### Issue: GitHub connection lost
**Fix**: Disconnect and reconnect GitHub repository

### Issue: Railway service outage
**Fix**: Check https://status.railway.app for any ongoing issues

## Verify Current Setup

Your current git configuration:
- **Repository**: `zohoschools2022/anonymice-chat`
- **Branch**: `main`
- **Remote**: `git@github.com:zohoschools2022/anonymice-chat.git`

## After Fixing

Once auto-deploy is enabled:
1. Push a commit: `git push origin main`
2. Railway should automatically detect the push
3. A new deployment should start within seconds
4. Check Railway dashboard → Deployments to see the deployment progress

## Need Help?

If auto-deploy still doesn't work after these steps:
1. Check Railway logs for errors
2. Verify GitHub webhook is active
3. Contact Railway support or check their status page

