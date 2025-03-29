import { Routes } from '@angular/router';
import { MainPageComponent } from './main-page/main-page.component';
import { RoomViewComponent } from './room-view/room-view.component';
import { NameEntryComponent } from './name-entry/name-entry.component';

export const routes: Routes = [
  { path: '', component: NameEntryComponent },
  { 
    path: 'rooms', 
    component: MainPageComponent,
    canActivate: [() => {
      return localStorage.getItem('playerName') !== null;
    }]
  },
  { path: 'room/:id', component: RoomViewComponent },
  { path: '**', redirectTo: '' }
];
