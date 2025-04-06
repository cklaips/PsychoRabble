using Microsoft.AspNetCore.SignalR;
using PsychoRabble.API.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace PsychoRabble.API.Hubs
{
    public class GameHub : Hub
    {
        // Static dictionaries to hold state (consider a more robust state management solution for production)
        private static readonly Dictionary<string, RoomInfo> _rooms = new();
        private static readonly Dictionary<string, GameState> _gameStates = new();
        // Maps ConnectionId to PlayerInfo (PlayerName, RoomName)
        private static readonly Dictionary<string, PlayerInfo> _playerInfo = new(); 

        public async Task CreateRoom(string roomName)
        {
            if (string.IsNullOrWhiteSpace(roomName))
            {
                 throw new HubException("Room name cannot be empty.");
            }
            if (_rooms.ContainsKey(roomName))
            {
                throw new HubException("Room already exists");
            }

            var room = new RoomInfo { Name = roomName };
            _rooms[roomName] = room;
            _gameStates[roomName] = new GameState
            {
                // Initialize with regular words, prefixes, and suffixes
                AvailableWords = new List<string> 
                {
                    "The", "quick", "brown", "fox", "jumps", "over", "lazy", "dog",
                    "in", "the", "park", "today", "happy", "sunny", "day", "play",
                    "-ly", "-ing", "-s", "un-", "re-" // Added prefixes/suffixes
                } 
            };

            // Notify all clients about the updated list of available rooms
            await Clients.All.SendAsync("AvailableRoomsUpdated", GetRoomInfoList());
        }

        public async Task JoinRoom(string roomName, string playerName)
        {
             if (string.IsNullOrWhiteSpace(playerName))
            {
                 throw new HubException("Player name cannot be empty.");
            }
             if (string.IsNullOrWhiteSpace(roomName))
            {
                 throw new HubException("Room name cannot be empty.");
            }
            if (!_rooms.ContainsKey(roomName))
            {
                throw new HubException("Room does not exist");
            }

            var room = _rooms[roomName];
            if (room.Players.Count >= room.MaxPlayers)
            {
                throw new HubException("Room is full");
            }
             // Check if player name is already taken in the room
            if (room.Players.Contains(playerName))
            {
                 throw new HubException($"Player name '{playerName}' is already taken in this room.");
            }

            // Store player info using ConnectionId as key
            _playerInfo[Context.ConnectionId] = new PlayerInfo { PlayerName = playerName, RoomName = roomName };
            room.Players.Add(playerName); // Add the actual player name

            await Groups.AddToGroupAsync(Context.ConnectionId, roomName);
            // Notify the group (including the new player) about the updated player list
            await Clients.Group(roomName).SendAsync("PlayersUpdated", room.Players); 
            
            // Send the current game state and player info directly to the caller
            if (_gameStates.TryGetValue(roomName, out var gameState))
            {
                 // Use the playerInfo object we created earlier
                 await Clients.Caller.SendAsync("JoinedRoom", _playerInfo[Context.ConnectionId], gameState);
            }
            else {
                 // Handle case where game state might be missing (shouldn't happen if created with room)
                 await Clients.Caller.SendAsync("JoinedRoom", _playerInfo[Context.ConnectionId], null);
            }

            // Notify all clients about the change in room occupancy
            await Clients.All.SendAsync("AvailableRoomsUpdated", GetRoomInfoList());
        }

        public async Task LeaveRoom()
        {
            // Use _playerInfo to find the player's details based on their connection ID
            if (_playerInfo.TryGetValue(Context.ConnectionId, out var playerInfo))
            {
                var roomName = playerInfo.RoomName;
                var playerName = playerInfo.PlayerName;

                if (_rooms.TryGetValue(roomName, out var room))
                {
                    bool removed = room.Players.Remove(playerName); // Remove by player name

                    if (removed) 
                    {
                        // Notify remaining players in the group
                        await Clients.Group(roomName).SendAsync("PlayersUpdated", room.Players);
                        // Notify all clients about the change in room occupancy
                        await Clients.All.SendAsync("AvailableRoomsUpdated", GetRoomInfoList());

                         // If the room is now empty, remove it
                         if (room.Players.Count == 0)
                         {
                             Console.WriteLine($"Room '{roomName}' is now empty. Removing."); // Add log
                             bool roomRemoved = _rooms.Remove(roomName);
                             bool stateRemoved = _gameStates.Remove(roomName);
                             Console.WriteLine($"Room removal result: {roomRemoved}, State removal result: {stateRemoved}"); // Add log
                             // Notify all clients again as the room is gone
                              await Clients.All.SendAsync("AvailableRoomsUpdated", GetRoomInfoList());
                         }
                     }
                 } // <--- Added missing closing brace for if(_rooms.TryGetValue...)
                
                // Always remove the player's info and connection from the group
                _playerInfo.Remove(Context.ConnectionId); 
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, roomName);
            }
        }

        // Helper method to get the list of RoomInfo suitable for sending to clients
        private List<RoomInfo> GetRoomInfoList()
        {
            // Project the dictionary values to a list
            return _rooms.Values.ToList();
        }


        public async Task<List<RoomInfo>> GetAvailableRooms()
        {
             // Directly return the helper method result
            return GetRoomInfoList();
        }

        public async Task SubmitSentence(string sentence)
        {
            if (!_playerInfo.TryGetValue(Context.ConnectionId, out var playerInfo))
            {
                throw new HubException("Player not found or not in a room.");
            }

            var roomName = playerInfo.RoomName;
            var playerName = playerInfo.PlayerName;

            if (!_gameStates.TryGetValue(roomName, out var gameState) || !_rooms.TryGetValue(roomName, out var room))
            {
                 throw new HubException("Game or room state not found.");
            }

            if (gameState.CurrentPhase != "SUBMITTING")
            {
                 throw new HubException("Not in the submitting phase.");
            }

            if (gameState.SubmittedPlayers.Contains(playerName))
            {
                 // Allow resubmission? For now, let's just ignore or throw error.
                 // Or update the existing sentence:
                 gameState.SubmittedSentences[playerName] = sentence;
                 // Don't add to SubmittedPlayers again if resubmitting.
                 // We still need to broadcast the update.
                 await Clients.Group(roomName).SendAsync("GameStateUpdated", gameState);
                 return; // Exit early if just updating
                 // throw new HubException("You have already submitted a sentence.");
            }

            gameState.SubmittedPlayers.Add(playerName);
            gameState.SubmittedSentences[playerName] = sentence;

            // Check if all players in the room have submitted
            bool allSubmitted = room.Players.All(p => gameState.SubmittedPlayers.Contains(p));
            if (allSubmitted && room.Players.Count > 0) // Ensure room isn't empty
            {
                gameState.CurrentPhase = "VOTING";
                // Potentially clear AvailableWords or other state for the next phase
            }

            // Broadcast the updated game state to everyone in the room
            await Clients.Group(roomName).SendAsync("GameStateUpdated", gameState);
        }

        public async Task CastVote(string votedPlayerName)
        {
             if (!_playerInfo.TryGetValue(Context.ConnectionId, out var voterInfo))
            {
                throw new HubException("Player not found or not in a room.");
            }

            var roomName = voterInfo.RoomName;
            var voterPlayerName = voterInfo.PlayerName;

            if (!_gameStates.TryGetValue(roomName, out var gameState) || !_rooms.TryGetValue(roomName, out var room))
            {
                 throw new HubException("Game or room state not found.");
            }

             if (gameState.CurrentPhase != "VOTING")
            {
                 throw new HubException("Not in the voting phase.");
            }

             if (voterPlayerName == votedPlayerName)
            {
                 throw new HubException("You cannot vote for yourself.");
            }

             if (gameState.VotedPlayers.Contains(voterPlayerName))
            {
                 throw new HubException("You have already voted.");
            }

             if (!gameState.SubmittedPlayers.Contains(votedPlayerName))
            {
                 throw new HubException("Cannot vote for a player who has not submitted a sentence.");
            }

            // Record the vote
            gameState.VotedPlayers.Add(voterPlayerName);
            if (gameState.Votes.ContainsKey(votedPlayerName))
            {
                gameState.Votes[votedPlayerName]++;
            }
            else
            {
                gameState.Votes[votedPlayerName] = 1;
            }

            // Check if all players have voted
            // Note: This assumes all players currently in the room must vote. 
            // Adjust logic if players who submitted but left should still be considered.
            bool allVoted = room.Players.All(p => gameState.VotedPlayers.Contains(p));
            if (allVoted && room.Players.Count > 0)
            {
                gameState.CurrentPhase = "RESULTS"; 
                
                // Determine winner(s)
                if (gameState.Votes.Any())
                {
                    int maxVotes = gameState.Votes.Values.Max();
                    gameState.Winners = gameState.Votes
                                            .Where(pair => pair.Value == maxVotes)
                                            .Select(pair => pair.Key)
                                            .ToList();
                }
                else
                {
                    gameState.Winners = new List<string>(); // No votes cast
                }
                 // TODO: Add logic to reset for next round or end game
            }

            // Broadcast the updated game state
            await Clients.Group(roomName).SendAsync("GameStateUpdated", gameState);
        }


        // Re-adding GetGameState as it's useful for clients joining mid-game
        public async Task<GameState?> GetGameState()
        {
            if (_playerInfo.TryGetValue(Context.ConnectionId, out var playerInfo))
            {
                if (_gameStates.TryGetValue(playerInfo.RoomName, out var gameState))
                {
                    return gameState;
                }
            }
            return null; // Return null or throw if not in a room/game state not found
        }


        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            // When a client disconnects, call LeaveRoom to clean up state
            await LeaveRoom(); 
            await base.OnDisconnectedAsync(exception);
        }

        public async Task ReadyUp()
        {
            if (!_playerInfo.TryGetValue(Context.ConnectionId, out var playerInfo))
            {
                throw new HubException("Player not found or not in a room.");
            }

            var roomName = playerInfo.RoomName;
            var playerName = playerInfo.PlayerName;

            if (!_gameStates.TryGetValue(roomName, out var gameState) || !_rooms.TryGetValue(roomName, out var room))
            {
                 throw new HubException("Game or room state not found.");
            }

            // Allow ready up only during RESULTS phase (or maybe VOTING too?)
            if (gameState.CurrentPhase != "RESULTS") 
            {
                 // Or maybe allow readying up early? For now, restrict to RESULTS.
                 throw new HubException("Cannot ready up until results are shown.");
            }

            if (!gameState.ReadyPlayers.Contains(playerName))
            {
                gameState.ReadyPlayers.Add(playerName);
            }

            // Check if all current players in the room are ready
            bool allReady = room.Players.All(p => gameState.ReadyPlayers.Contains(p));
            if (allReady && room.Players.Count > 0)
            {
                // Reset for next round
                Console.WriteLine($"All players in room '{roomName}' are ready. Starting new round.");
                gameState.CurrentPhase = "SUBMITTING";
                gameState.SubmittedPlayers.Clear();
                gameState.SubmittedSentences.Clear();
                gameState.Votes.Clear();
                gameState.VotedPlayers.Clear();
                gameState.Winners.Clear();
                gameState.ReadyPlayers.Clear();
                // TODO: Potentially assign new AvailableWords if desired
                // gameState.AvailableWords = GetNewWordList(); 
            }

            // Broadcast the updated game state (shows who is ready, or starts new round)
            await Clients.Group(roomName).SendAsync("GameStateUpdated", gameState);
        }
    }
}
