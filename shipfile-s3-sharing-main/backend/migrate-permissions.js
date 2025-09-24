// Migration script to convert old permission format to new simplified format
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import PermissionSystem from './permission-system.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new sqlite3.Database(join(__dirname, 'shipfile.db'));
const permissionSystem = new PermissionSystem();

console.log('🚀 Starting permission system migration...');

// Migration functions
const migratePermissions = () => {
  return new Promise((resolve, reject) => {
    // Get all members with their current permissions
    db.all('SELECT email, bucket_name, permissions FROM members', (err, members) => {
      if (err) {
        reject(err);
        return;
      }

      console.log(`📊 Found ${members.length} members to migrate`);

      let processed = 0;
      let migrated = 0;
      let errors = 0;

      if (members.length === 0) {
        console.log('✅ No members found - migration complete');
        resolve({ processed: 0, migrated: 0, errors: 0 });
        return;
      }

      members.forEach((member, index) => {
        try {
          const oldPermissions = JSON.parse(member.permissions);
          console.log(`\n👤 Processing ${member.email} (${member.bucket_name})`);
          console.log('   Old permissions:', oldPermissions);

          // Convert to new format
          const newPermissions = permissionSystem.convertFromOldFormat(oldPermissions);
          console.log('   New permissions:', newPermissions);

          // Convert back to old format for storage (backward compatibility)
          const correctedOldFormat = permissionSystem.convertToOldFormat(newPermissions);
          console.log('   Corrected old format:', correctedOldFormat);

          // Update the database
          db.run(
            'UPDATE members SET permissions = ? WHERE email = ? AND bucket_name = ?',
            [JSON.stringify(correctedOldFormat), member.email, member.bucket_name],
            function(updateErr) {
              processed++;
              
              if (updateErr) {
                console.error(`   ❌ Error updating ${member.email}:`, updateErr);
                errors++;
              } else {
                console.log(`   ✅ Successfully migrated ${member.email}`);
                migrated++;
              }

              // Check if all members are processed
              if (processed === members.length) {
                resolve({ processed, migrated, errors });
              }
            }
          );

        } catch (parseErr) {
          processed++;
          errors++;
          console.error(`   ❌ Error parsing permissions for ${member.email}:`, parseErr);
          
          // Check if all members are processed
          if (processed === members.length) {
            resolve({ processed, migrated, errors });
          }
        }
      });
    });
  });
};

// Validation function to check migration results
const validateMigration = () => {
  return new Promise((resolve, reject) => {
    db.all('SELECT email, bucket_name, permissions FROM members', (err, members) => {
      if (err) {
        reject(err);
        return;
      }

      console.log('\n🔍 Validating migration results...');
      
      let validCount = 0;
      let invalidCount = 0;
      const issues = [];

      members.forEach(member => {
        try {
          const permissions = JSON.parse(member.permissions);
          const newFormat = permissionSystem.convertFromOldFormat(permissions);
          const validated = permissionSystem.validateAndCorrect(newFormat);
          
          // Check if validation changed anything
          if (JSON.stringify(newFormat) !== JSON.stringify(validated)) {
            issues.push({
              email: member.email,
              bucket: member.bucket_name,
              issue: 'Permission dependencies were auto-corrected',
              before: newFormat,
              after: validated
            });
          }
          
          validCount++;
        } catch (error) {
          invalidCount++;
          issues.push({
            email: member.email,
            bucket: member.bucket_name,
            issue: 'Invalid permission format',
            error: error.message
          });
        }
      });

      resolve({ validCount, invalidCount, issues });
    });
  });
};

// Generate migration report
const generateReport = (migrationResult, validationResult) => {
  console.log('\n📋 MIGRATION REPORT');
  console.log('==================');
  console.log(`Total members processed: ${migrationResult.processed}`);
  console.log(`Successfully migrated: ${migrationResult.migrated}`);
  console.log(`Errors encountered: ${migrationResult.errors}`);
  console.log(`\nValidation results:`);
  console.log(`Valid permissions: ${validationResult.validCount}`);
  console.log(`Invalid permissions: ${validationResult.invalidCount}`);

  if (validationResult.issues.length > 0) {
    console.log('\n⚠️  Issues found:');
    validationResult.issues.forEach((issue, index) => {
      console.log(`${index + 1}. ${issue.email} (${issue.bucket}): ${issue.issue}`);
      if (issue.before && issue.after) {
        console.log(`   Before: ${JSON.stringify(issue.before)}`);
        console.log(`   After:  ${JSON.stringify(issue.after)}`);
      }
      if (issue.error) {
        console.log(`   Error: ${issue.error}`);
      }
    });
  }

  console.log('\n✅ Migration completed successfully!');
  console.log('\n📝 Next steps:');
  console.log('1. Test the new permission system with a few users');
  console.log('2. Update your frontend to use the new InviteMemberModal component');
  console.log('3. Replace old permission checking logic with the new PermissionSystem class');
  console.log('4. Add the delete folders functionality to your frontend');
};

// Example usage of the new permission system
const showExamples = () => {
  console.log('\n💡 NEW PERMISSION SYSTEM EXAMPLES');
  console.log('==================================');

  const examples = [
    {
      name: 'Viewer Only',
      permissions: permissionSystem.createPermission('view_all', 'none', ['download'])
    },
    {
      name: 'Own Files Manager',
      permissions: permissionSystem.createPermission('view_own', 'upload_manage_own', ['download', 'share'])
    },
    {
      name: 'Full Manager',
      permissions: permissionSystem.createPermission('view_all', 'upload_manage_all', ['download', 'share', 'create_folders', 'delete_folders'])
    },
    {
      name: 'Team Lead',
      permissions: permissionSystem.createPermission('view_all', 'upload_manage_all', ['download', 'share', 'create_folders', 'delete_folders', 'invite_members'])
    }
  ];

  examples.forEach(example => {
    console.log(`\n${example.name}:`);
    console.log(`  Structure: ${JSON.stringify(example.permissions)}`);
    console.log(`  Description: ${permissionSystem.getPermissionDescription(example.permissions)}`);
    console.log(`  Old format: ${JSON.stringify(permissionSystem.convertToOldFormat(example.permissions))}`);
  });
};

// Run migration
const runMigration = async () => {
  try {
    console.log('🔄 Step 1: Migrating permissions...');
    const migrationResult = await migratePermissions();
    
    console.log('\n🔄 Step 2: Validating migration...');
    const validationResult = await validateMigration();
    
    console.log('\n🔄 Step 3: Generating report...');
    generateReport(migrationResult, validationResult);
    
    console.log('\n🔄 Step 4: Showing examples...');
    showExamples();
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    db.close();
  }
};

// Run the migration
runMigration();