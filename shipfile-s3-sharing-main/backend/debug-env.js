import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('Environment Debug:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('DATABASE_URL (masked):', process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:]*@/, ':****@') : 'NOT SET');
console.log('SMTP_PASS exists:', !!process.env.SMTP_PASS);
console.log('SMTP_PASS value:', process.env.SMTP_PASS || 'NOT SET');

// Check if .env file exists
import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env');
console.log('.env file exists:', fs.existsSync(envPath));

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  console.log('.env file first few lines:');
  console.log(envContent.split('\n').slice(0, 5).join('\n'));
}