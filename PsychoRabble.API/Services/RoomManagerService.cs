using System;
using System.Collections.Concurrent; 
using System.Collections.Generic;
using System.Linq;
using System.Text; 
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using PsychoRabble.API.Hubs; 
using PsychoRabble.API.Models;

namespace PsychoRabble.API.Services
{
    public class RoomManagerService : IDisposable
    {
        private readonly ConcurrentDictionary<string, RoomInfo> _rooms = new();
        private readonly ConcurrentDictionary<string, GameState> _gameStates = new();
        private readonly ConcurrentDictionary<string, PlayerInfo> _playerInfoByConnectionId = new(); 
        private readonly ConcurrentDictionary<string, Timer> _roomTimers = new(); 
        private readonly IHubContext<GameHub> _hubContext; 

        private const int PENDING_TIMER_SECONDS = 30;
        private const int SUBMISSION_TIMER_SECONDS = 60; 
        private const int VOTING_TIMER_SECONDS = 20; 
        private const int RESULTS_TIMER_SECONDS = 30; 

        public RoomManagerService(IHubContext<GameHub> hubContext)
        {
            _hubContext = hubContext;
            Console.WriteLine("RoomManagerService Initialized");
        }

        // Helper to safely get game state and room
        private bool TryGetRoomAndGameState(string roomName, out RoomInfo? room, out GameState? gameState)
        {
            bool roomFound = _rooms.TryGetValue(roomName, out room);
            bool stateFound = _gameStates.TryGetValue(roomName, out gameState);
            if (roomFound && stateFound) { return true; } 
            if (!roomFound) room = null;
            if (!stateFound) gameState = null;
            return false;
        }

        // --- Room Management ---
        public (bool success, string? error, RoomInfo? room, GameState? gameState) CreateRoom(string roomName)
        {
            var room = new RoomInfo { Name = roomName };
            var gameState = new GameState { AvailableWords = GetNewWordList() }; 

            if (_rooms.TryAdd(roomName, room))
            {
                if (_gameStates.TryAdd(roomName, gameState))
                {
                     Console.WriteLine($"Room '{roomName}' created by service. Phase: PENDING");
                     return (true, null, room, gameState);
                }
                else
                {
                    _rooms.TryRemove(roomName, out _); 
                    return (false, "Failed to initialize game state.", null, null);
                }
            }
            else
            {
                return (false, "Room already exists.", null, null);
            }
        }

        public List<RoomInfo> GetRoomInfoList() => _rooms.Values.ToList();
        public RoomInfo? GetRoomInfo(string roomName) => _rooms.TryGetValue(roomName, out var room) ? room : null;

        // --- Player Management ---
         public (bool success, string? error, PlayerInfo? playerInfo, GameState? gameState) AddPlayerToRoom(string connectionId, string roomName, string playerName)
         {
            if (!_rooms.TryGetValue(roomName, out var room) || !_gameStates.TryGetValue(roomName, out var gameState))
            {
                return (false, "Room not found.", null, null);
            }

            lock(room) 
            {
                 if (room.Players.Count >= room.MaxPlayers) return (false, "Room is full.", null, null);
                 if (room.Players.Contains(playerName)) return (false, $"Player name '{playerName}' is already taken in this room.", null, null);
                 room.Players.Add(playerName);
            }

            var playerInfo = new PlayerInfo { PlayerName = playerName, RoomName = roomName };
            if (_playerInfoByConnectionId.TryAdd(connectionId, playerInfo))
            {
                 bool timerNeedsStarting = false;
                 bool stateChanged = false; 
                 lock(gameState) lock(room) 
                 {
                     if (gameState.CurrentPhase == "PENDING" && room.Players.Count >= 2 && gameState.RoundStartTime == null)
                     {
                         Console.WriteLine($"Room '{roomName}' reached {room.Players.Count} players. Setting PENDING timer.");
                         gameState.RoundStartTime = DateTimeOffset.UtcNow;
                         timerNeedsStarting = true; 
                         stateChanged = true;
                     }
                 }
                 if(timerNeedsStarting) {
                     ScheduleStateCheck(roomName, TimeSpan.FromSeconds(PENDING_TIMER_SECONDS));
                     _ = _hubContext.Clients.Group(roomName).SendAsync("GameStateUpdated", gameState);
                 }
                 return (true, null, playerInfo, gameState);
            }
            else
            {
                 lock(room) { room.Players.Remove(playerName); } 
                 return (false, "Failed to track player connection.", null, null);
            }
         }

