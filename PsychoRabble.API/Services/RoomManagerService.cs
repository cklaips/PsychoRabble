using System;
using System.Collections.Concurrent; // Use ConcurrentDictionary for thread safety
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using PsychoRabble.API.Hubs; // Access Hub and Models
using PsychoRabble.API.Models;

namespace PsychoRabble.API.Services
{
    // Singleton service to manage room and game state
    public class RoomManagerService : IDisposable
    {
        private readonly ConcurrentDictionary<string, RoomInfo> _rooms = new();
        private readonly ConcurrentDictionary<string, GameState> _gameStates = new();
        // Maps ConnectionId to PlayerInfo (PlayerName, RoomName) - Still needs careful management or alternative
        private readonly ConcurrentDictionary<string, PlayerInfo> _playerInfoByConnectionId = new(); 
        private readonly ConcurrentDictionary<string, Timer> _roomTimers = new();
        private readonly IHubContext<GameHub> _hubContext; // Inject HubContext

        public RoomManagerService(IHubContext<GameHub> hubContext)
        {
            _hubContext = hubContext;
            Console.WriteLine("RoomManagerService Initialized");
        }

        // --- Room Management ---

        public (bool success, string? error, RoomInfo? room, GameState? gameState) CreateRoom(string roomName)
        {
            var room = new RoomInfo { Name = roomName };
            var gameState = new GameState { AvailableWords = GetNewWordList() }; // Phase defaults to PENDING

            if (_rooms.TryAdd(roomName, room))
            {
                if (_gameStates.TryAdd(roomName, gameState))
                {
                     Console.WriteLine($"Room '{roomName}' created by service. Phase: PENDING");
                     return (true, null, room, gameState);
                }
                else
                {
                    // Cleanup if game state add fails (shouldn't happen often)
                    _rooms.TryRemove(roomName, out _); 
                    return (false, "Failed to initialize game state.", null, null);
                }
            }
            else
            {
                return (false, "Room already exists.", null, null);
            }
        }

        public List<RoomInfo> GetRoomInfoList()
        {
            return _rooms.Values.ToList();
        }

        public RoomInfo? GetRoomInfo(string roomName)
        {
             _rooms.TryGetValue(roomName, out var room);
             return room;
        }

        // --- Player Management ---

         public (bool success, string? error, PlayerInfo? playerInfo, GameState? gameState) AddPlayerToRoom(string connectionId, string roomName, string playerName)
         {
            if (!_rooms.TryGetValue(roomName, out var room) || !_gameStates.TryGetValue(roomName, out var gameState))
            {
                return (false, "Room not found.", null, null);
            }

            // Check max players (needs read lock or atomic operation if RoomInfo is complex)
            // For now, assume simple check is okay, but could lead to race condition
            if (room.Players.Count >= room.MaxPlayers) 
            {
                 return (false, "Room is full.", null, null);
            }

            // Check name uniqueness within the room
            // Note: room.Players itself isn't thread-safe for concurrent adds/checks.
            // A ConcurrentBag or locking is needed for room.Players if high contention expected.
            lock(room) // Lock the specific room object for player list modification
            {
                 if (room.Players.Contains(playerName))
                 {
                     return (false, $"Player name '{playerName}' is already taken in this room.", null, null);
                 }
                 room.Players.Add(playerName);
            }

            var playerInfo = new PlayerInfo { PlayerName = playerName, RoomName = roomName };
            if (_playerInfoByConnectionId.TryAdd(connectionId, playerInfo))
            {
                 // Check if timer needs to be started
                 bool startTimer = false;
                 if (gameState.CurrentPhase == "PENDING" && room.Players.Count >= 2 && gameState.RoundStartTime == null)
                 {
                     Console.WriteLine($"Room '{roomName}' reached {room.Players.Count} players. Setting start timer in service.");
                     gameState.RoundStartTime = DateTimeOffset.UtcNow;
                     startTimer = true; 
                 }

                 if(startTimer) {
                     ScheduleRoundStartCheck(roomName, TimeSpan.FromSeconds(30));
                 }

                 return (true, null, playerInfo, gameState);
            }
            else
            {
                 // Failed to add player mapping, remove from room list
                 lock(room) { room.Players.Remove(playerName); }
                 return (false, "Failed to track player connection.", null, null);
            }
         }

