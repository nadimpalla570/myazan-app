import { db } from './firebase';
import { query, collection, where, getDocs, setDoc, doc, updateDoc, serverTimestamp, writeBatch } from 'firebase/firestore';

/**
 * Channel naming convention: myazan_<senderId>
 * This ensures deterministic, collision-free channel names.
 */
export class ChannelManager {
  private static readonly CHANNEL_PREFIX = 'myazan_';
  private static readonly SESSION_TIMEOUT_MINUTES = 60;

  /**
   * Generate a deterministic channel name based on sender ID.
   */
  static generateChannelName(senderId: string): string {
    return `${this.CHANNEL_PREFIX}${senderId}`;
  }

  /**
   * Extract sender ID from channel name.
   */
  static extractSenderId(channelName: string): string | null {
    if (channelName.startsWith(this.CHANNEL_PREFIX)) {
      return channelName.substring(this.CHANNEL_PREFIX.length);
    }
    return null;
  }

  /**
   * Check if an active session already exists for the given channel.
   * Prevents channel collisions by ensuring only one active session per senderId.
   */
  static async checkActiveSession(channelName: string): Promise<boolean> {
    try {
      const q = query(
        collection(db, 'announcements'),
        where('channelName', '==', channelName),
        where('isLive', '==', true)
      );
      const snapshot = await getDocs(q);
      return !snapshot.empty;
    } catch (error) {
      console.error('Error checking active session:', error);
      return false;
    }
  }

  /**
   * Create a new announcement/session.
   * Enforces atomicity by checking for collisions before creation.
   */
  static async startSession(
    sessionId: string,
    senderId: string,
    channelName: string,
    agoraToken: string,
    expiresAt?: Date
  ): Promise<boolean> {
    try {
      // Check for existing active session
      const activeExists = await this.checkActiveSession(channelName);
      if (activeExists) {
        console.warn(`Active session already exists for channel: ${channelName}`);
        return false;
      }

      // Create new announcement
      await setDoc(doc(db, 'announcements', sessionId), {
        sessionId,
        senderId,
        channelName,
        agoraToken,
        startedAt: serverTimestamp(),
        isLive: true,
        expiresAt: expiresAt || null,
      });

      return true;
    } catch (error) {
      console.error('Error starting session:', error);
      return false;
    }
  }

  /**
   * End an active session.
   */
  static async endSession(sessionId: string): Promise<boolean> {
    try {
      await updateDoc(doc(db, 'announcements', sessionId), {
        isLive: false,
      });
      return true;
    } catch (error) {
      console.error('Error ending session:', error);
      return false;
    }
  }

  /**
   * Cleanup old stale sessions (older than SESSION_TIMEOUT_MINUTES and still marked live).
   * Useful after app crash or network failure.
   */
  static async cleanupStaleSessions(): Promise<void> {
    try {
      const cutoffTime = new Date(Date.now() - this.SESSION_TIMEOUT_MINUTES * 60 * 1000);
      const q = query(
        collection(db, 'announcements'),
        where('isLive', '==', true)
      );
      const snapshot = await getDocs(q);

      const batch = writeBatch(db);
      snapshot.docs.forEach((docSnapshot: any) => {
        const data = docSnapshot.data();
        if (data.startedAt && data.startedAt.toDate() < cutoffTime) {
          batch.update(docSnapshot.ref, { isLive: false });
        }
      });

      await batch.commit();
    } catch (error) {
      console.error('Error cleaning up stale sessions:', error);
    }
  }
}