         public (PlayerInfo? playerInfo, bool stateChanged, GameState? gameState, List<string>? remainingPlayers, bool roomRemoved) RemovePlayer(string connectionId)
         {
             PlayerInfo? playerInfo = null;
             RoomInfo? room = null;
             GameState? gameState = null;
             List<string>? remainingPlayers = null;
             bool roomRemoved = false;
             bool stateChanged = false;

             if (_playerInfoByConnectionId.TryRemove(connectionId, out playerInfo))
             {
                 if (_rooms.TryGetValue(playerInfo.RoomName, out room) && _gameStates.TryGetValue(playerInfo.RoomName, out gameState))
                 {
                     lock(room) lock(gameState) 
                     {
                         if(room.Players.Remove(playerInfo.PlayerName))
                         {
                             remainingPlayers = room.Players.ToList(); 
                             gameState.CurrentSentenceWords.Remove(playerInfo.PlayerName); 
                             gameState.ReadyPlayers.Remove(playerInfo.PlayerName); 

                             if (gameState.CurrentPhase == "PENDING" && room.Players.Count < 2 && gameState.RoundStartTime != null)
                             {
                                 Console.WriteLine($"Player count in '{playerInfo.RoomName}' dropped below 2 during PENDING. Cancelling start timer.");
                                 gameState.RoundStartTime = null;
                                 CancelTimer(playerInfo.RoomName); 
                                 stateChanged = true;
                             }

                             if (gameState.CurrentPhase == "SUBMITTING") {
                                 gameState.SubmittedPlayers.Remove(playerInfo.PlayerName); 
                                 bool allRemainingSubmitted = room.Players.Count > 0 && room.Players.All(p => gameState.SubmittedPlayers.Contains(p));
                                 if (allRemainingSubmitted) {
                                     Console.WriteLine($"Leaver '{playerInfo.PlayerName}' was last needed for submission in '{playerInfo.RoomName}'. Moving to VOTING.");
                                     CancelTimer(playerInfo.RoomName); 
                                     gameState.CurrentPhase = "VOTING";
                                     gameState.SubmissionEndTime = null;
                                     gameState.VotingEndTime = DateTimeOffset.UtcNow.AddSeconds(VOTING_TIMER_SECONDS); 
                                     ScheduleStateCheck(playerInfo.RoomName, TimeSpan.FromSeconds(VOTING_TIMER_SECONDS));
                                     stateChanged = true;
                                 }
                             }

                             if (gameState.CurrentPhase == "VOTING") {
                                 gameState.VotedPlayers.Remove(playerInfo.PlayerName); 
                                 bool allRemainingVoted = room.Players.Count > 0 && room.Players.All(p => gameState.VotedPlayers.Contains(p));
                                 if (allRemainingVoted) {
                                     Console.WriteLine($"Leaver '{playerInfo.PlayerName}' was last needed for voting in '{playerInfo.RoomName}'. Moving to RESULTS.");
                                     CancelTimer(playerInfo.RoomName); 
                                     gameState.CurrentPhase = "RESULTS";
                                     gameState.VotingEndTime = null;
                                     CalculateWinners(gameState); 
                                     gameState.ResultsEndTime = DateTimeOffset.UtcNow.AddSeconds(RESULTS_TIMER_SECONDS); 
                                     ScheduleStateCheck(playerInfo.RoomName, TimeSpan.FromSeconds(RESULTS_TIMER_SECONDS));
                                     stateChanged = true;
                                 }
                             }
                             
                             if (room.Players.Count == 0)
                             {
                                 Console.WriteLine($"Room '{playerInfo.RoomName}' is now empty. Removing from service.");
                                 _rooms.TryRemove(playerInfo.RoomName, out _);
                                 _gameStates.TryRemove(playerInfo.RoomName, out _);
                                 CancelTimer(playerInfo.RoomName); 
                                 roomRemoved = true;
                                 gameState = null; 
                                 stateChanged = false; 
                             }
                         }
                     }
                 }
             }
             return (playerInfo, stateChanged, gameState, remainingPlayers, roomRemoved);
         }

