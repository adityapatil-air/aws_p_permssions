# Multi-Bucket Member Support Fix

## Problem Description

The issue was that when a member (`test@example.com`) accepted an invitation to a second bucket, they were automatically removed from the first bucket. This happened because:

1. The `members` table had a `UNIQUE` constraint on the `email` field only
2. The invitation acceptance code used `INSERT OR REPLACE` which replaced the existing member record
3. A member could only exist once in the entire system, not per bucket

## Root Cause

```sql
-- OLD SCHEMA (PROBLEMATIC)
CREATE TABLE members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,  -- ❌ This prevents multiple bucket membership
    password TEXT,
    bucket_name TEXT,
    permissions TEXT,
    scope_type TEXT,
    scope_folders TEXT,
    invited_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Solution

### 1. Database Schema Fix

Updated the `members` table to use a composite unique constraint on `(email, bucket_name)`:

```sql
-- NEW SCHEMA (FIXED)
CREATE TABLE members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    password TEXT,
    bucket_name TEXT NOT NULL,
    permissions TEXT,
    scope_type TEXT,
    scope_folders TEXT,
    invited_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(email, bucket_name)  -- ✅ Allows same email in different buckets
);
```

### 2. Invitation Acceptance Logic Fix

Updated the invitation acceptance endpoint to:
- Check if member already exists for the specific bucket
- Update existing member if found, or insert new member if not found
- Avoid using `INSERT OR REPLACE` which was causing the deletion

```javascript
// OLD CODE (PROBLEMATIC)
db.run(
  'INSERT OR REPLACE INTO members (...) VALUES (...)',  // ❌ Replaces existing member
  [invite.email, password, invite.bucket_name, ...]
);

// NEW CODE (FIXED)
db.get('SELECT * FROM members WHERE email = ? AND bucket_name = ?', [invite.email, invite.bucket_name], (err, existingMember) => {
  if (existingMember) {
    // Update existing member for this bucket
    db.run('UPDATE members SET ... WHERE email = ? AND bucket_name = ?', [...]);
  } else {
    // Insert new member for this bucket
    db.run('INSERT INTO members (...) VALUES (...)', [...]);
  }
});
```

### 3. Login Logic Update

Updated both regular and Google login endpoints to return all buckets a member has access to:

```javascript
// OLD CODE (PROBLEMATIC)
db.get('SELECT * FROM members WHERE email = ?', [email], (err, member) => {
  // Returns only one bucket
  res.json({ member: { bucketName: member.bucket_name, ... } });
});

// NEW CODE (FIXED)
db.all('SELECT * FROM members WHERE email = ?', [email], (err, members) => {
  const buckets = members.map(member => ({
    bucketName: member.bucket_name,
    permissions: member.permissions,
    scopeType: member.scope_type,
    scopeFolders: member.scope_folders
  }));
  res.json({ email: email, buckets: buckets });
});
```

## Files Modified

1. **`fix_multi_bucket_members.js`** - Database schema migration script
2. **`server.js`** - Updated invitation acceptance and login logic
3. **`test_multi_bucket_fix.js`** - Test script to verify the fix

## How to Apply the Fix

1. **Run the database migration:**
   ```bash
   node fix_multi_bucket_members.js
   ```

2. **Restart the server** to use the updated code

3. **Test the fix:**
   ```bash
   node test_multi_bucket_fix.js
   ```

## Expected Behavior After Fix

1. **Member accepts first bucket invitation:**
   - Member gets added to `bucket1` with specific permissions
   - Member can access `bucket1` with assigned permissions

2. **Same member accepts second bucket invitation:**
   - Member gets added to `bucket2` with different permissions
   - Member still has access to `bucket1` (not removed)
   - Member can access both buckets with their respective permissions

3. **Member login:**
   - Returns list of all buckets the member has access to
   - Each bucket has its own permissions and scope settings

## API Changes

### New Endpoints Added:
- `GET /api/member/buckets?memberEmail=email` - Get all buckets for a member
- `GET /api/member/:email/bucket/:bucketName` - Get member's permissions for specific bucket

### Modified Endpoints:
- `POST /api/member/login` - Now returns `buckets` array instead of single `member` object
- `POST /api/member/google-login` - Now returns `buckets` array instead of single `member` object
- `POST /api/invite/:token/accept` - Now handles existing members properly

## Testing Scenarios

1. **Create two buckets with same owner**
2. **Invite same member to both buckets with different permissions**
3. **Member accepts first invitation** → Should be added to first bucket
4. **Member accepts second invitation** → Should be added to second bucket WITHOUT being removed from first
5. **Member logs in** → Should see both buckets in the response
6. **Member accesses each bucket** → Should have different permissions for each bucket

This fix ensures that members can belong to multiple buckets simultaneously, each with their own specific permissions and scope settings.