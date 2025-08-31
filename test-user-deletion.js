const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

const BASE_URL = 'http://localhost:3000';

// Test admin credentials
const ADMIN_CREDENTIALS = {
    email: 'admin@tradingalerts.com',
    password: 'Admin@123456'
};

async function testUserDeletion() {
  try {
    console.log('🔐 Logging in as admin...');
    
    // Login as admin
    const loginResponse = await axios.post(`${BASE_URL}/api/admin/auth/login`, ADMIN_CREDENTIALS);
    const adminToken = loginResponse.data.token;
    
    console.log('✅ Admin login successful');
    
    // Set up headers with admin token
    const headers = {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    };
    
    console.log('\n📋 Getting current user list...');
    
    // Get current users
    const usersResponse = await axios.get(`${BASE_URL}/api/admin/users?page=1&limit=10`, { headers });
    const users = usersResponse.data.data.users;
    
    console.log(`Found ${users.length} users:`);
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email} (ID: ${user._id}, isActive: ${user.isActive})`);
    });
    
    if (users.length === 0) {
      console.log('❌ No users found to test deletion');
      return;
    }
    
    // Find a user to delete (preferably not the admin)
    const userToDelete = users.find(user => user.email !== ADMIN_CREDENTIALS.email) || users[0];
    
    console.log(`\n🗑️ Attempting to delete user: ${userToDelete.email} (ID: ${userToDelete._id})`);
    
    // Delete the user
    const deleteResponse = await axios.delete(`${BASE_URL}/api/admin/users/${userToDelete._id}`, { headers });
    
    console.log('✅ Delete response:', deleteResponse.data);
    
    console.log('\n📋 Getting updated user list...');
    
    // Get updated user list
    const updatedUsersResponse = await axios.get(`${BASE_URL}/api/admin/users?page=1&limit=10`, { headers });
    const updatedUsers = updatedUsersResponse.data.data.users;
    
    console.log(`Found ${updatedUsers.length} users after deletion:`);
    updatedUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email} (ID: ${user._id}, isActive: ${user.isActive})`);
    });
    
    // Check if the deleted user is still in the list
    const deletedUserStillExists = updatedUsers.find(user => user._id === userToDelete._id);
    
    if (deletedUserStillExists) {
      console.log('❌ ISSUE CONFIRMED: Deleted user still appears in the list!');
      console.log('Deleted user details:', deletedUserStillExists);
    } else {
      console.log('✅ SUCCESS: Deleted user no longer appears in the list');
    }
    
    console.log('\n🔍 Checking if deleted user can be found with status filter...');
    
    // Check if we can find deleted users with status filter
    const deletedUsersResponse = await axios.get(`${BASE_URL}/api/admin/users?status=deleted`, { headers });
    const deletedUsers = deletedUsersResponse.data.data.users;
    
    console.log(`Found ${deletedUsers.length} deleted users:`);
    deletedUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email} (ID: ${user._id}, isActive: ${user.isActive})`);
    });
    
    const ourDeletedUser = deletedUsers.find(user => user._id === userToDelete._id);
    if (ourDeletedUser) {
      console.log('✅ Deleted user found in deleted status filter - soft delete working correctly');
    } else {
      console.log('❌ Deleted user not found even in deleted status filter');
    }
    
  } catch (error) {
    console.error('❌ Error during test:', error.response?.data || error.message);
  }
}

// Run the test
testUserDeletion();