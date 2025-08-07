# 🚀 Deployment Guide for Anonymice Chat

## Option 1: Railway Deployment (Recommended)

### Step 1: Create GitHub Repository
1. Go to [github.com](https://github.com)
2. Click "New repository"
3. Name: `anonymice-chat`
4. Make it **Public**
5. Don't initialize with README
6. Click "Create repository"

### Step 2: Push Code to GitHub
Run these commands in your terminal:

```bash
git remote add origin https://github.com/YOUR_USERNAME/anonymice-chat.git
git branch -M main
git push -u origin main
```

### Step 3: Deploy to Railway
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Click "New Project"
4. Select "Deploy from GitHub repo"
5. Choose your `anonymice-chat` repository
6. Click "Deploy"

### Step 4: Get Your URLs
After deployment, Railway will provide:
- **Public URL**: `https://your-app-name.railway.app`
- **Admin URL**: `https://your-app-name.railway.app/admin/{ADMIN_URL}`
- **Knock URL**: `https://your-app-name.railway.app/knock`

## Option 2: Manual GitHub Setup

If you prefer to set up GitHub manually:

1. **Create repository** on GitHub.com
2. **Copy the repository URL**
3. **Run these commands**:
   ```bash
   git remote add origin YOUR_REPOSITORY_URL
   git branch -M main
   git push -u origin main
   ```

## Option 3: Alternative Hosting

### Render
- Go to [render.com](https://render.com)
- Connect GitHub repository
- Deploy as Web Service

### Vercel
- Go to [vercel.com](https://vercel.com)
- Import GitHub repository
- Deploy automatically

## 🎯 Quick Start Commands

```bash
# If you have the repository URL:
git remote add origin https://github.com/YOUR_USERNAME/anonymice-chat.git
git branch -M main
git push -u origin main
```

## 📋 What You'll Get

After deployment, you'll have:
- ✅ Public chat application
- ✅ Admin dashboard with tiled interface
- ✅ Real-time messaging
- ✅ Anonymous chat functionality
- ✅ Up to 8 concurrent conversations

## 🔧 Troubleshooting

If you encounter issues:
1. Make sure repository is **public**
2. Check that all files are committed
3. Verify Railway detects Node.js project
4. Check deployment logs for errors

## 🎉 Success!

Once deployed, you can:
- Share the knock URL with friends
- Use the admin URL to manage conversations
- Monitor up to 8 concurrent chats 