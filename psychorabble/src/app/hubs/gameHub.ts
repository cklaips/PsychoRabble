export interface GameHub {
  // Room management
  createRoom(roomName: string): Promise<string>;
  joinRoom(roomName: string): Promise<void>;
  leaveRoom(roomName: string): Promise<void>;
  getAvailableRooms(): Promise<RoomInfo[]>;

  // Game state
  updateGameState(roomName: string, gameState: GameState): Promise<void>;
  getGameState(roomName: string): Promise<GameState>;

  // Player management
  addPlayer(roomName: string, playerName: string): Promise<void>;
  removePlayer(roomName: string, playerName: string): Promise<void>;
  getPlayers(roomName: string): Promise<string[]>;
}

export interface RoomInfo {
  serverName: string;
  players: string;
  zip: string;
  color: string;
  playerNames: string[];
}

export interface GameState {
  players: {
    [playerName: string]: {
      sentence: string[];
      score: number;
    }
  };
  currentRound: number;
  maxRounds: number;
  isRoundComplete: boolean;
  roundStartTime: Date;
  roundEndTime: Date;
} 