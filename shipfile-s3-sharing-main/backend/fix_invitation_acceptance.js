import fs from 'fs';

// Read the server.js file
const serverPath = './server.js';
let content = fs.readFileSync(serverPath, 'utf8');

// Fix the invitation acceptance endpoint
const oldAcceptInviteCode = `// Accept invitation
app.post('/api/invite/:token/accept', async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  
  try {
    db.get('SELECT * FROM invitations WHERE id = ? AND accepted = 0', [token], (err, invite) => {
      if (err || !invite) {
        return res.status(404).json({ error: 'Invitation not found' });
      }
      
      if (new Date(invite.expires_at) < new Date()) {
        return res.status(410).json({ error: 'Invitation has expired' });
      }
      
      // Get who sent the invitation
      db.get('SELECT created_by FROM invitations WHERE id = ?', [token], (err, inviteData) => {
        const invitedBy = inviteData?.created_by || 'owner';
        
        // Check if member already exists for this bucket
        db.get('SELECT * FROM members WHERE email = ? AND bucket_name = ?', [invite.email, invite.bucket_name], (err, existingMember) => {
          if (err) {
            return res.status(500).json({ error: 'Database error checking existing member' });
          }
          
          if (existingMember) {
            // Update existing member's permissions
            db.run(
              'UPDATE members SET password = ?, permissions = ?, scope_type = ?, scope_folders = ?, invited_by = ? WHERE email = ? AND bucket_name = ?',
              [password, invite.permissions, invite.scope_type, invite.scope_folders, invitedBy, invite.email, invite.bucket_name],
              function(err) {
                if (err) {
                  return res.status(500).json({ error: 'Failed to update member account' });
                }
                
                db.run('UPDATE invitations SET accepted = 1 WHERE id = ?', [token], (err) => {
                  if (err) {
                    return res.status(500).json({ error: 'Failed to accept invitation' });
                  }
                  
                  res.json({ 
                    message: 'Account updated successfully',
                    bucketName: invite.bucket_name,
                    email: invite.email,
                    scopeType: invite.scope_type,
                    scopeFolders: invite.scope_folders
                  });
                });
              }
            );
          } else {
            // Insert new member for this bucket
            db.run(
              'INSERT INTO members (email, password, bucket_name, permissions, scope_type, scope_folders, invited_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [invite.email, password, invite.bucket_name, invite.permissions, invite.scope_type, invite.scope_folders, invitedBy],
              function(err) {
                if (err) {
                  return res.status(500).json({ error: 'Failed to create member account' });
                }
                
                db.run('UPDATE invitations SET accepted = 1 WHERE id = ?', [token], (err) => {
                  if (err) {
                    return res.status(500).json({ error: 'Failed to accept invitation' });
                  }
                  
                  res.json({ 
                    message: 'Account created successfully',
                    bucketName: invite.bucket_name,
                    email: invite.email,
                    scopeType: invite.scope_type,
                    scopeFolders: invite.scope_folders
                  });
                });
              }
            );
          }
        });
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});`;

const newAcceptInviteCode = `// Accept invitation
app.post('/api/invite/:token/accept', async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  
  console.log('=== INVITATION ACCEPTANCE DEBUG ===');
  console.log('Token:', token);
  console.log('Password provided:', !!password);
  
  try {
    db.get('SELECT * FROM invitations WHERE id = ? AND accepted = 0', [token], (err, invite) => {
      console.log('Database query error:', err);
      console.log('Invitation found:', !!invite);
      
      if (err) {
        console.error('Database error getting invitation:', err);
        return res.status(500).json({ error: 'Database error: ' + err.message });
      }
      
      if (!invite) {
        console.log('No invitation found for token:', token);
        return res.status(404).json({ error: 'Invitation not found or already accepted' });
      }
      
      console.log('Invitation details:', {
        email: invite.email,
        bucket_name: invite.bucket_name,
        expires_at: invite.expires_at,
        accepted: invite.accepted
      });
      
      if (new Date(invite.expires_at) < new Date()) {
        console.log('Invitation expired:', invite.expires_at);
        return res.status(410).json({ error: 'Invitation has expired' });
      }
      
      // Get who sent the invitation
      db.get('SELECT created_by FROM invitations WHERE id = ?', [token], (err, inviteData) => {
        if (err) {
          console.error('Error getting invitation creator:', err);
        }
        
        const invitedBy = inviteData?.created_by || 'owner';
        console.log('Invited by:', invitedBy);
        
        // Check if member already exists for this bucket
        db.get('SELECT * FROM members WHERE email = ? AND bucket_name = ?', [invite.email, invite.bucket_name], (err, existingMember) => {
          if (err) {
            console.error('Error checking existing member:', err);
            return res.status(500).json({ error: 'Database error checking existing member: ' + err.message });
          }
          
          console.log('Existing member found:', !!existingMember);
          
          if (existingMember) {
            console.log('Updating existing member permissions...');
            // Update existing member's permissions
            db.run(
              'UPDATE members SET password = ?, permissions = ?, scope_type = ?, scope_folders = ?, invited_by = ? WHERE email = ? AND bucket_name = ?',
              [password, invite.permissions, invite.scope_type, invite.scope_folders, invitedBy, invite.email, invite.bucket_name],
              function(err) {
                if (err) {
                  console.error('Error updating member:', err);
                  return res.status(500).json({ error: 'Failed to update member account: ' + err.message });
                }
                
                console.log('Member updated, marking invitation as accepted...');
                db.run('UPDATE invitations SET accepted = 1 WHERE id = ?', [token], (err) => {
                  if (err) {
                    console.error('Error marking invitation as accepted:', err);
                    return res.status(500).json({ error: 'Failed to accept invitation: ' + err.message });
                  }
                  
                  console.log('✅ Invitation accepted successfully - existing member updated');
                  res.json({ 
                    message: 'Account updated successfully',
                    bucketName: invite.bucket_name,
                    email: invite.email,
                    scopeType: invite.scope_type,
                    scopeFolders: invite.scope_folders
                  });
                });
              }
            );
          } else {
            console.log('Creating new member...');
            // Insert new member for this bucket
            db.run(
              'INSERT INTO members (email, password, bucket_name, permissions, scope_type, scope_folders, invited_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [invite.email, password, invite.bucket_name, invite.permissions, invite.scope_type, invite.scope_folders, invitedBy],
              function(err) {
                if (err) {
                  console.error('Error creating member:', err);
                  return res.status(500).json({ error: 'Failed to create member account: ' + err.message });
                }
                
                console.log('Member created, marking invitation as accepted...');
                db.run('UPDATE invitations SET accepted = 1 WHERE id = ?', [token], (err) => {
                  if (err) {
                    console.error('Error marking invitation as accepted:', err);
                    return res.status(500).json({ error: 'Failed to accept invitation: ' + err.message });
                  }
                  
                  console.log('✅ Invitation accepted successfully - new member created');
                  res.json({ 
                    message: 'Account created successfully',
                    bucketName: invite.bucket_name,
                    email: invite.email,
                    scopeType: invite.scope_type,
                    scopeFolders: invite.scope_folders
                  });
                });
              }
            );
          }
        });
      });
    });
  } catch (error) {
    console.error('Invitation acceptance error:', error);
    res.status(500).json({ error: 'Failed to accept invitation: ' + error.message });
  }
});`;

// Replace the code
content = content.replace(oldAcceptInviteCode, newAcceptInviteCode);

// Write the updated content back to the file
fs.writeFileSync(serverPath, content, 'utf8');

console.log('✅ Fixed invitation acceptance endpoint with detailed logging');