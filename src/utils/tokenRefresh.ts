import RtcEngine from 'react-native-agora';
import { generateAgoraToken } from '../services/api';

/**
 * Handles Agora token refresh when token privilege is about to expire.
 * Agora SDK emits `TokenPrivilegeWillExpire` event; this handler requests a new token.
 */
export class TokenRefreshManager {
  private engine: any = null;
  private channelName: string = '';
  private uid: number = 0;
  private role: 'publisher' | 'audience' = 'audience';

  /**
   * Initialize the token refresh manager with the Agora engine.
   */
  initialize(engine: any, channelName: string, uid: number, role: 'publisher' | 'audience'): void {
    this.engine = engine;
    this.channelName = channelName;
    this.uid = uid;
    this.role = role;

    // Listen for token expiration event
    if (this.engine) {
      this.engine.addListener('TokenPrivilegeWillExpire', this.onTokenWillExpire.bind(this));
    }
  }

  /**
   * Called when token is about to expire.
   * Requests a new token from the backend and renews it.
   */
  private async onTokenWillExpire(): Promise<void> {
    try {
      console.log('Token privilege will expire, requesting new token...');

      // Request new token from backend
      const { token } = await generateAgoraToken(this.channelName, this.uid, this.role);

      if (this.engine && token) {
        // Renew token in Agora engine
        await this.engine.renewToken(token);
        console.log('Token renewed successfully');
      }
    } catch (error) {
      console.error('Error renewing Agora token:', error);
      // Optionally emit error callback or show user notification
    }
  }

  /**
   * Cleanup listeners when disconnecting.
   */
  cleanup(): void {
    if (this.engine) {
      this.engine.removeListener('TokenPrivilegeWillExpire', this.onTokenWillExpire.bind(this));
    }
    this.engine = null;
    this.channelName = '';
    this.uid = 0;
    this.role = 'audience';
  }
}

export const tokenRefreshManager = new TokenRefreshManager();
