using Microsoft.AspNetCore.SignalR;
using PsychoRabble.API.Models;
using PsychoRabble.API.Services; // Added for RoomManagerService
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks; 

namespace PsychoRabble.API.Hubs
{
    public class GameHub : Hub
    {
        // Inject RoomManagerService instead of using static dictionaries directly
        private readonly RoomManagerService _roomManager;

        public GameHub(RoomManagerService roomManager)
        {
            _roomManager = roomManager;
        }

        // Helper to safely get player info (avoids repeated lookups in hub methods)
        private PlayerInfo GetCurrentPlayerInfo()
        {
            var playerInfo = _roomManager.GetPlayerInfo(Context.ConnectionId);
            if (playerInfo == null)
            {
                // This should ideally not happen if the connection is active and joined
                // Log error or handle appropriately
                throw new HubException("Player information not found for this connection.");
            }
            return playerInfo;
        }

        public async Task CreateRoom(string roomName)
        {
            var (success, error, room, gameState) = _roomManager.CreateRoom(roomName);
            if (!success)
            {
                throw new HubException(error ?? "Failed to create room.");
            }
            // Notify all clients about the updated list of available rooms
            await Clients.All.SendAsync("AvailableRoomsUpdated", _roomManager.GetRoomInfoList());
        }

        public async Task JoinRoom(string roomName, string playerName)
        {
             var (success, error, playerInfo, gameState) = _roomManager.AddPlayerToRoom(Context.ConnectionId, roomName, playerName);
             
             if (!success || playerInfo == null || gameState == null) {
                 throw new HubException(error ?? "Failed to join room.");
             }

            await Groups.AddToGroupAsync(Context.ConnectionId, roomName);
            // Get updated player list from service
            var room = _roomManager.GetRoomInfo(roomName); // Need a GetRoomInfo method in service
            if (room != null) {
                 await Clients.Group(roomName).SendAsync("PlayersUpdated", room.Players); 
            }
            await Clients.Caller.SendAsync("JoinedRoom", playerInfo, gameState); 
            await Clients.All.SendAsync("AvailableRoomsUpdated", _roomManager.GetRoomInfoList()); 

            // Timer starting logic is now handled within RoomManagerService.AddPlayerToRoom
        }

        public async Task LeaveRoom()
        {
            var (playerInfo, room, gameState, remainingPlayers, roomRemoved) = _roomManager.RemovePlayer(Context.ConnectionId);

            if (playerInfo != null) // Only proceed if the player was actually found and removed
            {
                 await Groups.RemoveFromGroupAsync(Context.ConnectionId, playerInfo.RoomName);
                 if (remainingPlayers != null) {
                     await Clients.Group(playerInfo.RoomName).SendAsync("PlayersUpdated", remainingPlayers);
                 }
                 // If timer was cancelled or room removed, broadcast potentially updated state
                 if (gameState != null && (roomRemoved || (gameState.CurrentPhase == "PENDING" && gameState.RoundStartTime == null))) {
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
            var (success, error, updatedGameState) = _roomManager.SubmitSentence(playerInfo.RoomName, playerInfo.PlayerName, sentence);

            if (!success) {
                 throw new HubException(error ?? "Failed to submit sentence.");
            }
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
            // No need to check round start here anymore, service handles it
            var playerInfo = _roomManager.GetPlayerInfo(Context.ConnectionId);
            return playerInfo != null ? _roomManager.GetGameState(playerInfo.RoomName) : null;
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            // Call LeaveRoom which now uses the service
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
             if (updatedGameState != null) {
                 await Clients.Group(playerInfo.RoomName).SendAsync("GameStateUpdated", updatedGameState);
             }
        }

        public async Task SendMessage(string message)
        {
            if (string.IsNullOrWhiteSpace(message)) return; 
            var playerInfo = GetCurrentPlayerInfo();
            await Clients.Group(playerInfo.RoomName).SendAsync("ReceiveMessage", playerInfo.PlayerName, message);
        }

        // Method for client to update its current sentence state frequently
        public Task UpdateCurrentSentence(List<string> currentWords) 
        {
            var playerInfo = GetCurrentPlayerInfo(); 
            _roomManager.UpdatePlayerSentence(playerInfo.RoomName, playerInfo.PlayerName, currentWords);
            // No broadcast needed here, just update server state
            return Task.CompletedTask; 
        }
    }
}
