// Script to restore original rate limits after testing
// Run this script when you're done testing to restore production rate limits

const fs = require('fs');
const path = require('path');

function restoreFile(originalFile, backupFile) {
  try {
    if (fs.existsSync(backupFile)) {
      fs.copyFileSync(backupFile, originalFile);
      console.log(`✅ Restored ${originalFile} from backup`);
      
      // Delete backup file
      fs.unlinkSync(backupFile);
      console.log(`🗑️  Deleted backup file ${backupFile}`);
    } else {
      console.log(`❌ Backup file ${backupFile} not found`);
    }
  } catch (error) {
    console.error(`❌ Error restoring ${originalFile}:`, error.message);
  }
}

function main() {
  console.log('🔄 Restoring original rate limit configurations...');
  
  const authFile = path.join(__dirname, 'src', 'routes', 'auth.js');
  const authBackup = path.join(__dirname, 'src', 'routes', 'auth.js.backup');
  
  const serverFile = path.join(__dirname, 'src', 'server.js');
  const serverBackup = path.join(__dirname, 'src', 'server.js.backup');
  
  restoreFile(authFile, authBackup);
  restoreFile(serverFile, serverBackup);
  
  // Clean up testing files
  const testingRateLimitsFile = path.join(__dirname, 'testing-rate-limits.js');
  const restoreScriptFile = path.join(__dirname, 'restore-rate-limits.js');
  
  try {
    if (fs.existsSync(testingRateLimitsFile)) {
      fs.unlinkSync(testingRateLimitsFile);
      console.log('🗑️  Deleted testing-rate-limits.js');
    }
    
    console.log('\n✅ Rate limits restored to production values!');
    console.log('⚠️  Remember to restart your server for changes to take effect.');
    console.log('\n📋 Original rate limits:');
    console.log('   - Auth endpoints: 5 requests per 15 minutes');
    console.log('   - Login endpoints: 10 requests per 15 minutes');
    console.log('   - General API: 100 requests per 15 minutes');
    
    // Self-delete this script
    setTimeout(() => {
      fs.unlinkSync(restoreScriptFile);
      console.log('🗑️  Deleted restore-rate-limits.js');
    }, 1000);
    
  } catch (error) {
    console.error('❌ Error cleaning up files:', error.message);
  }
}

if (require.main === module) {
  main();
}

module.exports = { restoreFile, main };