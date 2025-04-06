using Microsoft.AspNetCore.SignalR;
using PsychoRabble.API.Models;
using PsychoRabble.API.Services; // Ensure this is present
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks; 

namespace PsychoRabble.API.Hubs
{
    public class GameHub : Hub
    {
        private readonly RoomManagerService _roomManager;

        public GameHub(RoomManagerService roomManager)
        {
            _roomManager = roomManager;
        }

        private PlayerInfo GetCurrentPlayerInfo()
        {
            var playerInfo = _roomManager.GetPlayerInfo(Context.ConnectionId);
            if (playerInfo == null)
            {
                throw new HubException("Player information not found for this connection.");
            }
            return playerInfo;
        }

        public async Task CreateRoom(string roomName)
        {
            var (success, error, _, _) = _roomManager.CreateRoom(roomName); // Discard room/gameState return if not needed here
            if (!success)
            {
                throw new HubException(error ?? "Failed to create room.");
            }
            await Clients.All.SendAsync("AvailableRoomsUpdated", _roomManager.GetRoomInfoList());
        }

        public async Task JoinRoom(string roomName, string playerName)
        {
             var (success, error, playerInfo, gameState) = _roomManager.AddPlayerToRoom(Context.ConnectionId, roomName, playerName);
             
             if (!success || playerInfo == null || gameState == null) {
                 throw new HubException(error ?? "Failed to join room.");
             }

            await Groups.AddToGroupAsync(Context.ConnectionId, roomName);
            var room = _roomManager.GetRoomInfo(roomName); 
            if (room != null) {
                 await Clients.Group(roomName).SendAsync("PlayersUpdated", room.Players); 
            }
            await Clients.Caller.SendAsync("JoinedRoom", playerInfo, gameState); 
            await Clients.All.SendAsync("AvailableRoomsUpdated", _roomManager.GetRoomInfoList()); 
            // Timer starting logic is handled by the service
        }

        public async Task LeaveRoom()
        {
            // RemovePlayer returns if state changed and the potentially updated state
            var (playerInfo, stateChanged, gameState, remainingPlayers, roomRemoved) = _roomManager.RemovePlayer(Context.ConnectionId);

            if (playerInfo != null) 
            {
                 await Groups.RemoveFromGroupAsync(Context.ConnectionId, playerInfo.RoomName);
                 if (remainingPlayers != null) {
                     await Clients.Group(playerInfo.RoomName).SendAsync("PlayersUpdated", remainingPlayers);
                 }
                 // Broadcast state *only if* it actually changed due to leave (e.g., timer cancelled, phase advanced)
                 if (stateChanged && gameState != null) { 
                     await Clients.Group(playerInfo.RoomName).SendAsync("GameStateUpdated", gameState);
                 }
                 // Always update room list for everyone
                 await Clients.All.SendAsync("AvailableRoomsUpdated", _roomManager.GetRoomInfoList()); 
            }
        }

        public async Task<List<RoomInfo>> GetAvailableRooms()
        {
             return _roomManager.GetRoomInfoList();
        }

        public async Task SubmitSentence(string sentence)
        {
            var playerInfo = GetCurrentPlayerInfo();
            // Service method now returns the updated state which might have changed phase
            var (success, error, updatedGameState) = _roomManager.SubmitSentence(playerInfo.RoomName, playerInfo.PlayerName, sentence);

            if (!success) {
                 throw new HubException(error ?? "Failed to submit sentence.");
            }
            // Broadcast the result from the service call
            if (updatedGameState != null) { 
                 await Clients.Group(playerInfo.RoomName).SendAsync("GameStateUpdated", updatedGameState);
            }
        }

        public async Task CastVote(string votedPlayerName)
        {
             var playerInfo = GetCurrentPlayerInfo();
             var (success, error, updatedGameState) = _roomManager.CastVote(playerInfo.RoomName, playerInfo.PlayerName, votedPlayerName);
             
             if (!success) {
                 throw new HubException(error ?? "Failed to cast vote.");
             }
             if (updatedGameState != null) {
                 await Clients.Group(playerInfo.RoomName).SendAsync("GameStateUpdated", updatedGameState);
             }
        }

        public async Task<GameState?> GetGameState()
        {
            // Service method GetGameState doesn't modify state, just retrieves
            var playerInfo = _roomManager.GetPlayerInfo(Context.ConnectionId);
            return playerInfo != null ? _roomManager.GetGameState(playerInfo.RoomName) : null;
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            await LeaveRoom(); 
            await base.OnDisconnectedAsync(exception);
        }

        public async Task ReadyUp()
        {
            var playerInfo = GetCurrentPlayerInfo();
            var (success, error, updatedGameState) = _roomManager.ReadyUp(playerInfo.RoomName, playerInfo.PlayerName);

             if (!success) {
                 throw new HubException(error ?? "Failed to ready up.");
             }
             // Broadcast the result from the service call
             if (updatedGameState != null) {
                 await Clients.Group(playerInfo.RoomName).SendAsync("GameStateUpdated", updatedGameState);
             }
        }

        public async Task SendMessage(string message)
        {
            if (string.IsNullOrWhiteSpace(message)) return; 
            var playerInfo = GetCurrentPlayerInfo();
            // Send directly, no state change expected
            await Clients.Group(playerInfo.RoomName).SendAsync("ReceiveMessage", playerInfo.PlayerName, message);
        }

        // Client frequently updates its current sentence state
        public Task UpdateCurrentSentence(List<string> currentWords) 
        {
            var playerInfo = GetCurrentPlayerInfo(); 
            _roomManager.UpdatePlayerSentence(playerInfo.RoomName, playerInfo.PlayerName, currentWords);
            return Task.CompletedTask; 
        }
    }
}
