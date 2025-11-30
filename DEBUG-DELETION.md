# Debugging Telegram Message Deletion

## Current Flow

1. **User sends first message:**
   - `room.lastTelegramMessageId` = `null` (initialized on room creation)
   - `sendUserMessageNotification(name, roomId, text, messages, null)` called
   - No deletion (because `lastMessageId` is `null`)
   - Message sent → Get message ID (e.g., 100)
   - `room.lastTelegramMessageId` = 100 (updated in `.then()` callback)

2. **User sends second message:**
   - `room.lastTelegramMessageId` = 100 (from previous message)
   - `sendUserMessageNotification(name, roomId, text, messages, 100)` called
   - Should delete message 100
   - Message sent → Get message ID (e.g., 101)
   - `room.lastTelegramMessageId` = 101 (updated in `.then()` callback)

## Potential Issues

### Issue 1: Race Condition
If two messages arrive quickly, both might read `room.lastTelegramMessageId = 100` before either updates it. This could cause:
- Both try to delete message 100
- One might fail because message 100 is already deleted

**Fix:** We have `pendingRoomOperations` queue to prevent this.

### Issue 2: Message ID Not Updated
If `room.lastTelegramMessageId` is not updated correctly, the next message won't know which message to delete.

**Check:** Look for logs like:
- `📱 Stored new Telegram message ID X for Room Y`
- `⚠️ Room Y state changed during message send, not updating message ID`

### Issue 3: Deletion Not Called
If `lastMessageId` is `null` or `undefined`, deletion is skipped.

**Check:** Look for logs like:
- `ℹ️ [Room X] No previous message to delete (first message)`
- `🗑️ [Room X] Attempting to delete previous message Y...`

### Issue 4: Deletion Fails Silently
If deletion fails but we don't log it properly, we won't know.

**Check:** Look for logs like:
- `✅ [Room X] Successfully deleted message Y`
- `⚠️ [Room X] Could not delete message Y (may be too old or already deleted)`
- `❌ [DELETE] Failed to delete Telegram message Y`

## How to Debug

1. **Check Railway logs** for deletion-related messages
2. **Verify message IDs are being tracked:**
   - Look for `📝 [Room X] Tracking new message ID Y`
   - Look for `📱 Stored new Telegram message ID Y for Room X`
3. **Verify deletion is being attempted:**
   - Look for `🗑️ [Room X] Attempting to delete previous message Y...`
4. **Verify deletion succeeds:**
   - Look for `✅ [Room X] Successfully deleted message Y`
   - Or `⚠️ [Room X] Could not delete message Y`

## Test Steps

1. Start a conversation
2. Send first message → Should see "No previous message to delete"
3. Send second message → Should see "Attempting to delete previous message X"
4. Check Telegram → Previous message should be gone, only latest visible
5. Send third message → Should see "Attempting to delete previous message Y"
6. Check Telegram → Previous message should be gone, only latest visible

