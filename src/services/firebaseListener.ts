import { onSnapshot, collection, query, where } from 'firebase/firestore';
import { db } from './firebase';

export interface AnnouncementData {
  sessionId: string;
  senderId: string;
  channelName: string;
  agoraToken: string;
  startedAt: Date;
  isLive: boolean;
  expiresAt?: Date;
}

interface ListenerCallbacks {
  onNewAnnouncement?: (announcement: AnnouncementData) => void;
  onAnnouncementEnded?: (sessionId: string, channelName: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Listen to announcements collection with real-time updates.
 * Automatically handles:
 * - New announcements (isLive: true)
 * - Ended announcements (isLive: false)
 * - Receiver auto-join logic
 */
export class FirebaseListenerService {
  private unsubscribe: any = null;
  private activeChannels: Set<string> = new Set();

  /**
   * Start listening to live announcements.
   * For receivers, filter announcements based on user's mappings.
   * @param callbacks Callbacks for new, ended, and error events
   * @param userRole 'sender' or 'receiver'
   * @param userId Current user's UID
   * @param receivesFromSenderIds Optional: List of sender IDs this receiver listens to
   */
  startListening(
    callbacks: ListenerCallbacks,
    userRole: 'sender' | 'receiver' = 'receiver',
    userId?: string,
    receivesFromSenderIds?: string[]
  ): void {
    if (this.unsubscribe) {
      console.warn('Listener already active. Call stopListening() first.');
      return;
    }

    try {
      // Query live announcements
      const q = query(collection(db, 'announcements'), where('isLive', '==', true));

      this.unsubscribe = onSnapshot(
        q,
        (snapshot: any) => {
          snapshot.docChanges().forEach((change: any) => {
            const data = change.doc.data() as AnnouncementData;
            const docId = change.doc.id;

            if (change.type === 'added' || change.type === 'modified') {
              // Check if receiver should listen to this sender
              if (
                userRole === 'receiver' &&
                receivesFromSenderIds &&
                !receivesFromSenderIds.includes(data.senderId)
              ) {
                return; // Skip if not in receiver's mapping
              }

              if (data.isLive) {
                // New or still-live announcement
                if (!this.activeChannels.has(data.channelName)) {
                  this.activeChannels.add(data.channelName);
                  callbacks.onNewAnnouncement?.(data);
                }
              }
            }

            if (change.type === 'removed' || (change.type === 'modified' && !data.isLive)) {
              // Announcement ended or was deleted
              if (this.activeChannels.has(data.channelName)) {
                this.activeChannels.delete(data.channelName);
                callbacks.onAnnouncementEnded?.(docId, data.channelName);
              }
            }
          });
        },
        (error: any) => {
          console.error('Firestore listener error:', error);
          callbacks.onError?.(error);
        }
      );
    } catch (error) {
      console.error('Error setting up Firestore listener:', error);
      callbacks.onError?.(error as Error);
    }
  }

  /**
   * Stop listening to announcements.
   */
  stopListening(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
      this.activeChannels.clear();
    }
  }

  /**
   * Get currently active channels.
   */
  getActiveChannels(): string[] {
    return Array.from(this.activeChannels);
  }

  /**
   * Check if a specific channel is currently active.
   */
  isChannelActive(channelName: string): boolean {
    return this.activeChannels.has(channelName);
  }
}

export const firebaseListenerService = new FirebaseListenerService();
