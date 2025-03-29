import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataItem } from './data.interface';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  dataItems: DataItem[] = [
    { city: 'New York', state: 'NY', zip: '10001', color: 'Blue' },
    { city: 'Los Angeles', state: 'CA', zip: '90001', color: 'Red' },
    { city: 'Chicago', state: 'IL', zip: '60601', color: 'Green' },
    { city: 'Houston', state: 'TX', zip: '77001', color: 'Yellow' },
    { city: 'Phoenix', state: 'AZ', zip: '85001', color: 'Purple' }
  ];

  onCreateClick() {
    console.log('Create button clicked');
  }

  onJoinClick() {
    console.log('Join button clicked');
  }
} 