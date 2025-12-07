import { ChannelManager } from '../src/services/channelManager';
import * as firestore from 'firebase/firestore';

jest.mock('firebase/firestore');

describe('ChannelManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateChannelName', () => {
    it('should generate deterministic channel names', () => {
      const senderId = 'sender123';
      const channelName = ChannelManager.generateChannelName(senderId);

      expect(channelName).toBe('myazan_sender123');
    });

    it('should generate unique names for different senders', () => {
      const channel1 = ChannelManager.generateChannelName('sender1');
      const channel2 = ChannelManager.generateChannelName('sender2');

      expect(channel1).not.toBe(channel2);
      expect(channel1).toBe('myazan_sender1');
      expect(channel2).toBe('myazan_sender2');
    });
  });

  describe('extractSenderId', () => {
    it('should extract sender ID from channel name', () => {
      const channelName = 'myazan_sender123';
      const senderId = ChannelManager.extractSenderId(channelName);

      expect(senderId).toBe('sender123');
    });

    it('should return null for invalid channel names', () => {
      const senderId = ChannelManager.extractSenderId('invalid_channel');

      expect(senderId).toBeNull();
    });
  });

  describe('checkActiveSession', () => {
    it('should return true if active session exists', async () => {
      (firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        empty: false,
        docs: [{ id: 'session1' }],
      });

      const result = await ChannelManager.checkActiveSession('myazan_sender123');

      expect(result).toBe(true);
      expect(firestore.getDocs).toHaveBeenCalled();
    });

    it('should return false if no active session exists', async () => {
      (firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        empty: true,
        docs: [],
      });

      const result = await ChannelManager.checkActiveSession('myazan_sender123');

      expect(result).toBe(false);
    });
  });

  describe('startSession', () => {
    it('should prevent starting session if one already exists', async () => {
      (firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        empty: false,
        docs: [{ id: 'existing_session' }],
      });

      const result = await ChannelManager.startSession(
        'session2',
        'sender123',
        'myazan_sender123',
        'token123'
      );

      expect(result).toBe(false);
      expect(firestore.setDoc).not.toHaveBeenCalled();
    });

    it('should create a new session if no collision', async () => {
      (firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        empty: true,
        docs: [],
      });
      (firestore.setDoc as jest.Mock).mockResolvedValueOnce(undefined);

      const result = await ChannelManager.startSession(
        'session1',
        'sender123',
        'myazan_sender123',
        'token123'
      );

      expect(result).toBe(true);
      expect(firestore.setDoc).toHaveBeenCalled();
    });
  });
});
