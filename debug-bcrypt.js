const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const AdminUser = require('./src/models/AdminUser');
require('dotenv').config();

async function debugBcrypt() {
    try {
        const password = 'Admin@123456';
        
        console.log('🔍 Testing bcrypt directly...');
        
        // Test bcrypt directly
        const saltRounds = 12;
        const hash1 = await bcrypt.hash(password, saltRounds);
        console.log('Hash 1:', hash1);
        
        const isMatch1 = await bcrypt.compare(password, hash1);
        console.log('Direct bcrypt test:', isMatch1 ? '✅ PASS' : '❌ FAIL');
        
        // Test with different salt rounds
        const hash2 = await bcrypt.hash(password, 10);
        console.log('Hash 2 (salt 10):', hash2);
        
        const isMatch2 = await bcrypt.compare(password, hash2);
        console.log('Salt 10 test:', isMatch2 ? '✅ PASS' : '❌ FAIL');
        
        // Connect to database and test with actual user
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/alert_bot_dev');
        console.log('\n✅ Connected to database');
        
        const email = 'admin@tradingalerts.com';
        const admin = await AdminUser.findOne({ email }).select('+password');
        
        if (admin) {
            console.log('\n🔍 Testing with database user...');
            console.log('Stored hash:', admin.password);
            console.log('Hash length:', admin.password.length);
            console.log('Hash starts with $2a$ or $2b$:', admin.password.startsWith('$2a$') || admin.password.startsWith('$2b$'));
            
            const isMatch3 = await bcrypt.compare(password, admin.password);
            console.log('Database hash test:', isMatch3 ? '✅ PASS' : '❌ FAIL');
            
            // Try manually setting a new hash
            console.log('\n🔧 Setting new hash manually...');
            const newHash = await bcrypt.hash(password, 12);
            
            // Update using direct MongoDB operation
            await AdminUser.updateOne(
                { email },
                { $set: { password: newHash } }
            );
            
            // Fetch again and test
            const updatedAdmin = await AdminUser.findOne({ email }).select('+password');
            const isMatch4 = await bcrypt.compare(password, updatedAdmin.password);
            console.log('After manual update:', isMatch4 ? '✅ PASS' : '❌ FAIL');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        if (mongoose.connection.readyState === 1) {
            await mongoose.disconnect();
            console.log('\n🔌 Database connection closed');
        }
    }
}

debugBcrypt();