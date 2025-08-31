const axios = require('axios');

async function testAdminLogin() {
    try {
        const response = await axios.post('http://localhost:3000/api/admin/auth/login', {
            email: 'admin@tradingalerts.com',
            password: 'Admin@123456'
        });
        
        console.log('✅ Login successful!');
        console.log('Response:', JSON.stringify(response.data, null, 2));
        
    } catch (error) {
        console.log('❌ Login failed');
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Response:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.log('Error:', error.message);
        }
    }
}

testAdminLogin();