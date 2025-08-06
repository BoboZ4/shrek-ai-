
export enum Sender {
  User = 'user',
  AI = 'ai',
}

export interface ChatMessage {
  id: string;
  text: string;
  sender: Sender;
  sources?: string[];
}

export interface VoiceOption {
  name: string;
  description: string;
  voiceId: string; // ElevenLabs Voice ID
  lang: string;
  available?: boolean;
  apiName?: string; // The actual name from the ElevenLabs API for proof
}