         public PlayerInfo? GetPlayerInfo(string connectionId) => _playerInfoByConnectionId.TryGetValue(connectionId, out var info) ? info : null;
         
        // --- Game State Management ---
        public GameState? GetGameState(string roomName) => _gameStates.TryGetValue(roomName, out var state) ? state : null;

        // --- Game Logic Methods ---

        // Called frequently by client during SUBMITTING phase
        public void UpdatePlayerSentence(string roomName, string playerName, List<string> currentWords)
        {
            if (_gameStates.TryGetValue(roomName, out var gameState))
            {
                lock(gameState) 
                {
                    if(gameState.CurrentPhase == "SUBMITTING") {
                        gameState.CurrentSentenceWords[playerName] = currentWords ?? new List<string>();
                    }
                }
            }
        }

        public (bool success, string? error, GameState? updatedState) SubmitSentence(string roomName, string playerName, string sentence)
        {
            if (!_gameStates.TryGetValue(roomName, out var gameState) || !_rooms.TryGetValue(roomName, out var room)) 
            {
                return (false, "Game or room state not found.", null);
            }

            bool stateChanged = false;
            lock(gameState) lock(room) 
            {
                if (gameState.CurrentPhase != "SUBMITTING") return (false, "Not in the submitting phase.", null);
                
                if (!gameState.SubmittedPlayers.Contains(playerName))
                {
                     gameState.SubmittedPlayers.Add(playerName);
                }
                gameState.SubmittedSentences[playerName] = sentence; 
                gameState.CurrentSentenceWords.Remove(playerName); 

                bool allSubmitted = room.Players.All(p => gameState.SubmittedPlayers.Contains(p));
                if (allSubmitted && room.Players.Count > 0) 
                {
                    Console.WriteLine($"All players submitted in '{roomName}'. Phase changed to VOTING.");
                    CancelTimer(roomName); 
                    gameState.CurrentPhase = "VOTING";
                    gameState.SubmissionEndTime = null;
                    gameState.VotingEndTime = DateTimeOffset.UtcNow.AddSeconds(VOTING_TIMER_SECONDS); 
                    ScheduleStateCheck(roomName, TimeSpan.FromSeconds(VOTING_TIMER_SECONDS));
                    stateChanged = true;
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

             bool stateChanged = false;
             lock(gameState) lock(room) 
             {
                if (gameState.CurrentPhase != "VOTING") return (false, "Not in the voting phase.", null);
                if (voterPlayerName == votedPlayerName) return (false, "You cannot vote for yourself.", null);
                if (gameState.VotedPlayers.Contains(voterPlayerName)) return (false, "You have already voted.", null);
                if (!gameState.SubmittedSentences.ContainsKey(votedPlayerName)) return (false, "Cannot vote for a player who did not submit a sentence.", null);

                gameState.VotedPlayers.Add(voterPlayerName);
                gameState.Votes[votedPlayerName] = gameState.Votes.GetValueOrDefault(votedPlayerName, 0) + 1;

                bool allVoted = room.Players.All(p => gameState.VotedPlayers.Contains(p));
                if (allVoted && room.Players.Count > 0)
                {
                    Console.WriteLine($"All players voted in '{roomName}'. Phase changed to RESULTS.");
                    CancelTimer(roomName); 
                    gameState.CurrentPhase = "RESULTS";
                    gameState.VotingEndTime = null;
                    CalculateWinners(gameState); 
                    gameState.ResultsEndTime = DateTimeOffset.UtcNow.AddSeconds(RESULTS_TIMER_SECONDS); 
                    ScheduleStateCheck(roomName, TimeSpan.FromSeconds(RESULTS_TIMER_SECONDS));
                    stateChanged = true;
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

             bool stateChanged = false; 
             bool startNewRound = false; 
             lock(gameState) lock(room) 
             {
                if (gameState.CurrentPhase != "RESULTS") return (false, "Cannot ready up until results are shown.", null);

                if (!gameState.ReadyPlayers.Contains(playerName))
                {
                    gameState.ReadyPlayers.Add(playerName);
                    stateChanged = true; 
                }

                bool allReady = room.Players.All(p => gameState.ReadyPlayers.Contains(p));
                if (allReady && room.Players.Count > 0)
                {
                    Console.WriteLine($"All players in room '{roomName}' are ready. Starting new round immediately.");
                    CancelTimer(roomName); 
                    gameState.CurrentPhase = "SUBMITTING";
                    gameState.ResultsEndTime = null; 
                    // Reset state...
                    gameState.SubmittedPlayers.Clear(); gameState.SubmittedSentences.Clear(); gameState.CurrentSentenceWords.Clear(); gameState.Votes.Clear(); gameState.VotedPlayers.Clear(); gameState.Winners.Clear(); gameState.ReadyPlayers.Clear();
                    gameState.AvailableWords = GetNewWordList(); 
                    gameState.SubmissionEndTime = DateTimeOffset.UtcNow.AddSeconds(SUBMISSION_TIMER_SECONDS);
                    startNewRound = true; 
                    stateChanged = true; 
                }
             } 
             
             if(startNewRound) {
                 ScheduleStateCheck(roomName, TimeSpan.FromSeconds(SUBMISSION_TIMER_SECONDS));
             }
             
             return (true, null, gameState); 
         }

        // --- Word List Helper ---
        private List<string> GetNewWordList() {
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
        private void ScheduleStateCheck(string roomName, TimeSpan delay)
        {
             var timer = new Timer(async _ => await ProcessScheduledCheck(roomName), null, delay, Timeout.InfiniteTimeSpan); 
             _roomTimers.AddOrUpdate(roomName, timer, (key, existingTimer) => {
                 Console.WriteLine($"Replacing existing timer for room '{key}'.");
                 existingTimer.Dispose(); 
                 return timer; 
             });
             Console.WriteLine($"Scheduled state check for '{roomName}' in {delay.TotalSeconds} seconds.");
        }

        private void CancelTimer(string roomName)
        {
             if (_roomTimers.TryRemove(roomName, out var timer))
             {
                 Console.WriteLine($"Cancelling timer for '{roomName}'.");
                 timer.Dispose(); 
             }
        }

        // Timer callback method
        private async Task ProcessScheduledCheck(string roomName)
        {
            Console.WriteLine($"Timer fired for room '{roomName}'. Processing scheduled check.");
            GameState? gameState = null;
            RoomInfo? room = null;
            bool stateChanged = false;
            string? nextPhase = null; 

            lock(_rooms) lock(_gameStates) 
            {
                if (!TryGetRoomAndGameState(roomName, out room, out gameState) || gameState == null || room == null)
                {
                    Console.WriteLine($"ProcessScheduledCheck: Room '{roomName}' no longer exists.");
                    return; 
                }

                // Check for PENDING -> SUBMITTING transition
                if (gameState.CurrentPhase == "PENDING" && gameState.RoundStartTime != null) 
                {
                     if (DateTimeOffset.UtcNow >= gameState.RoundStartTime.Value.AddSeconds(PENDING_TIMER_SECONDS))
                     {
                         if (room.Players.Count >= 2) 
                         {
                             Console.WriteLine($"Room '{roomName}' PENDING timer expired. Starting SUBMITTING phase.");
                             gameState.CurrentPhase = "SUBMITTING";
                             gameState.RoundStartTime = null; 
                             gameState.SubmissionEndTime = DateTimeOffset.UtcNow.AddSeconds(SUBMISSION_TIMER_SECONDS); 
                             gameState.SubmittedPlayers.Clear(); gameState.SubmittedSentences.Clear(); gameState.CurrentSentenceWords.Clear(); gameState.Votes.Clear(); gameState.VotedPlayers.Clear(); gameState.Winners.Clear(); gameState.ReadyPlayers.Clear(); 
                             gameState.AvailableWords = GetNewWordList(); 
                             stateChanged = true;
                             nextPhase = "SUBMITTING"; 
                         }
                         else 
                         {
                             Console.WriteLine($"Room '{roomName}' PENDING timer expired but player count ({room.Players.Count}) dropped below 2. Resetting timer.");
                             gameState.RoundStartTime = null; 
                             stateChanged = true; 
                         }
                     } else { Console.WriteLine($"Timer fired for '{roomName}' (PENDING) but {PENDING_TIMER_SECONDS}s not yet elapsed."); }
                }
                // Check for SUBMITTING -> VOTING transition
                else if (gameState.CurrentPhase == "SUBMITTING" && gameState.SubmissionEndTime != null) 
                {
                     if (DateTimeOffset.UtcNow >= gameState.SubmissionEndTime.Value)
                     {
                         Console.WriteLine($"Room '{roomName}' SUBMISSION timer expired. Forcing VOTING phase.");
                         foreach(var player in room.Players.ToList()) 
                         {
                             if (!gameState.SubmittedPlayers.Contains(player))
                             {
                                 List<string> currentWords = gameState.CurrentSentenceWords.GetValueOrDefault(player, new List<string>());
                                 string finalSentence = ProcessSentence(currentWords); 
                                 gameState.SubmittedPlayers.Add(player);
                                 gameState.SubmittedSentences[player] = finalSentence; 
                                 Console.WriteLine($"Auto-submitting for {player}: '{finalSentence}'");
                             }
                             gameState.CurrentSentenceWords.Remove(player); 
                         }
                         gameState.CurrentPhase = "VOTING";
                         gameState.SubmissionEndTime = null;
                         gameState.VotingEndTime = DateTimeOffset.UtcNow.AddSeconds(VOTING_TIMER_SECONDS); 
                         stateChanged = true;
                         nextPhase = "VOTING"; 
                     } else { Console.WriteLine($"Timer fired for '{roomName}' (SUBMITTING) but {SUBMISSION_TIMER_SECONDS}s not yet elapsed."); }
                }
                 // Check for VOTING -> RESULTS transition
                 else if (gameState.CurrentPhase == "VOTING" && gameState.VotingEndTime != null) 
                 {
                      if (DateTimeOffset.UtcNow >= gameState.VotingEndTime.Value)
                      {
                          Console.WriteLine($"Room '{roomName}' VOTING timer expired. Forcing RESULTS phase.");
                          gameState.CurrentPhase = "RESULTS";
                          gameState.VotingEndTime = null;
                          CalculateWinners(gameState); 
                          gameState.ResultsEndTime = DateTimeOffset.UtcNow.AddSeconds(RESULTS_TIMER_SECONDS); 
                          stateChanged = true;
                          nextPhase = "RESULTS"; 
                      } else { Console.WriteLine($"Timer fired for '{roomName}' (VOTING) but {VOTING_TIMER_SECONDS}s not yet elapsed."); }
                 }
                 // Check for RESULTS -> SUBMITTING transition (after results timer)
                 else if (gameState.CurrentPhase == "RESULTS" && gameState.ResultsEndTime != null)
                 {
                      if (DateTimeOffset.UtcNow >= gameState.ResultsEndTime.Value)
                      {
                           Console.WriteLine($"Room '{roomName}' RESULTS timer expired. Starting new round (SUBMITTING).");
                           gameState.CurrentPhase = "SUBMITTING";
                           gameState.ResultsEndTime = null;
                           // Reset state...
                           gameState.SubmittedPlayers.Clear(); gameState.SubmittedSentences.Clear(); gameState.CurrentSentenceWords.Clear(); gameState.Votes.Clear(); gameState.VotedPlayers.Clear(); gameState.Winners.Clear(); gameState.ReadyPlayers.Clear();
                           gameState.AvailableWords = GetNewWordList();
                           gameState.SubmissionEndTime = DateTimeOffset.UtcNow.AddSeconds(SUBMISSION_TIMER_SECONDS);
                           stateChanged = true;
                           nextPhase = "SUBMITTING";
                      } else { Console.WriteLine($"Timer fired for '{roomName}' (RESULTS) but {RESULTS_TIMER_SECONDS}s not yet elapsed."); }
                 }
            } // End locks

            if (stateChanged) {
                 CancelTimer(roomName); 
            }
            // Schedule next timer if needed
            if (nextPhase == "SUBMITTING") {
                 ScheduleStateCheck(roomName, TimeSpan.FromSeconds(SUBMISSION_TIMER_SECONDS));
            } else if (nextPhase == "VOTING") {
                 ScheduleStateCheck(roomName, TimeSpan.FromSeconds(VOTING_TIMER_SECONDS));
            } else if (nextPhase == "RESULTS") {
                 ScheduleStateCheck(roomName, TimeSpan.FromSeconds(RESULTS_TIMER_SECONDS));
            }

            if (stateChanged && gameState != null) {
                 Console.WriteLine($"Broadcasting GameStateUpdated for room '{roomName}' from timer callback. Phase: {gameState.CurrentPhase}");
                 await _hubContext.Clients.Group(roomName).SendAsync("GameStateUpdated", gameState); 
            }
        }

        // Helper to process sentence words (prefix/suffix logic)
        private string ProcessSentence(List<string> words) {
            if (words == null || !words.Any()) return ""; 

            List<string> finalSentenceParts = new List<string>();
            for (int i = 0; i < words.Count; i++) {
                string currentWord = words[i];
                string? prevWord = finalSentenceParts.Count > 0 ? finalSentenceParts.Last() : null;
                string? nextWord = i + 1 < words.Count ? words[i + 1] : null;

                if (currentWord.StartsWith('-')) { 
                    string suffix = currentWord.Substring(1); 
                    if (prevWord != null && finalSentenceParts.Count > 0 && !prevWord.EndsWith('-') && !prevWord.StartsWith('-')) {
                        finalSentenceParts[finalSentenceParts.Count - 1] += suffix; 
                    } else { finalSentenceParts.Add(suffix); }
                } else if (currentWord.EndsWith('-')) { 
                    string prefix = currentWord.Substring(0, currentWord.Length - 1); 
                    if (nextWord != null && !nextWord.StartsWith('-')) { 
                        finalSentenceParts.Add(prefix + nextWord); i++; 
                    } else { finalSentenceParts.Add(prefix); }
                } else { 
                    finalSentenceParts.Add(currentWord);
                }
            }
            return string.Join(' ', finalSentenceParts);
        }

        // Helper to calculate winners
        private void CalculateWinners(GameState gameState) {
             if (gameState.Votes.Any())
             {
                 int maxVotes = gameState.Votes.Values.Max();
                 gameState.Winners = gameState.Votes.Where(pair => pair.Value == maxVotes).Select(pair => pair.Key).ToList();
             }
             else { gameState.Winners = new List<string>(); }
        }


        // --- Dispose Timer ---
        public void Dispose()
        {
            Console.WriteLine("Disposing RoomManagerService timers...");
            lock(_roomTimers)
            {
                foreach (var timer in _roomTimers.Values) { timer.Dispose(); }
                _roomTimers.Clear();
            }
             GC.SuppressFinalize(this);
        }
    }
}
