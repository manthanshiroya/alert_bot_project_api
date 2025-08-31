const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import models
const AdminUser = require('../src/models/AdminUser');
const { connectDB } = require('../src/config/database');

/**
 * Script to create an admin user
 * Usage: node scripts/createAdminUser.js [email] [password] [name] [role]
 */
async function createAdminUser() {
    try {
        // Connect to database
        await connectDB();
        console.log('✅ Connected to database');

        // Get command line arguments
        const args = process.argv.slice(2);
        
        // Default values
        const email = args[0] || 'admin@alertbot.com';
        const password = args[1] || 'Admin@123456';
        const name = args[2] || 'System Administrator';
        const role = args[3] || 'super_admin';

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            console.error('❌ Invalid email format');
            process.exit(1);
        }

        // Validate password strength
        if (password.length < 8) {
            console.error('❌ Password must be at least 8 characters long');
            process.exit(1);
        }

        // Check if admin user already exists
        const existingAdmin = await AdminUser.findOne({ email });
        if (existingAdmin) {
            console.log(`⚠️  Admin user with email ${email} already exists`);
            
            // Ask if user wants to update password
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            rl.question('Do you want to update the password? (y/N): ', async (answer) => {
                if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                    try {
                        const saltRounds = 12;
                        const hashedPassword = await bcrypt.hash(password, saltRounds);
                        
                        await AdminUser.findByIdAndUpdate(existingAdmin._id, {
                            password: hashedPassword,
                            passwordChangedAt: new Date(),
                            updatedAt: new Date()
                        });
                        
                        console.log('✅ Admin password updated successfully');
                        console.log(`📧 Email: ${email}`);
                        console.log(`🔑 New Password: ${password}`);
                    } catch (error) {
                        console.error('❌ Error updating password:', error.message);
                    }
                } else {
                    console.log('❌ Operation cancelled');
                }
                
                rl.close();
                process.exit(0);
            });
            
            return;
        }

        // Hash password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Define permissions based on role
        let permissions = [];
        switch (role) {
            case 'super_admin':
                permissions = [
                    'users.view', 'users.edit', 'users.delete',
                    'subscriptions.view', 'subscriptions.manage',
                    'payments.view', 'payments.approve', 'payments.reject',
                    'alerts.view', 'alerts.manage',
                    'analytics.view', 'analytics.export',
                    'settings.view', 'settings.edit',
                    'admins.view', 'admins.create', 'admins.edit', 'admins.delete'
                ];
                break;
            case 'admin':
                permissions = [
                    'users.view', 'users.edit',
                    'subscriptions.view', 'subscriptions.manage',
                    'payments.view', 'payments.approve', 'payments.reject',
                    'alerts.view', 'alerts.manage',
                    'analytics.view'
                ];
                break;
            case 'moderator':
                permissions = [
                    'users.view',
                    'subscriptions.view',
                    'payments.view',
                    'alerts.view',
                    'analytics.view'
                ];
                break;
            default:
                console.error('❌ Invalid role. Valid roles: super_admin, admin, moderator');
                process.exit(1);
        }

        // Create admin user
        const adminUser = new AdminUser({
            username: email.replace('@', '_').replace('.', '_'), // Use email as username with safe characters
            email,
            password: hashedPassword,
            profile: {
                firstName: name.split(' ')[0] || 'Admin',
                lastName: name.split(' ').slice(1).join(' ') || 'User'
            },
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await adminUser.save();

        console.log('\n🎉 Admin user created successfully!');
        console.log('=' .repeat(50));
        console.log(`👤 Name: ${name}`);
        console.log(`📧 Email: ${email}`);
        console.log(`🔑 Password: ${password}`);
        console.log(`👑 Role: ${role}`);
        console.log(`🔐 Permissions: ${permissions.length} permissions granted`);
        console.log('=' .repeat(50));
        console.log('\n📝 Important Notes:');
        console.log('1. Please change the default password after first login');
        console.log('2. Store these credentials securely');
        console.log('3. Access the admin panel at: http://localhost:3000/admin/login.html');
        console.log('\n⚠️  Security Reminder:');
        console.log('- Use a strong, unique password');
        console.log('- Enable two-factor authentication if available');
        console.log('- Regularly review admin access logs');
        
    } catch (error) {
        console.error('❌ Error creating admin user:', error.message);
        if (error.code === 11000) {
            console.error('💡 This email is already registered as an admin user');
        }
    } finally {
        // Close database connection
        await mongoose.connection.close();
        console.log('\n🔌 Database connection closed');
        process.exit(0);
    }
}

// Display usage information
function showUsage() {
    console.log('\n📖 Usage:');
    console.log('node scripts/createAdminUser.js [email] [password] [name] [role]');
    console.log('\n📋 Parameters:');
    console.log('  email    - Admin email address (default: admin@alertbot.com)');
    console.log('  password - Admin password (default: Admin@123456)');
    console.log('  name     - Admin full name (default: System Administrator)');
    console.log('  role     - Admin role: super_admin, admin, moderator (default: super_admin)');
    console.log('\n💡 Examples:');
    console.log('  node scripts/createAdminUser.js');
    console.log('  node scripts/createAdminUser.js admin@company.com');
    console.log('  node scripts/createAdminUser.js admin@company.com MySecurePass123');
    console.log('  node scripts/createAdminUser.js admin@company.com MySecurePass123 "John Doe" admin');
    console.log('');
}

// Check if help is requested
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showUsage();
    process.exit(0);
}

// Run the script
console.log('🚀 Creating admin user...');
createAdminUser();