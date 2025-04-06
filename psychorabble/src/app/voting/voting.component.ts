import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-voting',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div>
      <!-- Title changes based on phase -->
      <h3 *ngIf="gamePhase === 'VOTING'">Cast Your Vote:</h3>
      <h3 *ngIf="gamePhase === 'RESULTS'">Results:</h3>
      
      <ul>
        <li *ngFor="let sentence of submittedSentencesArray">
          <div class="sentence-entry">
             <!-- Column 1: Votes (only in results) -->
             <span class="votes" *ngIf="gamePhase === 'RESULTS'">{{ getStars(votes[sentence.key] || 0) }}</span>
             <!-- Column 2: Sentence -->
             <span class="sentence-text">"{{ sentence.value }}"</span>
             <!-- Column 3: Author (only in results) -->
             <span class="sentence-author" *ngIf="gamePhase === 'RESULTS'">{{ sentence.key }}</span>
             <!-- Vote Button (only in voting) -->
             <button 
               *ngIf="gamePhase === 'VOTING'"
               (click)="castVote(sentence.key)" 
               [disabled]="hasVoted || sentence.key === currentPlayerName"> 
               Vote
             </button>
          </div>
        </li>
      </ul>
       <p *ngIf="hasVoted">Vote cast!</p> 
    </div>
  `,
  styles: [`
    ul { list-style: none; padding: 0; }
    li { margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee; }
    .sentence-entry { 
        display: flex; 
        align-items: center; 
        gap: 15px; /* Increased gap */
        /* Removed flex-wrap: wrap; to keep columns */
    }
    .votes { 
        min-width: 60px; /* Give stars some space */
        text-align: right; 
        font-size: 1.1em; /* Make stars slightly bigger */
    }
    .sentence-text { 
        font-style: italic; 
        flex-grow: 1; /* Allow sentence to take up remaining space */
        text-align: left; /* Ensure left alignment */
    }
    .sentence-author { 
        font-size: 0.9em; 
        color: #555; 
        min-width: 80px; /* Give author name some space */
        text-align: left;
    }
    button { 
        padding: 5px 10px; 
        cursor: pointer; 
        background-color: #3498db; 
        color: white; 
        border: none; 
        border-radius: 4px;
        transition: background-color 0.3s ease;
    }
     button:hover:not(:disabled) { background-color: #2980b9; }
     button:disabled { background-color: #bdc3c7; cursor: not-allowed; }
  `]
})
export class VotingComponent {
  // Input for the dictionary of sentences { playerName: sentence }
  @Input() submittedSentences: { [playerName: string]: string } = {};
  // Input for the current player's name to disable voting for self
  @Input() currentPlayerName: string = ''; 
  // Input for the current game phase
  @Input() gamePhase: string = ''; 
  // Input for the vote counts
  @Input() votes: { [playerName: string]: number } = {};

  // Output event when a vote is cast
  @Output() voteCast = new EventEmitter<string>();

  hasVoted: boolean = false; // Simple flag to prevent multiple votes

  // Convert dictionary to array for easy iteration in the template
  get submittedSentencesArray(): { key: string, value: string }[] {
    // Ensure submittedSentences is not null or undefined before processing
    return Object.entries(this.submittedSentences || {}).map(([key, value]) => ({ key, value }));
  }

  castVote(playerNameToVoteFor: string) {
    // Check if already voted OR trying to vote for self
    if (!this.hasVoted && playerNameToVoteFor !== this.currentPlayerName) {
      this.hasVoted = true; // Mark as voted to disable further voting
      this.voteCast.emit(playerNameToVoteFor); // Emit the name of the player voted for
    }
  }

  // Helper to generate star emojis based on vote count
  getStars(count: number): string {
    return '⭐'.repeat(count);
  }
}
