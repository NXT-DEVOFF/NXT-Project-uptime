#!/usr/bin/env node

/**
 * Security Check Script for NXT Project Tracker
 * Runs various security checks to help identify potential vulnerabilities
 */

const { execSync } = require('child_process');
const { readdirSync, readFileSync, statSync } = require('fs');
const { join } = require('path');

// Simple color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',

  fgBlack: '\x1b[30m',
  fgRed: '\x1b[31m',
  fgGreen: '\x1b[32m',
  fgYellow: '\x1b[33m',
  fgBlue: '\x1b[34m',
  fgMagenta: '\x1b[35m',
  fgCyan: '\x1b[36m',
  fgWhite: '\x1b[37m',

  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m'
};

const log = (msg, type = 'info') => {
  let color = '';
  let symbol = '';

  switch (type) {
    case 'success':
      color = colors.fgGreen;
      symbol = '[✓]';
      break;
    case 'error':
      color = colors.fgRed;
      symbol = '[✗]';
      break;
    case 'warning':
      color = colors.fgYellow;
      symbol = '[⚠]';
      break;
    case 'info':
    default:
      color = colors.fgBlue;
      symbol = '[ℹ]';
      break;
  }

  console.log(`${color}${symbol} ${msg}${colors.reset}`);
};

const checkEnvFiles = () => {
  log('Checking for exposed environment files...', 'info');

  const envFiles = ['.env', '.env.local', '.env.development', '.env.production', '.env.test'];
  const found = [];

  for (const file of envFiles) {
    try {
      const stats = statSync(join(process.cwd(), file));
      if (stats.isFile()) {
        found.push(file);
      }
    } catch (e) {
      // File doesn't exist, which is good
    }
  }

  if (found.length > 0) {
    log(`Found potentially exposed environment files: ${found.join(', ')}`, 'error');
    log('These should be added to .gitignore and never committed to version control', 'warning');
    return false;
  } else {
    log('No exposed environment files found', 'success');
    return true;
  }
};

const checkGitignoredEnv = () => {
  log('Checking if .env is properly gitignored...', 'info');

  try {
    const gitignoreContent = readFileSync(join(process.cwd(), '.gitignore'), 'utf8');
    const lines = gitignoreContent.split('\n');
    const envIgnored = lines.some(line => line.trim() === '.env' || line.trim().startsWith('.env'));

    if (envIgnored) {
      log('.env is properly ignored by Git', 'success');
      return true;
    } else {
      log('.env is NOT ignored by Git - ADD IT TO .gitignore!', 'error');
      return false;
    }
  } catch (e) {
    log('.gitignore file not found', 'error');
    return false;
  }
};

