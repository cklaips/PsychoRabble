import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RoomInfo } from '../data.interface'; // Use RoomInfo
import { SignalRService } from '../services/signalr.service'; // Import SignalRService
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-main-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './main-page.component.html',
  styleUrls: ['./main-page.component.scss']
})
export class MainPageComponent implements OnInit, OnDestroy {
  playerName: string = '';
  availableRooms: RoomInfo[] = []; // Use RoomInfo array
  selectedRoom: RoomInfo | null = null; // Use RoomInfo
  expandedItem: RoomInfo | null = null; // Use RoomInfo
  newRoomName: string = ''; // For creating new rooms

  private roomsSubscription?: Subscription;

  constructor(
    private router: Router,
    private signalRService: SignalRService // Inject SignalRService
  ) {}

  ngOnInit() {
    this.playerName = localStorage.getItem('playerName') || '';
    if (!this.playerName) {
      // Redirect to name entry if player name is not set
      this.router.navigate(['/']); 
      return;
    }

    // Subscribe to available rooms updates
    this.roomsSubscription = this.signalRService.getAvailableRoomsObservable().subscribe((rooms: RoomInfo[]) => {
      this.availableRooms = rooms;
    });

    // No need to fetch initial list here, service handles it after connection
    // and the subscription above will receive the update.
  }

  ngOnDestroy() {
    this.roomsSubscription?.unsubscribe();
  }

  async onCreateClick() {
    if (!this.newRoomName || !this.playerName) return;
    try {
      await this.signalRService.createRoom(this.newRoomName);
      // After creating, join the room
      await this.signalRService.joinRoom(this.newRoomName, this.playerName);
      // Navigate to the newly created room
      this.router.navigate(['/room', this.newRoomName]);
      this.newRoomName = ''; // Clear input
    } catch (error) {
      console.error('Error creating or joining room:', error);
      // Handle error (e.g., show message to user)
    }
  }

  async onJoinClick() {
    if (this.selectedRoom && this.playerName) {
      try {
        await this.signalRService.joinRoom(this.selectedRoom.name, this.playerName);
        // Navigate after successful join
        this.router.navigate(['/room', this.selectedRoom.name]);
      } catch (error) {
        console.error('Error joining room:', error);
         // Handle error (e.g., show message to user if room is full or name taken)
      }
    }
  }

  onItemClick(room: RoomInfo) { // Parameter is RoomInfo
    this.selectedRoom = room;
    this.expandedItem = this.expandedItem === room ? null : room;
  }

  onLogout() {
    localStorage.removeItem('playerName');
    // Optionally call signalRService.leaveRoom() if connected
    this.router.navigate(['/']);
  }

  // Helper to display player count
  getPlayerCount(room: RoomInfo): string {
    return `${room.players.length}/${room.maxPlayers}`;
  }
}
