const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const AdminUser = require('./src/models/AdminUser');
require('dotenv').config();

async function debugLoginStepByStep() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/alert_bot_dev');
        console.log('✅ Connected to database');

        const email = 'admin@tradingalerts.com';
        const password = 'Admin@123456';
        
        console.log('\n🔍 Step 1: Finding admin user...');
        const admin = await AdminUser.findOne({ email, status: 'active' }).select('+password');
        
        if (!admin) {
            console.log('❌ Admin user not found with email and active status');
            
            // Try finding without status filter
            const adminAny = await AdminUser.findOne({ email }).select('+password');
            if (adminAny) {
                console.log('✅ Found admin with email but status is:', adminAny.status);
            } else {
                console.log('❌ No admin found with this email at all');
            }
            return;
        }
        
        console.log('✅ Admin user found');
        console.log('   Email:', admin.email);
        console.log('   Status:', admin.status);
        console.log('   Has password:', !!admin.password);
        
        console.log('\n🔍 Step 2: Testing password...');
        const isPasswordValid = await bcrypt.compare(password, admin.password);
        console.log('   Password valid:', isPasswordValid ? '✅ YES' : '❌ NO');
        
        if (!isPasswordValid) {
            console.log('\n🔧 Let me set the password again...');
            const saltRounds = 12;
            admin.password = await bcrypt.hash(password, saltRounds);
            await admin.save();
            console.log('✅ Password updated');
            
            // Test again
            const isPasswordValidNow = await bcrypt.compare(password, admin.password);
            console.log('   Password valid now:', isPasswordValidNow ? '✅ YES' : '❌ NO');
        }
        
        console.log('\n🔍 Step 3: Checking failed login attempts...');
        console.log('   failedLoginAttempts (direct):', admin.failedLoginAttempts);
        console.log('   security.failedLoginAttempts:', admin.security?.failedLoginAttempts);
        
        // Reset failed attempts
        admin.failedLoginAttempts = 0;
        if (admin.security) {
            admin.security.failedLoginAttempts = 0;
        }
        await admin.save();
        console.log('✅ Reset failed login attempts');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Database connection closed');
    }
}

debugLoginStepByStep();