export interface RoomInfo {
  name: string;
  players: string[];
  maxPlayers: number;
}

export interface GameState {
  availableWords: string[];
  currentPhase: string; // e.g., SUBMITTING, VOTING, RESULTS
  submittedPlayers: string[];
  submittedSentences: { [playerName: string]: string };
  votes: { [playerName: string]: number }; // Added votes dictionary
  votedPlayers: string[]; // Added list of players who voted
  winners: string[]; // Added list of winner(s)
  readyPlayers: string[]; // Added list of players ready for next round
}

export interface DataItem {
  serverName: string;
  players: string;
  zip: string;
  color: string;
  playerNames: string[];
}
