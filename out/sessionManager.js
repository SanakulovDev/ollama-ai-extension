"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionManager = void 0;
const crypto = __importStar(require("crypto"));
const STORAGE_KEY = 'ollamaAI.chatSessions';
const ACTIVE_SESSION_KEY = 'ollamaAI.activeSessionId';
class SessionManager {
    constructor(context) {
        this.context = context;
    }
    /**
     * Create a new empty session
     */
    createSession() {
        const now = Date.now();
        return {
            id: crypto.randomUUID(),
            name: this._generateDefaultName(now),
            messages: [],
            createdAt: now,
            lastModifiedAt: now
        };
    }
    /**
     * Get a single session by ID
     */
    getSession(id) {
        try {
            const sessions = this._loadAllSessions();
            return sessions[id] || null;
        }
        catch (err) {
            console.error('Failed to get session:', err);
            return null;
        }
    }
    /**
     * Get all session metadata for dropdown list
     */
    getAllSessions() {
        try {
            const sessions = this._loadAllSessions();
            return Object.values(sessions).map(s => ({
                id: s.id,
                name: s.name,
                messageCount: s.messages.length,
                lastModifiedAt: s.lastModifiedAt
            }));
        }
        catch (err) {
            console.error('Failed to get all sessions:', err);
            return [];
        }
    }
    /**
     * Save or update a session
     */
    async saveSession(session) {
        try {
            const sessions = this._loadAllSessions();
            sessions[session.id] = session;
            await this.context.globalState.update(STORAGE_KEY, sessions);
        }
        catch (err) {
            console.error('Failed to save session:', err);
            throw err;
        }
    }
    /**
     * Delete a session by ID
     */
    async deleteSession(id) {
        try {
            const sessions = this._loadAllSessions();
            delete sessions[id];
            await this.context.globalState.update(STORAGE_KEY, sessions);
        }
        catch (err) {
            console.error('Failed to delete session:', err);
            throw err;
        }
    }
    /**
     * Get the active session ID
     */
    getActiveSessionId() {
        try {
            const id = this.context.globalState.get(ACTIVE_SESSION_KEY);
            return id || null;
        }
        catch (err) {
            console.error('Failed to get active session ID:', err);
            return null;
        }
    }
    /**
     * Set the active session ID
     */
    async setActiveSessionId(id) {
        try {
            await this.context.globalState.update(ACTIVE_SESSION_KEY, id);
        }
        catch (err) {
            console.error('Failed to set active session ID:', err);
            throw err;
        }
    }
    /**
     * Generate a session name from messages
     */
    generateSessionName(messages) {
        // Find first user message
        const firstUserMsg = messages.find(m => m.role === 'user');
        if (!firstUserMsg) {
            return this._generateDefaultName(Date.now());
        }
        // Extract text after "**Question:**" marker if present
        const content = firstUserMsg.content;
        const match = content.match(/\*\*Question:\*\*\s*(.+?)(?:\n|$)/s);
        const text = match ? match[1].trim() : content.trim();
        // Remove markdown and code blocks
        const cleaned = text
            .replace(/```[\s\S]*?```/g, '') // Remove code blocks
            .replace(/`[^`]+`/g, '') // Remove inline code
            .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
            .replace(/\n/g, ' ') // Replace newlines with space
            .trim();
        // Truncate to 40 chars
        if (cleaned.length > 40) {
            return cleaned.substring(0, 37) + '...';
        }
        return cleaned || this._generateDefaultName(Date.now());
    }
    /**
     * Load all sessions from storage
     */
    _loadAllSessions() {
        try {
            const sessions = this.context.globalState.get(STORAGE_KEY, {});
            return sessions;
        }
        catch (err) {
            console.error('Failed to load sessions from storage:', err);
            return {};
        }
    }
    /**
     * Generate default session name with timestamp
     */
    _generateDefaultName(timestamp) {
        const date = new Date(timestamp);
        const month = date.toLocaleString('en', { month: 'short' });
        const day = date.getDate();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `Chat ${month} ${day}, ${hours}:${minutes}`;
    }
}
exports.SessionManager = SessionManager;
