// Wrap Agora functions
import RtcEngine, { ChannelProfile, ClientRole } from 'react-native-agora';
import { Platform } from 'react-native';
import { generateAgoraToken } from './api';

const APP_ID = 'YOUR_AGORA_APP_ID';

export async function createAgoraEngine() {
  const engine: any = await RtcEngine.create(APP_ID);
  await engine.enableAudio();
  await engine.setChannelProfile(ChannelProfile.Communication); // audio call
  return engine;
}

export async function joinChannel(engine: any, channelName: string, uid = 0, role: 'publisher'|'audience' = 'audience', onRemoteUserJoined?: (uid:number)=>void, onRemoteUserLeft?: (uid:number)=>void) {
  // request token from backend
  const { token } = await generateAgoraToken(channelName, uid, role);
  const clientRole = role === 'publisher' ? ClientRole.Broadcaster : ClientRole.Audience;
  await engine.setClientRole(clientRole);
  if (role === 'publisher') {
    await engine.startPreview();
  }
  engine.addListener('UserJoined', (uidNum: any) => { onRemoteUserJoined && onRemoteUserJoined(uidNum); });
  engine.addListener('UserOffline', (uidNum: any) => { onRemoteUserLeft && onRemoteUserLeft(uidNum); });
  await engine.joinChannel(token, channelName, null, uid);
  return token;
}

export async function leaveChannel(engine: any) {
  try {
    await engine.leaveChannel();
    await engine.stopPreview();
  } catch (err) {
    console.warn('leaveChannel error', err);
  }
}
