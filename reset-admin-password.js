const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const AdminUser = require('./src/models/AdminUser');
require('dotenv').config();

async function resetAdminPassword() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/alert_bot_dev');
        console.log('✅ Connected to database');

        const email = 'admin@tradingalerts.com';
        const newPassword = 'Admin@123456';
        
        // Find the admin user
        const admin = await AdminUser.findOne({ email });
        if (!admin) {
            console.log('❌ Admin user not found');
            return;
        }
        
        // Hash the new password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
        
        // Update the password
        admin.password = hashedPassword;
        admin.failedLoginAttempts = 0; // Reset failed attempts
        await admin.save();
        
        console.log('✅ Password reset successfully');
        console.log(`📧 Email: ${email}`);
        console.log(`🔑 Password: ${newPassword}`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Database connection closed');
    }
}

resetAdminPassword();