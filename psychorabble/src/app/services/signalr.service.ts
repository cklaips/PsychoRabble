import { Injectable } from '@angular/core';
import { HubConnection, HubConnectionBuilder } from '@microsoft/signalr';
import { BehaviorSubject, Observable } from 'rxjs';
import { RoomInfo, GameState } from '../data.interface';

@Injectable({
  providedIn: 'root'
})
export class SignalRService {
  private hubConnection: HubConnection;
  private currentRoom = new BehaviorSubject<string | null>(null);
  private gameState = new BehaviorSubject<GameState | null>(null);
  private availableRooms = new BehaviorSubject<RoomInfo[]>([]);
  private players = new BehaviorSubject<string[]>([]);
  private currentPlayerName = new BehaviorSubject<string | null>(null); // Added for current player's name

  constructor() {
    this.hubConnection = new HubConnectionBuilder()
      .withUrl('/gamehub') // Corrected path to match server
      .withAutomaticReconnect()
      .build();

    this.setupHubHandlers();
    this.startConnection();
  }

  public async startConnection() {
    try {
      await this.hubConnection.start();
      console.log('SignalR Connection started');
      // Fetch initial list after connection is established
      await this.getAvailableRooms(); 
    } catch (err) {
      console.error('Error while starting SignalR connection: ', err);
      // Attempt to reconnect after a delay
      setTimeout(() => this.startConnection(), 5000);
    }
  }

  private setupHubHandlers() {
    this.hubConnection.on('AvailableRoomsUpdated', (rooms: RoomInfo[]) => {
      this.availableRooms.next(rooms);
    });

    this.hubConnection.on('GameStateUpdated', (gameState: GameState) => {
      this.gameState.next(gameState);
    });

    this.hubConnection.on('PlayersUpdated', (players: string[]) => {
      this.players.next(players);
    });

    // Handle the new event sent from the hub after joining
    this.hubConnection.on('JoinedRoom', (playerInfo: { playerName: string, roomName: string }, initialGameState: GameState | null) => {
      console.log('JoinedRoom event received:', playerInfo, initialGameState);
      this.currentPlayerName.next(playerInfo.playerName); // Store the name confirmed by the server
      this.currentRoom.next(playerInfo.roomName); // Update current room
      this.gameState.next(initialGameState); // Set initial game state
    });
  }

  async createRoom(roomName: string): Promise<string> {
    try {
      await this.hubConnection.invoke('CreateRoom', roomName);
      this.currentRoom.next(roomName);
      return roomName;
    } catch (error) {
      console.error('Error creating room:', error);
      throw error;
    }
  }

  async joinRoom(roomName: string, playerName: string): Promise<void> {
    try {
      await this.hubConnection.invoke('JoinRoom', roomName, playerName);
      this.currentRoom.next(roomName);
    } catch (error) {
      console.error('Error joining room:', error);
      throw error;
    }
  }

  async leaveRoom(): Promise<void> {
    try {
      await this.hubConnection.invoke('LeaveRoom');
      this.currentRoom.next(null);
      this.gameState.next(null);
    } catch (error) {
      console.error('Error leaving room:', error);
      throw error;
    }
  }

  async getAvailableRooms(): Promise<RoomInfo[]> {
    try {
      const rooms = await this.hubConnection.invoke<RoomInfo[]>('GetAvailableRooms');
      this.availableRooms.next(rooms);
      return rooms;
    } catch (error) {
      console.error('Error getting available rooms:', error);
      throw error;
    }
  }

  async submitSentence(sentence: string): Promise<void> {
    try {
      await this.hubConnection.invoke('SubmitSentence', sentence);
    } catch (error) {
      console.error('Error submitting sentence:', error);
      throw error;
    }
  }

  async castVote(votedPlayerName: string): Promise<void> {
    try {
      await this.hubConnection.invoke('CastVote', votedPlayerName);
    } catch (error) {
      console.error('Error casting vote:', error);
      throw error; // Re-throw error to be handled by the component
    }
  }

  // Re-adding GetGameState method to fetch current state if needed
  async getGameState(): Promise<GameState | null> {
    try {
      return await this.hubConnection.invoke<GameState>('GetGameState');
    } catch (error) {
      console.error('Error getting game state:', error);
      return null;
    }
  }

  async readyUp(): Promise<void> {
    try {
      await this.hubConnection.invoke('ReadyUp');
    } catch (error) {
      console.error('Error calling ReadyUp:', error);
      throw error;
    }
  }

  getPlayersObservable(): Observable<string[]> {
    return this.players.asObservable();
  }

  // Add observable getters for components to subscribe to
  getCurrentRoomObservable(): Observable<string | null> {
    return this.currentRoom.asObservable();
  }

  getGameStateObservable(): Observable<GameState | null> {
    return this.gameState.asObservable();
  }

  getAvailableRoomsObservable(): Observable<RoomInfo[]> {
    return this.availableRooms.asObservable();
  }

  // Observable for the current player's confirmed name
  getCurrentPlayerNameObservable(): Observable<string | null> {
      return this.currentPlayerName.asObservable();
  }
}
