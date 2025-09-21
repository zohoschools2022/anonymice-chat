// Security and Rate Limiting System
const crypto = require('crypto');

// Rate limiting storage
const rateLimits = new Map(); // Map of IP -> { requests: number, resetTime: number }
const userLimits = new Map(); // Map of socketId -> { requests: number, resetTime: number }

// Security configuration
const SECURITY_CONFIG = {
    // Rate limiting
    MAX_REQUESTS_PER_MINUTE: 10,        // Max requests per IP per minute
    MAX_KNOCKS_PER_HOUR: 3,             // Max knocks per IP per hour
    MAX_MESSAGES_PER_MINUTE: 20,        // Max messages per user per minute
    
    // Bot pool limits
    MAX_ACTIVE_BOTS: 10,                // Maximum active bots at once
    BOT_COOLDOWN_MINUTES: 5,            // Cooldown before bot can be reused
    
    // Room limits
    MAX_ROOMS_PER_IP: 2,                // Max rooms per IP
    ROOM_CLEANUP_HOURS: 24,             // Auto-cleanup rooms after 24 hours
    
    // Message limits
    MAX_MESSAGE_LENGTH: 1000,           // Max message length
    MAX_MESSAGES_PER_ROOM: 1000,        // Max messages per room
    
    // Webhook security
    WEBHOOK_TIMEOUT_MS: 5000,           // Webhook timeout
    MAX_WEBHOOK_SIZE: 1024 * 10,        // Max webhook payload size (10KB)
};

// Check if IP is rate limited
function checkRateLimit(ip, type = 'general') {
    const now = Date.now();
    const key = `${ip}_${type}`;
    const limit = rateLimits.get(key);
    
    if (!limit || now > limit.resetTime) {
        // Reset or create new limit
        rateLimits.set(key, {
            requests: 1,
            resetTime: now + (60 * 1000) // 1 minute
        });
        return { allowed: true, remaining: SECURITY_CONFIG.MAX_REQUESTS_PER_MINUTE - 1 };
    }
    
    if (limit.requests >= SECURITY_CONFIG.MAX_REQUESTS_PER_MINUTE) {
        return { allowed: false, remaining: 0, resetTime: limit.resetTime };
    }
    
    limit.requests++;
    return { 
        allowed: true, 
        remaining: SECURITY_CONFIG.MAX_REQUESTS_PER_MINUTE - limit.requests 
    };
}

// Check if user is rate limited
function checkUserRateLimit(socketId, type = 'message') {
    const now = Date.now();
    const key = `${socketId}_${type}`;
    const limit = userLimits.get(key);
    
    let maxRequests;
    switch (type) {
        case 'knock':
            maxRequests = SECURITY_CONFIG.MAX_KNOCKS_PER_HOUR;
            break;
        case 'message':
            maxRequests = SECURITY_CONFIG.MAX_MESSAGES_PER_MINUTE;
            break;
        default:
            maxRequests = SECURITY_CONFIG.MAX_REQUESTS_PER_MINUTE;
    }
    
    if (!limit || now > limit.resetTime) {
        // Reset or create new limit
        const resetTime = type === 'knock' ? now + (60 * 60 * 1000) : now + (60 * 1000);
        userLimits.set(key, {
            requests: 1,
            resetTime: resetTime
        });
        return { allowed: true, remaining: maxRequests - 1 };
    }
    
    if (limit.requests >= maxRequests) {
        return { allowed: false, remaining: 0, resetTime: limit.resetTime };
    }
    
    limit.requests++;
    return { 
        allowed: true, 
        remaining: maxRequests - limit.requests 
    };
}

// Validate message content
function validateMessage(message) {
    if (!message || typeof message !== 'string') {
        return { valid: false, error: 'Invalid message format' };
    }
    
    if (message.length > SECURITY_CONFIG.MAX_MESSAGE_LENGTH) {
        return { valid: false, error: 'Message too long' };
    }
    
    // Check for suspicious patterns
    const suspiciousPatterns = [
        /<script/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /eval\s*\(/i,
        /document\./i,
        /window\./i
    ];
    
    for (const pattern of suspiciousPatterns) {
        if (pattern.test(message)) {
            return { valid: false, error: 'Message contains suspicious content' };
        }
    }
    
    return { valid: true };
}

// Validate room creation
function validateRoomCreation(ip, socketId) {
    // Check IP rate limit
    const ipLimit = checkRateLimit(ip, 'knock');
    if (!ipLimit.allowed) {
        return { 
            valid: false, 
            error: 'Too many requests from this IP. Please try again later.',
            resetTime: ipLimit.resetTime
        };
    }
    
    // Check user rate limit
    const userLimit = checkUserRateLimit(socketId, 'knock');
    if (!userLimit.allowed) {
        return { 
            valid: false, 
            error: 'Too many knocks. Please wait before trying again.',
            resetTime: userLimit.resetTime
        };
    }
    
    return { valid: true };
}

// Validate webhook request
function validateWebhookRequest(req) {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    
    if (contentLength > SECURITY_CONFIG.MAX_WEBHOOK_SIZE) {
        return { valid: false, error: 'Webhook payload too large' };
    }
    
    // Check for valid Telegram webhook structure
    if (!req.body || !req.body.message) {
        return { valid: false, error: 'Invalid webhook structure' };
    }
    
    const message = req.body.message;
    if (!message.text || typeof message.text !== 'string') {
        return { valid: false, error: 'Invalid message format' };
    }
    
    return { valid: true };
}

// Get client IP address
function getClientIP(req) {
    return req.headers['x-forwarded-for'] || 
           req.headers['x-real-ip'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           '127.0.0.1';
}

// Clean up old rate limit entries
function cleanupRateLimits() {
    const now = Date.now();
    
    for (const [key, limit] of rateLimits.entries()) {
        if (now > limit.resetTime) {
            rateLimits.delete(key);
        }
    }
    
    for (const [key, limit] of userLimits.entries()) {
        if (now > limit.resetTime) {
            userLimits.delete(key);
        }
    }
}

// Auto-cleanup every 5 minutes
setInterval(cleanupRateLimits, 5 * 60 * 1000);

module.exports = {
    SECURITY_CONFIG,
    checkRateLimit,
    checkUserRateLimit,
    validateMessage,
    validateRoomCreation,
    validateWebhookRequest,
    getClientIP,
    cleanupRateLimits
};
