// Quick fix for timestamp handling in server.js
import fs from 'fs';

const serverPath = './server.js';
let content = fs.readFileSync(serverPath, 'utf8');

// Fix all instances of created_at.split(' ')[0]
content = content.replace(
  /created_at\.split\(' '\)\[0\]/g, 
  "created_at ? new Date(created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]"
);

fs.writeFileSync(serverPath, content);
console.log('✅ Fixed timestamp handling in server.js');