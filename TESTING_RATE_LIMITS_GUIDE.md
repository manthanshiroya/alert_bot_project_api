# Testing Rate Limits Solution Guide

## Problem
You were experiencing "too many login attempts" errors while testing multiple user accounts, which was blocking your ability to test all features properly.

## Root Cause
The application has multiple rate limiting layers:
1. **General API Rate Limit**: 100 requests per 15 minutes (in server.js)
2. **Auth Endpoints Rate Limit**: 5 requests per 15 minutes (in auth.js)
3. **Login Endpoints Rate Limit**: 10 requests per 15 minutes (in auth.js)
4. **Account Lockout**: Users/admins get locked after 5 failed login attempts for 2 hours

## Solution Applied

### ✅ Rate Limits Increased for Testing
The following changes have been made to allow extensive testing:

| Endpoint Type | Original Limit | Testing Limit | Change |
|---------------|----------------|---------------|--------|
| General API | 100/15min | 1000/15min | 10x increase |
| Auth Endpoints | 5/15min | 100/15min | 20x increase |
| Login Endpoints | 10/15min | 200/15min | 20x increase |

### ✅ Account Locks Cleared
All existing account locks have been cleared, and no accounts are currently locked.

### ✅ Backup Files Created
Original configuration files have been backed up:
- `src/routes/auth.js.backup`
- `src/server.js.backup`

## Files Modified

### 1. `src/routes/auth.js`
- Increased `authLimiter` from 5 to 100 requests per 15 minutes
- Increased `loginLimiter` from 10 to 200 requests per 15 minutes
- Added testing comments for clarity

### 2. `src/server.js`
- Increased general API `limiter` from 100 to 1000 requests per 15 minutes
- Added testing comments for clarity

## Testing Instructions

### 1. Restart Your Server
```bash
# Stop your current server (Ctrl+C)
# Then restart it
node src/server.js
# or
npm start
```

### 2. Test Multiple Accounts
You can now:
- Create multiple test accounts without hitting rate limits
- Test login/logout flows extensively
- Test failed login scenarios
- Test all features across different user accounts

### 3. Monitor Rate Limit Headers
Check the response headers to see your current usage:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642248000
```

## Utility Scripts Created

### 1. `unlock-test-accounts.js`
- Unlocks any accounts that get locked during testing
- Shows status of all locked accounts
- Run with: `node unlock-test-accounts.js`

### 2. `restore-rate-limits.js`
- Restores original production rate limits
- Cleans up testing files
- Run with: `node restore-rate-limits.js`

### 3. `testing-rate-limits.js`
- Contains the testing rate limit configurations
- Reference file for manual implementation

## After Testing - IMPORTANT!

### ⚠️ Restore Production Settings
When you're done testing, **MUST** restore the original rate limits:

```bash
node restore-rate-limits.js
```

This will:
- Restore original `auth.js` and `server.js` files
- Delete backup files
- Clean up testing scripts
- Self-delete the restore script

### ⚠️ Restart Server
After restoring, restart your server to apply the original rate limits.

## Production Rate Limits (Original)
- **General API**: 100 requests per 15 minutes
- **Auth Endpoints**: 5 requests per 15 minutes  
- **Login Endpoints**: 10 requests per 15 minutes
- **Account Lockout**: 5 failed attempts = 2 hour lock

## Testing Tips

### 1. Use Different IP Addresses (Optional)
If you still hit limits, you can:
- Use different browsers
- Use incognito/private browsing
- Use different devices
- Use VPN to change IP

### 2. Clear Browser Data
Clear cookies and local storage between tests to ensure clean sessions.

### 3. Monitor Logs
Watch server logs for any rate limiting messages:
```bash
tail -f logs/combined.log
```

### 4. Test Account Lockout
To test the account lockout feature:
1. Try 5 wrong passwords on the same account
2. Verify the account gets locked
3. Run `node unlock-test-accounts.js` to unlock

## Troubleshooting

### Still Getting Rate Limited?
1. Check if server was restarted after changes
2. Verify the modified files are being used
3. Check browser cache/cookies
4. Run the unlock script again

### Need to Restore Immediately?
```bash
node restore-rate-limits.js
```

### Lost Backup Files?
The original rate limits are documented in this guide and can be manually restored.

## Security Note

⚠️ **These testing configurations should NEVER be used in production!**

The increased rate limits are only for development/testing purposes. Always restore the original limits before deploying to production.

---

**Happy Testing! 🚀**

You can now test all your features without being blocked by rate limits. Remember to restore the original settings when done!