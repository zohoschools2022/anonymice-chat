#!/usr/bin/env node

/**
 * Railway Configuration Verification Script
 * Checks what can be verified programmatically and provides checklist for manual verification
 */

const { execSync } = require('child_process');
const fs = require('fs');
const https = require('https');

console.log('🔍 Railway Configuration Verification');
console.log('=====================================\n');

const checks = {
    git: { status: '❓', details: [] },
    github: { status: '❓', details: [] },
    railway: { status: '❓', details: [] },
    deployment: { status: '❓', details: [] }
};

// Check Git configuration
console.log('1️⃣  Checking Git Configuration...');
try {
    const remote = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
    const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    const lastCommit = execSync('git log -1 --oneline', { encoding: 'utf8' }).trim();
    
    checks.git.status = '✅';
    checks.git.details.push(`Remote: ${remote}`);
    checks.git.details.push(`Branch: ${branch}`);
    checks.git.details.push(`Last commit: ${lastCommit}`);
    
    if (remote.includes('zohoschools2022/anonymice-chat')) {
        checks.git.details.push('✅ Repository matches expected');
    } else {
        checks.git.details.push('⚠️  Repository may not match');
    }
    
    if (branch === 'main') {
        checks.git.details.push('✅ Branch is correct (main)');
    } else {
        checks.git.details.push(`⚠️  Branch is ${branch}, should be 'main'`);
    }
} catch (error) {
    checks.git.status = '❌';
    checks.git.details.push('Error checking git configuration');
}

console.log(`   Status: ${checks.git.status}\n`);

// Check GitHub Actions
console.log('2️⃣  Checking GitHub Actions...');
const workflowPath = '.github/workflows/railway-deploy.yml';
if (fs.existsSync(workflowPath)) {
    checks.github.status = '✅';
    checks.github.details.push('✅ GitHub Actions workflow exists');
    
    try {
        const workflow = fs.readFileSync(workflowPath, 'utf8');
        if (workflow.includes('railway-deploy')) {
            checks.github.details.push('✅ Railway deployment action configured');
        }
        if (workflow.includes('branches:\n      - main')) {
            checks.github.details.push('✅ Triggers on main branch');
        }
    } catch (error) {
        checks.github.details.push('⚠️  Could not read workflow file');
    }
} else {
    checks.github.status = '❌';
    checks.github.details.push('❌ GitHub Actions workflow not found');
}

console.log(`   Status: ${checks.github.status}\n`);

// Check Railway CLI
console.log('3️⃣  Checking Railway CLI...');
try {
    const version = execSync('railway --version', { encoding: 'utf8' }).trim();
    checks.railway.status = '✅';
    checks.railway.details.push(`✅ Railway CLI installed: ${version}`);
    
    // Try to check if logged in
    try {
        execSync('railway status', { stdio: 'ignore', encoding: 'utf8' });
        checks.railway.details.push('✅ Logged into Railway');
        
        // Try to get service info
        try {
            const service = execSync('railway service', { encoding: 'utf8' }).trim();
            checks.railway.details.push(`✅ Service linked: ${service || 'Yes'}`);
        } catch (e) {
            checks.railway.details.push('⚠️  Service may not be linked');
        }
    } catch (e) {
        checks.railway.details.push('⚠️  Not logged into Railway CLI');
        checks.railway.details.push('   Run: railway login');
    }
} catch (error) {
    checks.railway.status = '❌';
    checks.railway.details.push('❌ Railway CLI not installed');
}

console.log(`   Status: ${checks.railway.status}\n`);

// Check deployment scripts
console.log('4️⃣  Checking Deployment Scripts...');
const scripts = [
    'auto-deploy-railway.js',
    'railway-auto-deploy.sh',
    'setup-railway-auto-deploy.js'
];

let scriptsFound = 0;
scripts.forEach(script => {
    if (fs.existsSync(script)) {
        scriptsFound++;
    }
});

if (scriptsFound === scripts.length) {
    checks.deployment.status = '✅';
    checks.deployment.details.push(`✅ All ${scripts.length} deployment scripts found`);
} else {
    checks.deployment.status = '⚠️';
    checks.deployment.details.push(`⚠️  Found ${scriptsFound}/${scripts.length} scripts`);
}

// Check package.json scripts
try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    if (packageJson.scripts && packageJson.scripts.deploy) {
        checks.deployment.details.push('✅ NPM deploy script configured');
    }
} catch (e) {
    checks.deployment.details.push('⚠️  Could not check package.json');
}

console.log(`   Status: ${checks.deployment.status}\n`);

// Summary
console.log('\n📊 Verification Summary');
console.log('======================\n');

Object.entries(checks).forEach(([key, check]) => {
    console.log(`${check.status} ${key.toUpperCase()}`);
    check.details.forEach(detail => {
        console.log(`   ${detail}`);
    });
    console.log('');
});

// Manual verification checklist
console.log('🔧 Manual Verification Required');
console.log('==============================\n');
console.log('The following must be checked in Railway Dashboard:\n');
console.log('1. Go to: https://railway.app');
console.log('2. Select your project');
console.log('3. Go to: Service Settings → Source');
console.log('4. Verify:');
console.log('   ✅ GitHub repository: zohoschools2022/anonymice-chat');
console.log('   ✅ Branch: main');
console.log('   ✅ Auto Deploy: ENABLED ← Most Important!');
console.log('   ❌ Wait for CI: DISABLED (unless you use CI/CD)');
console.log('\n5. Check Deployments tab:');
console.log('   - Look for recent deployments');
console.log('   - Check if deployments trigger on git push');
console.log('\n6. Test:');
console.log('   - Make a small change');
console.log('   - git push origin main');
console.log('   - Check Railway dashboard for automatic deployment');
console.log('');

// Overall status
const allGood = Object.values(checks).every(c => c.status === '✅');
if (allGood) {
    console.log('✅ Code setup is complete!');
    console.log('⚠️  Please verify Railway Dashboard configuration.');
} else {
    console.log('⚠️  Some issues found. Please review above.');
}

