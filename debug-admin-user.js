const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const AdminUser = require('./src/models/AdminUser');
require('dotenv').config();

async function debugAdminUser() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/alert_bot_dev');
        console.log('✅ Connected to database');

        const email = 'admin@tradingalerts.com';
        
        // Find the admin user with password field
        const admin = await AdminUser.findOne({ email }).select('+password');
        if (!admin) {
            console.log('❌ Admin user not found');
            return;
        }
        
        console.log('\n📋 Admin User Details:');
        console.log('================================');
        console.log('Email:', admin.email);
        console.log('Username:', admin.username);
        console.log('Status:', admin.status);
        console.log('Password Hash:', admin.password ? 'Present' : 'Missing');
        console.log('Failed Login Attempts:', admin.security?.failedLoginAttempts || 0);
        console.log('Lock Until:', admin.security?.lockUntil || 'Not locked');
        console.log('Profile:', admin.profile);
        
        // Test password comparison
        const testPassword = 'Admin@123456';
        if (admin.password) {
            const isMatch = await bcrypt.compare(testPassword, admin.password);
            console.log('\n🔑 Password Test:');
            console.log('Test Password:', testPassword);
            console.log('Password Match:', isMatch ? '✅ YES' : '❌ NO');
        }
        
        // Update the admin user to ensure proper structure
        console.log('\n🔧 Updating admin user structure...');
        admin.username = admin.username || 'admin';
        admin.profile = admin.profile || {
            firstName: 'System',
            lastName: 'Administrator'
        };
        admin.status = 'active';
        admin.security = admin.security || {};
        admin.security.failedLoginAttempts = 0;
        admin.security.lockUntil = undefined;
        
        // Hash and set new password
        const newPassword = 'Admin@123456';
        const saltRounds = 12;
        admin.password = await bcrypt.hash(newPassword, saltRounds);
        
        await admin.save();
        console.log('✅ Admin user updated successfully');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Database connection closed');
    }
}

debugAdminUser();