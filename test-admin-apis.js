const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000/api';

// Test admin APIs
async function testAdminAPIs() {
  try {
    console.log('🧪 Testing Admin APIs...');
    
    // 1. Test admin login
    console.log('\n1. Testing admin login...');
    const loginResponse = await axios.post(`${BASE_URL}/admin/login`, {
      email: 'admin@admin.com',
      password: 'Fnw00t##'
    });
    
    if (loginResponse.data.success) {
      console.log('✅ Admin login successful');
      const token = loginResponse.data.token;
      
      // Set authorization header for subsequent requests
      const authHeaders = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      
      // 2. Test dashboard API
      console.log('\n2. Testing dashboard API...');
      const dashboardResponse = await axios.get(`${BASE_URL}/admin/dashboard`, {
        headers: authHeaders
      });
      console.log('✅ Dashboard API working:', dashboardResponse.data.status);
      
      // 3. Test users API
      console.log('\n3. Testing users API...');
      const usersResponse = await axios.get(`${BASE_URL}/admin/users`, {
        headers: authHeaders
      });
      console.log('✅ Users API working:', usersResponse.data.status);
      
      // 4. Test subscription plans API
      console.log('\n4. Testing subscription plans API...');
      const plansResponse = await axios.get(`${BASE_URL}/admin/subscription-plans`, {
        headers: authHeaders
      });
      console.log('✅ Subscription plans API working:', plansResponse.data.status);
      
      // 5. Test UPI config API
      console.log('\n5. Testing UPI config API...');
      const upiResponse = await axios.get(`${BASE_URL}/admin/upi/config`, {
        headers: authHeaders
      });
      console.log('✅ UPI config API working:', upiResponse.data.status);
      
      // 6. Test pending payments API
      console.log('\n6. Testing pending payments API...');
      const paymentsResponse = await axios.get(`${BASE_URL}/admin/payments/pending`, {
        headers: authHeaders
      });
      console.log('✅ Pending payments API working:', paymentsResponse.data.status);
      
      // 7. Test system stats API
      console.log('\n7. Testing system stats API...');
      const statsResponse = await axios.get(`${BASE_URL}/admin/stats/system`, {
        headers: authHeaders
      });
      console.log('✅ System stats API working:', statsResponse.data.status);
      
      console.log('\n🎉 All admin APIs are working correctly!');
      
    } else {
      console.log('❌ Admin login failed:', loginResponse.data.message);
    }
    
  } catch (error) {
    console.error('❌ Error testing admin APIs:', error.response?.data || error.message);
  }
}

// Run the test
testAdminAPIs();