import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DataItem } from '../data.interface';

@Component({
  selector: 'app-main-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './main-page.component.html',
  styleUrls: ['./main-page.component.scss']
})
export class MainPageComponent implements OnInit {
  playerName: string = '';

  dataItems: DataItem[] = [
    { 
      serverName: 'Casual Game Room', 
      players: '6/9', 
      zip: '10001', 
      color: 'Blue',
      playerNames: ['Player1', 'Player2', 'Player3', 'Player4', 'Player5', 'Player6']
    },
    { 
      serverName: 'Competitive Arena', 
      players: '8/10', 
      zip: '90001', 
      color: 'Red',
      playerNames: ['Pro1', 'Pro2', 'Pro3', 'Pro4', 'Pro5', 'Pro6', 'Pro7', 'Pro8']
    },
    { 
      serverName: 'Beginner Friendly', 
      players: '3/8', 
      zip: '60601', 
      color: 'Green',
      playerNames: ['Newbie1', 'Newbie2', 'Newbie3']
    },
    { 
      serverName: 'Pro League', 
      players: '9/10', 
      zip: '77001', 
      color: 'Yellow',
      playerNames: ['Elite1', 'Elite2', 'Elite3', 'Elite4', 'Elite5', 'Elite6', 'Elite7', 'Elite8', 'Elite9']
    },
    { 
      serverName: 'Training Grounds', 
      players: '2/6', 
      zip: '85001', 
      color: 'Purple',
      playerNames: ['Trainee1', 'Trainee2']
    }
  ];

  selectedItem: DataItem | null = null;
  expandedItem: DataItem | null = null;

  constructor(private router: Router) {}

  ngOnInit() {
    this.playerName = localStorage.getItem('playerName') || '';
    if (!this.playerName) {
      this.router.navigate(['/']);
    }
  }

  onCreateClick() {
    console.log('Create button clicked');
  }

  onJoinClick() {
    if (this.selectedItem) {
      // Navigate to the room view with the selected item's index as the ID
      const roomId = this.dataItems.indexOf(this.selectedItem);
      this.router.navigate(['/room', roomId]);
    }
  }

  onItemClick(item: DataItem) {
    this.selectedItem = item;
    this.expandedItem = this.expandedItem === item ? null : item;
  }

  onLogout() {
    localStorage.removeItem('playerName');
    this.router.navigate(['/']);
  }
}
