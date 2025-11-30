#!/usr/bin/env node

/**
 * Automatic Railway Deployment Trigger
 * 
 * This script automatically triggers Railway deployments when code is pushed.
 * It can be run manually or integrated into your workflow.
 */

const { execSync } = require('child_process');
const fs = require('fs');

console.log('🚀 Railway Auto-Deploy Trigger');
console.log('==============================\n');

// Check prerequisites
function checkPrerequisites() {
    const checks = {
        railwayCLI: false,
        loggedIn: false,
        linked: false
    };

    // Check Railway CLI
    try {
        execSync('railway --version', { stdio: 'ignore' });
        checks.railwayCLI = true;
        console.log('✅ Railway CLI installed');
    } catch (error) {
        console.log('❌ Railway CLI not found');
        console.log('   Installing...');
        try {
            execSync('npm install -g @railway/cli@latest', { stdio: 'inherit' });
            checks.railwayCLI = true;
            console.log('✅ Railway CLI installed');
        } catch (installError) {
            console.log('❌ Failed to install Railway CLI');
            return false;
        }
    }

    // Check if logged in
    try {
        execSync('railway status', { stdio: 'ignore' });
        checks.loggedIn = true;
        console.log('✅ Logged into Railway');
    } catch (error) {
        console.log('⚠️  Not logged into Railway');
        console.log('   Run: railway login');
        return false;
    }

    // Check if linked
    try {
        execSync('railway link', { stdio: 'ignore' });
        checks.linked = true;
        console.log('✅ Project linked to Railway');
    } catch (error) {
        console.log('⚠️  Project not linked');
        console.log('   Linking...');
        try {
            execSync('railway link', { stdio: 'inherit', input: '\n' });
            checks.linked = true;
            console.log('✅ Project linked');
        } catch (linkError) {
            console.log('❌ Failed to link project');
            return false;
        }
    }

    return true;
}

// Trigger deployment
function triggerDeployment() {
    console.log('\n🚀 Triggering Railway deployment...\n');

    try {
        // Try redeploy first (faster)
        console.log('Attempting redeploy...');
        execSync('railway redeploy', { stdio: 'inherit' });
        console.log('\n✅ Deployment triggered successfully!');
        return true;
    } catch (error) {
        console.log('Redeploy failed, trying alternative method...');
        try {
            // Fallback to railway up
            execSync('railway up', { stdio: 'inherit' });
            console.log('\n✅ Deployment triggered successfully!');
            return true;
        } catch (upError) {
            console.log('\n⚠️  Could not trigger deployment automatically');
            console.log('\n💡 Railway should auto-deploy if configured in dashboard:');
            console.log('   1. Go to https://railway.app');
            console.log('   2. Service Settings → Source');
            console.log('   3. Enable "Auto Deploy"');
            return false;
        }
    }
}

// Main execution
function main() {
    if (!checkPrerequisites()) {
        console.log('\n❌ Prerequisites not met. Please fix the issues above.');
        process.exit(1);
    }

    console.log('\n');
    const success = triggerDeployment();

    if (success) {
        console.log('\n📊 Check deployment status at: https://railway.app');
        console.log('✅ Deployment process started!');
    } else {
        console.log('\n⚠️  Automatic deployment failed.');
        console.log('   Railway may still auto-deploy if configured in dashboard.');
        process.exit(1);
    }
}

main();

