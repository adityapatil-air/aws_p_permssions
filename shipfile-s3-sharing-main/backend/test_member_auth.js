import fetch from 'node-fetch';

const API_BASE_URL = 'http://localhost:3001';

// Test with a known member email
const testEmail = 'iamadityapatil7@gmail.com';

console.log(`🧪 Testing member authentication for: ${testEmail}`);

const testMemberAuth = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/google-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        email: testEmail,
        name: 'Test Member'
      })
    });

    const data = await response.json();

    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log('✅ Authentication successful!');
      console.log(`Found ${data.buckets?.length || 0} buckets for this member`);
    } else {
      console.log('❌ Authentication failed:', data.error);
    }

  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }
};

testMemberAuth();