#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 Anonymice Chat - Quick Deployment Guide');
console.log('==========================================');
console.log('');

// Check if we have all necessary files
const requiredFiles = [
    'package.json',
    'server.js',
    'public/index.html',
    'public/admin.html',
    'public/knock.html',
    'public/chat.html',
    'public/styles.css',
    'railway.json'
];

console.log('📋 Checking project files...');
let allFilesExist = true;

requiredFiles.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`✅ ${file}`);
    } else {
        console.log(`❌ ${file} - Missing!`);
        allFilesExist = false;
    }
});

console.log('');

if (!allFilesExist) {
    console.log('❌ Some required files are missing. Please ensure all files are present.');
    process.exit(1);
}

console.log('✅ All files are ready!');
console.log('');

// Check git status
const { execSync } = require('child_process');

try {
    const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' });
    if (gitStatus.trim()) {
        console.log('⚠️  You have uncommitted changes:');
        console.log(gitStatus);
        console.log('');
        console.log('💡 Run these commands to commit changes:');
        console.log('   git add .');
        console.log('   git commit -m "Update chat application"');
        console.log('');
    } else {
        console.log('✅ All changes are committed');
    }
} catch (error) {
    console.log('❌ Git repository not initialized');
    console.log('💡 Run: git init');
    process.exit(1);
}

console.log('');
console.log('🎯 DEPLOYMENT OPTIONS:');
console.log('======================');
console.log('');

console.log('1️⃣  RAILWAY (Recommended)');
console.log('   - Go to: https://railway.app');
console.log('   - Sign up with GitHub');
console.log('   - Click "New Project"');
console.log('   - Select "Deploy from GitHub repo"');
console.log('   - Choose your repository');
console.log('   - Deploy automatically');
console.log('');

console.log('2️⃣  RENDER');
console.log('   - Go to: https://render.com');
console.log('   - Connect GitHub account');
console.log('   - Create new Web Service');
console.log('   - Select your repository');
console.log('   - Deploy');
console.log('');

console.log('3️⃣  VERCEL');
console.log('   - Go to: https://vercel.com');
console.log('   - Import GitHub repository');
console.log('   - Deploy automatically');
console.log('');

console.log('📋 BEFORE DEPLOYING:');
console.log('===================');
console.log('1. Create GitHub repository:');
console.log('   - Go to https://github.com');
console.log('   - Click "New repository"');
console.log('   - Name: anonymice-chat');
console.log('   - Make it PUBLIC');
console.log('   - Don\'t initialize with README');
console.log('');

console.log('2. Push your code:');
console.log('   git remote add origin https://github.com/YOUR_USERNAME/anonymice-chat.git');
console.log('   git branch -M main');
console.log('   git push -u origin main');
console.log('');

console.log('🎉 AFTER DEPLOYMENT:');
console.log('===================');
console.log('Your app will be available at:');
console.log('- Public URL: https://your-app-name.railway.app');
console.log('- Knock URL: https://your-app-name.railway.app/knock');
console.log('- Admin URL: https://your-app-name.railway.app/admin/{ADMIN_URL}');
console.log('');

console.log('🔗 Share with friends:');
console.log('- Knock URL for participants to join');
console.log('- Admin URL for you to manage chats');
console.log('');

console.log('💡 TIP: The admin URL will be shown in the deployment logs');
console.log('   Look for: "Admin URL: http://..." in the console output'); 