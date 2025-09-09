import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config();

console.log('=== INVITATION DEBUG TEST ===');
console.log('Environment Variables:');
console.log('SMTP_HOST:', process.env.SMTP_HOST);
console.log('SMTP_PORT:', process.env.SMTP_PORT);
console.log('SMTP_USER:', process.env.SMTP_USER);
console.log('SMTP_PASS:', process.env.SMTP_PASS ? 'SET' : 'NOT SET');
console.log('FRONTEND_URL:', process.env.FRONTEND_URL);

// Test email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

console.log('\n=== TESTING EMAIL CONFIGURATION ===');

async function testEmail() {
  try {
    // Verify transporter
    console.log('Verifying transporter...');
    await transporter.verify();
    console.log('✅ Transporter verification successful');
    
    // Send test email
    console.log('Sending test email...');
    const result = await transporter.sendMail({
      from: '"ShipFile Test" <noreply@example.com>',
      to: 'test@example.com',
      subject: 'ShipFile Email Test',
      html: '<h2>Email configuration test successful!</h2><p>Your SMTP settings are working correctly.</p>'
    });
    
    console.log('✅ Test email sent successfully');
    console.log('Message ID:', result.messageId);
    console.log('Response:', result.response);
    
  } catch (error) {
    console.error('❌ Email test failed:');
    console.error('Error:', error.message);
    console.error('Code:', error.code);
    console.error('Command:', error.command);
    
    if (error.code === 'EAUTH') {
      console.log('\n🔧 SOLUTION: Check your SMTP credentials');
      console.log('- Verify SMTP_USER and SMTP_PASS are correct');
      console.log('- For Mailtrap, use the credentials from your inbox settings');
    } else if (error.code === 'ECONNECTION') {
      console.log('\n🔧 SOLUTION: Check your SMTP host and port');
      console.log('- Verify SMTP_HOST and SMTP_PORT are correct');
      console.log('- Check your internet connection');
    }
  }
}

testEmail();