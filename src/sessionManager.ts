import * as vscode from 'vscode';
import { OllamaMessage } from './ollamaClient';
import * as crypto from 'crypto';

export interface ChatSession {
  id: string;
  name: string;
  messages: OllamaMessage[];
  createdAt: number;
  lastModifiedAt: number;
}

export interface SessionMetadata {
  id: string;
  name: string;
  messageCount: number;
  lastModifiedAt: number;
}

const STORAGE_KEY = 'ollamaAI.chatSessions';
const ACTIVE_SESSION_KEY = 'ollamaAI.activeSessionId';

export class SessionManager {
  constructor(private context: vscode.ExtensionContext) {}

  /**
   * Create a new empty session
   */
  createSession(): ChatSession {
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
  getSession(id: string): ChatSession | null {
    try {
      const sessions = this._loadAllSessions();
      const session = sessions[id];
      return session ? { ...session, name: this._normalizeSessionName(session) } : null;
    } catch (err) {
      console.error('Failed to get session:', err);
      return null;
    }
  }

  /**
   * Get all session metadata for dropdown list
   */
  getAllSessions(): SessionMetadata[] {
    try {
      const sessions = this._loadAllSessions();
      return Object.values(sessions).map(s => ({
        id: s.id,
        name: this._normalizeSessionName(s),
        messageCount: s.messages.length,
        lastModifiedAt: s.lastModifiedAt
      }));
    } catch (err) {
      console.error('Failed to get all sessions:', err);
      return [];
    }
  }

  /**
   * Save or update a session
   */
  async saveSession(session: ChatSession): Promise<void> {
    try {
      const sessions = this._loadAllSessions();
      sessions[session.id] = session;
      await this.context.globalState.update(STORAGE_KEY, sessions);
    } catch (err) {
      console.error('Failed to save session:', err);
      throw err;
    }
  }

  /**
   * Delete a session by ID
   */
  async deleteSession(id: string): Promise<void> {
    try {
      const sessions = this._loadAllSessions();
      delete sessions[id];
      await this.context.globalState.update(STORAGE_KEY, sessions);
    } catch (err) {
      console.error('Failed to delete session:', err);
      throw err;
    }
  }

  /**
   * Get the active session ID
   */
  getActiveSessionId(): string | null {
    try {
      const id = this.context.globalState.get<string>(ACTIVE_SESSION_KEY);
      return id || null;
    } catch (err) {
      console.error('Failed to get active session ID:', err);
      return null;
    }
  }

  /**
   * Set the active session ID
   */
  async setActiveSessionId(id: string): Promise<void> {
    try {
      await this.context.globalState.update(ACTIVE_SESSION_KEY, id);
    } catch (err) {
      console.error('Failed to set active session ID:', err);
      throw err;
    }
  }

  /**
   * Generate a session name from messages
   */
  generateSessionName(messages: OllamaMessage[]): string {
    // Find first user message
    const firstUserMsg = messages.find(m => m.role === 'user');
    if (!firstUserMsg) {
      return this._generateDefaultName(Date.now());
    }

    // Extract text after the question marker if present
    const content = firstUserMsg.content;
    const match = content.match(/\*\*(?:Question|Savol):\*\*\s*(.+?)(?:\n|$)/s);
    const text = match ? match[1].trim() : content.trim();

    // Remove markdown and code blocks
    const cleaned = text
      .replace(/```[\s\S]*?```/g, '')  // Remove code blocks
      .replace(/`[^`]+`/g, '')          // Remove inline code
      .replace(/\*\*(.+?)\*\*/g, '$1')  // Remove bold
      .replace(/\n/g, ' ')              // Replace newlines with space
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
  private _loadAllSessions(): Record<string, ChatSession> {
    try {
      const sessions = this.context.globalState.get<Record<string, ChatSession>>(STORAGE_KEY, {});
      return sessions;
    } catch (err) {
      console.error('Failed to load sessions from storage:', err);
      return {};
    }
  }

  /**
   * Generate default session name with timestamp
   */
  private _generateDefaultName(timestamp: number): string {
    const date = new Date(timestamp);
    const month = date.toLocaleString('en-US', { month: 'short' });
    const day = date.getDate();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `Chat ${month} ${day}, ${hours}:${minutes}`;
  }

  private _normalizeSessionName(session: ChatSession): string {
    if (session.name.startsWith('Chat ') || session.name.startsWith('Suhbat ')) {
      return this._generateDefaultName(session.createdAt);
    }

    return session.name;
  }
}