         public (PlayerInfo? playerInfo, RoomInfo? room, GameState? gameState, List<string>? remainingPlayers, bool roomRemoved) RemovePlayer(string connectionId)
         {
             PlayerInfo? playerInfo = null;
             RoomInfo? room = null;
             GameState? gameState = null;
             List<string>? remainingPlayers = null;
             bool roomRemoved = false;
             bool timerCancelled = false;

             if (_playerInfoByConnectionId.TryRemove(connectionId, out playerInfo))
             {
                 if (_rooms.TryGetValue(playerInfo.RoomName, out room) && _gameStates.TryGetValue(playerInfo.RoomName, out gameState))
                 {
                     lock(room) // Lock room for player list modification
                     {
                         if(room.Players.Remove(playerInfo.PlayerName))
                         {
                             remainingPlayers = room.Players.ToList(); // Copy before potential room removal

                             if (room.Players.Count < 2 && gameState.CurrentPhase == "PENDING" && gameState.RoundStartTime != null)
                             {
                                 Console.WriteLine($"Player count in '{playerInfo.RoomName}' dropped below 2 during PENDING. Cancelling start timer in service.");
                                 gameState.RoundStartTime = null;
                                 CancelRoundStartTimer(playerInfo.RoomName); 
                                 timerCancelled = true;
                             }

                             if (room.Players.Count == 0)
                             {
                                 Console.WriteLine($"Room '{playerInfo.RoomName}' is now empty. Removing from service.");
                                 _rooms.TryRemove(playerInfo.RoomName, out _);
                                 _gameStates.TryRemove(playerInfo.RoomName, out _);
                                 CancelRoundStartTimer(playerInfo.RoomName); // Ensure timer is gone
                                 roomRemoved = true;
                             }
                         }
                     }
                 }
             }
             // If timer was cancelled, we need to return the updated gameState
             if (timerCancelled) return (playerInfo, room, gameState, remainingPlayers, roomRemoved);
             
             // Otherwise, return potentially null gameState if room was removed
             return (playerInfo, room, roomRemoved ? null : gameState, remainingPlayers, roomRemoved);
         }

         public PlayerInfo? GetPlayerInfo(string connectionId)
         {
             _playerInfoByConnectionId.TryGetValue(connectionId, out var info);
             return info;
         }

        // --- Game State Management ---
        public GameState? GetGameState(string roomName) {
             _gameStates.TryGetValue(roomName, out var state);
             return state;
        }

        // Example of how to update state safely (more methods needed)
        public bool UpdateGameState(string roomName, Action<GameState> updateAction) {
            if(_gameStates.TryGetValue(roomName, out var gameState)) {
                // Potentially lock gameState if complex updates needed, 
                // but ConcurrentDictionary handles basic add/remove/update safety.
                // For modifying properties *within* gameState, locking might be needed if not atomic.
                // For simplicity here, assume direct property updates are okay for now.
                updateAction(gameState);
                return true;
            }
            return false;
        }

        // --- Game Logic Methods ---

        public (bool success, string? error, GameState? updatedState) SubmitSentence(string roomName, string playerName, string sentence)
        {
            if (!_gameStates.TryGetValue(roomName, out var gameState) || !_rooms.TryGetValue(roomName, out var room)) 
            {
                return (false, "Game or room state not found.", null);
            }

            lock(gameState) lock(room) // Lock for modifying state
            {
                if (gameState.CurrentPhase != "SUBMITTING") return (false, "Not in the submitting phase.", null);
                
                if (!gameState.SubmittedPlayers.Contains(playerName))
                {
                     gameState.SubmittedPlayers.Add(playerName);
                }
                gameState.SubmittedSentences[playerName] = sentence; // Allow updates

                bool allSubmitted = room.Players.All(p => gameState.SubmittedPlayers.Contains(p));
                if (allSubmitted && room.Players.Count > 0) 
                {
                    gameState.CurrentPhase = "VOTING";
                    Console.WriteLine($"All players submitted in '{roomName}'. Phase changed to VOTING.");
                }
            }
            return (true, null, gameState);
        }

