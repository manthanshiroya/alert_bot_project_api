const mongoose = require('mongoose');
const AdminUser = require('./src/models/AdminUser');
require('dotenv').config();

async function checkAdminUsers() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/alert_bot_dev');
        console.log('✅ Connected to database');

        // Find all admin users
        const adminUsers = await AdminUser.find({}).select('email name status createdAt');
        
        console.log('\n📋 Admin Users in Database:');
        console.log('================================');
        
        if (adminUsers.length === 0) {
            console.log('❌ No admin users found');
        } else {
            adminUsers.forEach((admin, index) => {
                console.log(`${index + 1}. Email: ${admin.email}`);
                console.log(`   Name: ${admin.name}`);
                console.log(`   Status: ${admin.status}`);
                console.log(`   Created: ${admin.createdAt}`);
                console.log('   ---');
            });
        }
        
        console.log('\n💡 Default credentials to try:');
        console.log('   Email: admin@alertbot.com');
        console.log('   Password: Admin@123456');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Database connection closed');
    }
}

checkAdminUsers();