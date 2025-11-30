#!/usr/bin/env node

/**
 * Railway Auto-Deploy Setup Script
 * 
 * This script helps configure Railway for automatic deployments from GitHub.
 * It checks the current setup and provides instructions or attempts to fix issues.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Railway Auto-Deploy Setup');
console.log('============================\n');

// Check if Railway CLI is installed
function checkRailwayCLI() {
    try {
        const version = execSync('railway --version', { encoding: 'utf8' }).trim();
        console.log(`✅ Railway CLI found: ${version}\n`);
        return true;
    } catch (error) {
        console.log('❌ Railway CLI not found');
        console.log('   Installing Railway CLI...\n');
        try {
            execSync('npm install -g @railway/cli@latest', { stdio: 'inherit' });
            console.log('✅ Railway CLI installed\n');
            return true;
        } catch (installError) {
            console.log('❌ Failed to install Railway CLI');
            console.log('   Please install manually: npm install -g @railway/cli\n');
            return false;
        }
    }
}

// Check git remote
function checkGitRemote() {
    try {
        const remote = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
        console.log(`✅ Git remote configured: ${remote}\n`);
        return remote;
    } catch (error) {
        console.log('❌ Git remote not configured\n');
        return null;
    }
}

// Check current branch
function checkBranch() {
    try {
        const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
        console.log(`✅ Current branch: ${branch}\n`);
        return branch;
    } catch (error) {
        console.log('❌ Could not determine current branch\n');
        return null;
    }
}

// Main execution
async function main() {
    const hasCLI = checkRailwayCLI();
    if (!hasCLI) {
        console.log('⚠️  Cannot proceed without Railway CLI');
        process.exit(1);
    }

    const remote = checkGitRemote();
    const branch = checkBranch();

    console.log('📋 Setup Summary:');
    console.log('================\n');
    console.log(`Repository: ${remote || 'Not configured'}`);
    console.log(`Branch: ${branch || 'Unknown'}\n`);

    console.log('🔧 Railway Auto-Deploy Configuration:');
    console.log('=====================================\n');
    console.log('To enable auto-deploy in Railway:');
    console.log('');
    console.log('1. Go to https://railway.app');
    console.log('2. Select your project');
    console.log('3. Go to Service Settings → Source');
    console.log('4. Verify:');
    console.log('   ✅ GitHub repository is connected');
    console.log('   ✅ Branch is set to "main"');
    console.log('   ✅ "Auto Deploy" is ENABLED');
    console.log('   ❌ "Wait for CI" is DISABLED (unless you use CI/CD)');
    console.log('');
    console.log('💡 Railway will automatically deploy when you push to GitHub.');
    console.log('   If it doesn\'t work, try disconnecting and reconnecting GitHub.\n');

    // Check if GitHub Actions workflow exists
    const workflowPath = path.join(__dirname, '.github', 'workflows', 'railway-deploy.yml');
    if (fs.existsSync(workflowPath)) {
        console.log('✅ GitHub Actions workflow found');
        console.log('   This will deploy to Railway as a backup method.');
        console.log('   You need to set up Railway secrets in GitHub:\n');
        console.log('   1. Go to https://github.com/zohoschools2022/anonymice-chat/settings/secrets/actions');
        console.log('   2. Add secret: RAILWAY_TOKEN (get from Railway dashboard)');
        console.log('   3. Add secret: RAILWAY_SERVICE_ID (get from Railway service settings)\n');
    }

    console.log('🎯 Next Steps:');
    console.log('==============\n');
    console.log('1. Configure Railway dashboard (see above)');
    console.log('2. Push a test commit: git push origin main');
    console.log('3. Check Railway dashboard for automatic deployment\n');
}

main().catch(console.error);

