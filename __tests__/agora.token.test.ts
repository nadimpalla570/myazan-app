import { generateAgoraToken } from '../src/services/api';
import axios from 'axios';
import * as firebaseAuth from 'firebase/auth';

jest.mock('axios');
jest.mock('firebase/auth');

describe('Agora Token Generation', () => {
  const mockToken = 'mock_agora_token_12345';
  const mockExpiresAt = new Date(Date.now() + 3600000).toISOString();

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock Firebase auth
    (firebaseAuth.getAuth as jest.Mock).mockReturnValue({
      currentUser: {
        getIdToken: jest.fn().mockResolvedValue('mock_firebase_token'),
      },
    });
  });

  it('should generate a valid token for publisher role', async () => {
    (axios.post as jest.Mock).mockResolvedValueOnce({
      data: { token: mockToken, expiresAt: mockExpiresAt },
    });

    const result = await generateAgoraToken('test_channel', 123, 'publisher');

    expect(result.token).toBe(mockToken);
    expect(result.expiresAt).toBe(mockExpiresAt);
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/token/generate'),
      expect.objectContaining({
        channelName: 'test_channel',
        uid: 123,
        role: 'publisher',
      }),
      expect.any(Object)
    );
  });

  it('should generate a valid token for audience role', async () => {
    (axios.post as jest.Mock).mockResolvedValueOnce({
      data: { token: mockToken, expiresAt: mockExpiresAt },
    });

    const result = await generateAgoraToken('test_channel', 456, 'audience');

    expect(result.token).toBe(mockToken);
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/token/generate'),
      expect.objectContaining({
        role: 'audience',
      }),
      expect.any(Object)
    );
  });

  it('should handle token generation errors gracefully', async () => {
    const mockError = new Error('Backend unavailable');
    (axios.post as jest.Mock).mockRejectedValueOnce(mockError);

    await expect(generateAgoraToken('test_channel', 123, 'publisher')).rejects.toThrow(
      'Backend unavailable'
    );
  });
});