const checkHardcodedSecrets = () => {
  log('Checking for hardcoded secrets in source code...', 'info');

  // Common patterns for secrets
  const secretPatterns = [
    /password\s*[:=]\s*['"][^"'\\s]+['"]/i,
    /secret\s*[:=]\s*['"][^"'\\s]+['"]/i,
    /key\s*[:=]\s*['"][^"'\\s]+['"]/i,
    /token\s*[:=]\s*['"][^"'\\s]+['"]/i,
    /api[_-]?key\s*[:=]\s*['"][^"'\\s]+['"]/i,
    /mongodb\s*\+\s*srv:\/\/[^\s]+/i,
    /mysql:\/\/[^\s]+/i,
    /postgres:\/\/[^\s]+/i,
    /redis:\/\/[^\s]+/i
  ];

  const extensionsToCheck = ['.js', '.ts', '.jsx', '.tsx', '.json', '.env.example'];
  const directoriesToScan = ['src', 'backend', 'frontend'];
  let issues = [];

  const scanDirectory = (dir) => {
    try {
      const files = readdirSync(join(process.cwd(), dir), { withFileTypes: true });

      for (const file of files) {
        const fullPath = join(dir, file.name);

        if (file.isDirectory() && !file.name.includes('node_modules') && !file.name.includes('.git')) {
          scanDirectory(fullPath);
        } else if (file.isFile()) {
          const ext = '.' + file.name.split('.').pop();
          if (extensionsToCheck.includes(ext)) {
            try {
              const content = readFileSync(join(process.cwd(), fullPath), 'utf8');

              for (const pattern of secretPatterns) {
                let match;
                while ((match = pattern.exec(content)) !== null) {
                  // Check if it's likely a real secret (not just a placeholder or example)
                  const matchedText = match[0];
                  if (!/(example|placeholder|test|fake|dummy|<your-|\[\s*your\s*\]|process\.env)/i.test(matchedText)) {
                    issues.push({
                      file: fullPath,
                      line: content.substring(0, match.index).split('\n').length,
                      match: matchedText
                    });
                  }
                }
              }
            } catch (e) {
              // Could not read file, skip
            }
          }
        }
      }
    } catch (e) {
      // Directory might not exist
    }
  };

  for (const dir of directoriesToScan) {
    scanDirectory(dir);
  }

  if (issues.length > 0) {
    log(`Found ${issues.length} potential hardcoded secrets:`, 'error');
    for (const issue of issues.slice(0, 5)) { // Show first 5
      log(`  ${issue.file}:${issue.line} - ${issue.match}`, 'error');
    }
    if (issues.length > 5) {
      log(`  ... and ${issues.length - 5} more`, 'error');
    }
    return false;
  } else {
    log('No hardcoded secrets detected', 'success');
    return true;
  }
};

const runNpmAudit = (scope) => {
  log(`Running npm audit for ${scope}...`, 'info');

  try {
    // Try to run npm audit
    const output = execSync(`cd ${scope} && npm audit --json`, {
      encoding: 'utf8',
      stdio: 'pipe'
    });

    const result = JSON.parse(output);

    if (result.metadata.vulnerabilities.total > 0) {
      log(`Found ${result.metadata.vulnerabilities.total} vulnerabilities:`, 'warning');
      log(`  High: ${result.metadata.vulnerabilities.high}`);
      log(`  Medium: ${result.metadata.vulnerabilities.moderate}`);
      log(`  Low: ${result.metadata.vulnerabilities.low}`);

      if (result.metadata.vulnerabilities.high > 0) {
        log('High severity vulnerabilities found! Consider running "npm audit fix"', 'error');
        return false;
      }
    } else {
      log('No vulnerabilities found', 'success');
      return true;
    }
  } catch (error) {
    // npm audit might fail if there are issues
    if (error.status && error.status !== 1) {
      log(`Error running npm audit: ${error.message}`, 'error');
      return false;
    }

    // If exit code is 1, it means vulnerabilities were found
    try {
      const output = error.stdout.toString();
      const result = JSON.parse(output);

      if (result.metadata.vulnerabilities.total > 0) {
        log(`Found ${result.metadata.vulnerabilities.total} vulnerabilities:`, 'warning');
        log(`  High: ${result.metadata.vulnerabilities.high}`);
        log(`  Medium: ${result.metadata.vulnerabilities.moderate}`);
        log(`  Low: ${result.metadata.vulnerabilities.low}`);

        if (result.metadata.vulnerabilities.high > 0) {
          log('High severity vulnerabilities found! Consider running "npm audit fix"', 'error');
          return false;
        }
      }
    } catch (e) {
      // If we can't parse the output, just show the error
      log(`npm audit completed with issues: ${error.message}`, 'warning');
    }

    return true; // Assume ok if we got here
  }
};

const checkDependencyUpdates = (scope) => {
  log(`Checking for outdated dependencies in ${scope}...`, 'info');

  try {
    const output = execSync(`cd ${scope} && npm outdated --json`, {
      encoding: 'utf8',
      stdio: 'pipe'
    });

    const result = JSON.parse(output);
    const outdatedCount = Object.keys(result).length;

    if (outdatedCount > 0) {
      log(`Found ${outdatedCount} outdated packages:`, 'warning');
      // Show first 5
      const packages = Object.keys(result).slice(0, 5);
      for (const pkg of packages) {
        const info = result[pkg];
        log(`  ${pkg}: ${info.current} → ${info.latest} (wanted: ${info.wanted})`, 'warning');
      }
      if (outdatedCount > 5) {
        log(`  ... and ${outdatedCount - 5} more`, 'warning');
      }
      log('Consider running "npm update" to get latest versions', 'info');
      return false;
    } else {
      log('All dependencies are up to date', 'success');
      return true;
    }
  } catch (error) {
    // If no outdated packages, npm outdated returns exit code 1
    if (error.status === 1) {
      log('All dependencies are up to date', 'success');
      return true;
    }

    log(`Error checking for outdated dependencies: ${error.message}`, 'error');
    return false;
  }
};

const main = () => {
  log('Starting security check for NXT Project Tracker...', 'info');
  log('='.repeat(50), 'info');

  let allPassed = true;

  // Check 1: Environment files
  allPassed = checkEnvFiles() && allPassed;

  // Check 2: Gitignore
  allPassed = checkGitignoredEnv() && allPassed;

  // Check 3: Hardcoded secrets
  allPassed = checkHardcodedSecrets() && allPassed;

  // Check 4: npm audit for backend
  log('', 'info');
  allPassed = runNpmAudit('backend') && allPassed;

  // Check 5: npm audit for frontend
  log('', 'info');
  allPassed = runNpmAudit('frontend') && allPassed;

  // Check 6: Dependency updates (optional, doesn't fail the check)
  log('', 'info');
  checkDependencyUpdates('backend');
  log('', 'info');
  checkDependencyUpdates('frontend');

  log('', 'info');
  log('='.repeat(50), 'info');

  if (allPassed) {
    log('All security checks passed! 🎉', 'success');
    process.exit(0);
  } else {
    log('Some security checks failed. Please review the issues above.', 'error');
    process.exit(1);
  }
};

// Run the check
main();