import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-name-entry',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="container">
      <div class="name-entry-card">
        <h1>Welcome to Psychorabble</h1>
        <p>Please enter your name to continue:</p>
        <form (ngSubmit)="onSubmit()">
          <div class="input-group">
            <input 
              type="text" 
              [(ngModel)]="playerName" 
              name="playerName" 
              placeholder="Enter your name"
              required
            >
          </div>
          <button type="submit" [disabled]="!playerName.trim()">
            Continue
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background-color: #f8f9fa;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }

    .name-entry-card {
      background-color: white;
      padding: 2rem;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      width: 100%;
      max-width: 400px;
      text-align: center;

      h1 {
        color: #2c3e50;
        margin-bottom: 1rem;
      }

      p {
        color: #495057;
        margin-bottom: 1.5rem;
      }

      .input-group {
        margin-bottom: 1.5rem;

        input {
          width: 100%;
          padding: 0.75rem;
          border: 2px solid #e9ecef;
          border-radius: 8px;
          font-size: 1rem;
          transition: border-color 0.3s ease;

          &:focus {
            outline: none;
            border-color: #3498db;
          }
        }
      }

      button {
        background-color: #3498db;
        color: white;
        border: none;
        padding: 0.75rem 2rem;
        border-radius: 8px;
        font-size: 1rem;
        cursor: pointer;
        transition: background-color 0.3s ease;

        &:hover:not(:disabled) {
          background-color: #2980b9;
        }

        &:disabled {
          background-color: #bdc3c7;
          cursor: not-allowed;
        }
      }
    }
  `]
})
export class NameEntryComponent {
  playerName: string = '';

  constructor(private router: Router) {}

  onSubmit() {
    if (this.playerName.trim()) {
      // Store the player name in localStorage
      localStorage.setItem('playerName', this.playerName.trim());
      // Navigate to the main page
      this.router.navigate(['/rooms']);
    }
  }
} 