         public (bool success, string? error, GameState? updatedState) CastVote(string roomName, string voterPlayerName, string votedPlayerName)
         {
             if (!_gameStates.TryGetValue(roomName, out var gameState) || !_rooms.TryGetValue(roomName, out var room)) 
             {
                 return (false, "Game or room state not found.", null);
             }

             lock(gameState) lock(room) // Lock for modifying state
             {
                if (gameState.CurrentPhase != "VOTING") return (false, "Not in the voting phase.", null);
                if (voterPlayerName == votedPlayerName) return (false, "You cannot vote for yourself.", null);
                if (gameState.VotedPlayers.Contains(voterPlayerName)) return (false, "You have already voted.", null);
                if (!gameState.SubmittedPlayers.Contains(votedPlayerName)) return (false, "Cannot vote for a player who has not submitted a sentence.", null);

                gameState.VotedPlayers.Add(voterPlayerName);
                gameState.Votes[votedPlayerName] = gameState.Votes.GetValueOrDefault(votedPlayerName, 0) + 1;

                bool allVoted = room.Players.All(p => gameState.VotedPlayers.Contains(p));
                if (allVoted && room.Players.Count > 0)
                {
                    gameState.CurrentPhase = "RESULTS"; 
                    if (gameState.Votes.Any())
                    {
                        int maxVotes = gameState.Votes.Values.Max();
                        gameState.Winners = gameState.Votes.Where(pair => pair.Value == maxVotes).Select(pair => pair.Key).ToList();
                    }
                    else { gameState.Winners = new List<string>(); }
                     Console.WriteLine($"All players voted in '{roomName}'. Phase changed to RESULTS. Winners: {string.Join(", ", gameState.Winners)}");
                }
             } 
             return (true, null, gameState);
         }

         public (bool success, string? error, GameState? updatedState) ReadyUp(string roomName, string playerName)
         {
             if (!_gameStates.TryGetValue(roomName, out var gameState) || !_rooms.TryGetValue(roomName, out var room)) 
             {
                 return (false, "Game or room state not found.", null);
             }

             lock(gameState) lock(room) // Lock for modifying state
             {
                if (gameState.CurrentPhase != "RESULTS") return (false, "Cannot ready up until results are shown.", null);

                if (!gameState.ReadyPlayers.Contains(playerName))
                {
                    gameState.ReadyPlayers.Add(playerName);
                }

                bool allReady = room.Players.All(p => gameState.ReadyPlayers.Contains(p));
                if (allReady && room.Players.Count > 0)
                {
                    Console.WriteLine($"All players in room '{roomName}' are ready. Starting new round.");
                    gameState.CurrentPhase = "SUBMITTING";
                    gameState.SubmittedPlayers.Clear();
                    gameState.SubmittedSentences.Clear();
                    gameState.Votes.Clear();
                    gameState.VotedPlayers.Clear();
                    gameState.Winners.Clear();
                    gameState.ReadyPlayers.Clear();
                    gameState.AvailableWords = GetNewWordList(); 
                }
             } 
             return (true, null, gameState);
         }


        // --- Word List Helper ---
        private List<string> GetNewWordList() {
             // In a real app, fetch from a database or larger list
             var allWords = new List<string> {
                 "The", "quick", "brown", "fox", "jumps", "over", "lazy", "dog",
                 "in", "the", "park", "today", "happy", "sunny", "day", "play",
                 "red", "blue", "green", "cat", "runs", "fast", "slow", "big", "small",
                 "-ly", "-ing", "-s", "-ed", "un-", "re-", "pre-" 
             };
             var random = new Random();
             return allWords.OrderBy(x => random.Next()).Take(15).ToList(); 
        }


