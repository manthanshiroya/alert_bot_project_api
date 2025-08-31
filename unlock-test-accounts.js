// Script to unlock user accounts that may be locked during testing
// This script resets login attempts and removes account locks

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const User = require('./src/models/User');
const AdminUser = require('./src/models/AdminUser');

async function connectToDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function unlockAllUsers() {
  try {
    console.log('🔓 Unlocking all user accounts...');
    
    // Reset user account locks and login attempts
    const userResult = await User.updateMany(
      {
        $or: [
          { 'security.lockUntil': { $exists: true } },
          { 'security.loginAttempts': { $gt: 0 } }
        ]
      },
      {
        $unset: {
          'security.lockUntil': 1,
          'security.loginAttempts': 1
        }
      }
    );
    
    console.log(`✅ Unlocked ${userResult.modifiedCount} user accounts`);
    
    // Reset admin account locks and login attempts
    const adminResult = await AdminUser.updateMany(
      {
        $or: [
          { 'security.lockUntil': { $exists: true } },
          { 'security.failedLoginAttempts': { $gt: 0 } }
        ]
      },
      {
        $unset: {
          'security.lockUntil': 1,
          'security.failedLoginAttempts': 1
        }
      }
    );
    
    console.log(`✅ Unlocked ${adminResult.modifiedCount} admin accounts`);
    
    return {
      usersUnlocked: userResult.modifiedCount,
      adminsUnlocked: adminResult.modifiedCount
    };
    
  } catch (error) {
    console.error('❌ Error unlocking accounts:', error);
    throw error;
  }
}

async function listLockedAccounts() {
  try {
    console.log('🔍 Checking for locked accounts...');
    
    // Find locked users
    const lockedUsers = await User.find({
      $or: [
        { 'security.lockUntil': { $gt: new Date() } },
        { 'security.loginAttempts': { $gte: 5 } }
      ]
    }).select('email security.loginAttempts security.lockUntil');
    
    // Find locked admins
    const lockedAdmins = await AdminUser.find({
      $or: [
        { 'security.lockUntil': { $gt: new Date() } },
        { 'security.failedLoginAttempts': { $gte: 5 } }
      ]
    }).select('email security.failedLoginAttempts security.lockUntil');
    
    console.log('\n📋 Locked User Accounts:');
    if (lockedUsers.length === 0) {
      console.log('   No locked user accounts found');
    } else {
      lockedUsers.forEach(user => {
        console.log(`   - ${user.email} (Attempts: ${user.security.loginAttempts || 0}, Lock until: ${user.security.lockUntil || 'N/A'})`);
      });
    }
    
    console.log('\n📋 Locked Admin Accounts:');
    if (lockedAdmins.length === 0) {
      console.log('   No locked admin accounts found');
    } else {
      lockedAdmins.forEach(admin => {
        console.log(`   - ${admin.email} (Attempts: ${admin.security.failedLoginAttempts || 0}, Lock until: ${admin.security.lockUntil || 'N/A'})`);
      });
    }
    
    return {
      lockedUsers: lockedUsers.length,
      lockedAdmins: lockedAdmins.length
    };
    
  } catch (error) {
    console.error('❌ Error checking locked accounts:', error);
    throw error;
  }
}

async function main() {
  try {
    await connectToDatabase();
    
    console.log('🔧 Account Unlock Utility for Testing\n');
    
    // Check current status
    const status = await listLockedAccounts();
    
    if (status.lockedUsers > 0 || status.lockedAdmins > 0) {
      console.log('\n🔓 Unlocking all accounts...');
      const result = await unlockAllUsers();
      
      console.log('\n✅ Account unlock completed!');
      console.log(`   - Users unlocked: ${result.usersUnlocked}`);
      console.log(`   - Admins unlocked: ${result.adminsUnlocked}`);
    } else {
      console.log('\n✅ No locked accounts found. All accounts are accessible.');
    }
    
    console.log('\n📝 Testing Tips:');
    console.log('   - Rate limits have been increased for testing');
    console.log('   - Account locks are now cleared');
    console.log('   - You can now test multiple login attempts');
    console.log('   - Run restore-rate-limits.js when testing is complete');
    
  } catch (error) {
    console.error('❌ Script failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

if (require.main === module) {
  main();
}

module.exports = { unlockAllUsers, listLockedAccounts, connectToDatabase };