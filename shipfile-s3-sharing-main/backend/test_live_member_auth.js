// Test the live Railway backend
const API_BASE_URL = 'https://awsppermssions-production.up.railway.app';

// Test with a known member email
const testEmail = 'iamadityapatil7@gmail.com';

console.log(`🧪 Testing LIVE member authentication for: ${testEmail}`);
console.log(`🌐 Backend URL: ${API_BASE_URL}`);

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
      if (data.buckets) {
        data.buckets.forEach((bucket, index) => {
          console.log(`  ${index + 1}. ${bucket.bucketName} (${bucket.scopeType || 'entire'})`);
        });
      }
    } else {
      console.log('❌ Authentication failed:', data.error);
    }

  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }
};

// Test health endpoint first
const testHealth = async () => {
  try {
    console.log('🏥 Testing backend health...');
    const response = await fetch(`${API_BASE_URL}/health`);
    const data = await response.json();
    console.log('Health check:', response.status, data.message);
    
    if (response.ok) {
      console.log('✅ Backend is healthy, testing member auth...\n');
      await testMemberAuth();
    }
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
  }
};

testHealth();