        // --- Timer Management ---
        private void ScheduleRoundStartCheck(string roomName, TimeSpan delay)
        {
             // Use thread-safe AddOrUpdate
             var timer = new Timer(async _ => await AttemptRoundStart(roomName), null, delay, Timeout.InfiniteTimeSpan); 

             _roomTimers.AddOrUpdate(roomName, timer, (key, existingTimer) => {
                 Console.WriteLine($"Replacing existing timer for room '{key}'.");
                 existingTimer.Dispose(); // Dispose the old timer before replacing
                 return timer; 
             });
             Console.WriteLine($"Scheduled round start check for '{roomName}' in {delay.TotalSeconds} seconds.");
        }

        private void CancelRoundStartTimer(string roomName)
        {
             if (_roomTimers.TryRemove(roomName, out var timer))
             {
                 Console.WriteLine($"Cancelling round start timer for '{roomName}'.");
                 timer.Dispose(); 
             }
        }

        private async Task AttemptRoundStart(string roomName)
        {
            Console.WriteLine($"Timer fired for room '{roomName}'. Attempting round start in service.");
            GameState? gameState = null;
            RoomInfo? room = null;
            bool stateChanged = false;

            // Get current state - no need to lock dictionaries for TryGetValue
            if (!_gameStates.TryGetValue(roomName, out gameState) || !_rooms.TryGetValue(roomName, out room) || gameState == null || room == null)
            {
                 Console.WriteLine($"AttemptRoundStart: Room '{roomName}' no longer exists.");
                 CancelRoundStartTimer(roomName); // Ensure timer is removed if room is gone
                 return; 
            }

            // Check conditions again: PENDING phase, timer was set, player count still >= 2
            // Lock only when modifying state
            lock(gameState) lock(room) // Lock the specific game state and room objects
            {
                if (gameState.CurrentPhase == "PENDING" && gameState.RoundStartTime != null && room.Players.Count >= 2)
                {
                    // Check time *inside* lock for consistency
                    if (DateTimeOffset.UtcNow >= gameState.RoundStartTime.Value.AddSeconds(30)) 
                    {
                        Console.WriteLine($"Room '{roomName}' conditions met. Starting SUBMITTING phase.");
                        gameState.CurrentPhase = "SUBMITTING";
                        gameState.RoundStartTime = null; 
                        gameState.SubmittedPlayers.Clear();
                        gameState.SubmittedSentences.Clear();
                        gameState.Votes.Clear();
                        gameState.VotedPlayers.Clear();
                        gameState.Winners.Clear();
                        gameState.ReadyPlayers.Clear(); 
                        gameState.AvailableWords = GetNewWordList(); 
                        stateChanged = true;
                    } else {
                         Console.WriteLine($"Timer fired for '{roomName}' but 30s not yet elapsed.");
                         // Reschedule? No, let check-on-action handle it later.
                    }
                } else {
                     Console.WriteLine($"AttemptRoundStart: Conditions not met for room '{roomName}'. Phase: {gameState.CurrentPhase}, PlayerCount: {room.Players.Count}, StartTimeSet: {gameState.RoundStartTime != null}");
                     // If conditions aren't met (e.g., player left), clear the start time
                     if(gameState.RoundStartTime != null) {
                         gameState.RoundStartTime = null; 
                         stateChanged = true; // State changed (timer cleared)
                     }
                }
            } // End locks

            // Clean up the timer reference outside the lock
            CancelRoundStartTimer(roomName); 

            if (stateChanged) {
                 Console.WriteLine($"Broadcasting GameStateUpdated for room '{roomName}' from timer callback. Phase: {gameState.CurrentPhase}");
                 // Use injected HubContext to broadcast
                 await _hubContext.Clients.Group(roomName).SendAsync("GameStateUpdated", gameState); 
            }
        }


        // --- Word List Helper ---
        // (GetNewWordList already defined above)


        // --- Dispose Timer ---
        public void Dispose()
        {
            Console.WriteLine("Disposing RoomManagerService timers...");
            lock(_roomTimers)
            {
                foreach (var timer in _roomTimers.Values)
                {
                    timer.Dispose();
                }
                _roomTimers.Clear();
            }
             GC.SuppressFinalize(this);
        }
    }
}
