import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GameState, RoomInfo } from '../data.interface'; 
import { SignalRService } from '../services/signalr.service';
import { Subscription } from 'rxjs';
import { VotingComponent } from '../voting/voting.component'; 

interface WordItem {
  text: string;
  used: boolean;
  isDraggedFromSentence?: boolean;
}

@Component({
  selector: 'app-room-view',
  standalone: true,
  imports: [CommonModule, FormsModule, VotingComponent], 
  template: `
    <div class="container">
      <div class="header">
        <h1>{{ roomName }}</h1>
        <span class="current-player-name">(Playing as: {{ playerName }})</span> 
        <button class="leave-button" (click)="leaveRoom()">Leave Room</button>
      </div>
      
      <div class="main-content">
        <!-- Conditionally show game area or voting area -->
        <div *ngIf="gameState?.currentPhase === 'SUBMITTING'" class="game-area">
          <div class="word-bank">
            <h2>Available Words:</h2>
            <div class="words-container">
              <div 
                *ngFor="let word of availableWords" 
                class="word-item"
                [class.used]="word.used"
                [class.hidden]="word.used"
                [class.dragged-from-sentence]="word.isDraggedFromSentence"
                draggable="true"
                (dragstart)="onDragStart($event, word)"
                (dragend)="onDragEnd($event)" 
                (dblclick)="addWordToSentence(word)"
              >
                {{ word.text }}
              </div>
            </div>
          </div>

          <div class="sentence-area">
            <h2>Your Sentence:</h2>
            <div 
              class="sentence-container"
              (dragover)="onDragOver($event)"
              (dragleave)="onDragLeave($event)"
              (drop)="onDrop($event)"
            >
              <div 
                *ngFor="let word of sentenceWords; let i = index" 
                class="sentence-word"
                [class.shift-right]="hoverIndex !== null && i >= hoverIndex"
                draggable="true"
                (dragstart)="onSentenceWordDragStart($event, word, i)"
                (dragend)="onDragEnd($event)" 
                (dblclick)="removeWord(i)"
              >
                {{ word }}
                <span class="remove-word" (click)="removeWord(i)" title="Remove word">×</span>
              </div>
            </div>
            <div class="sentence-controls">
              <button 
                class="submit-button"
                (click)="onSubmit()"
                [disabled]="sentenceWords.length === 0 || hasPlayerSubmitted(playerName)" 
              >
                {{ hasPlayerSubmitted(playerName) ? 'Submitted' : 'Submit Sentence' }}
              </button>
              <div *ngIf="generatedSentence" class="generated-sentence">
                {{ generatedSentence }}
              </div>
            </div>
          </div>
        </div>

         <!-- Voting Area -->
         <div *ngIf="gameState?.currentPhase === 'VOTING' && gameState" class="voting-area">
           <h2>Vote for the best sentence!</h2>
           <app-voting 
             [submittedSentences]="gameState.submittedSentences" 
             [currentPlayerName]="playerName"
             [gamePhase]="gameState.currentPhase" 
             [votes]="gameState.votes"
             (voteCast)="onVoteCast($event)">
           </app-voting>
         </div>

         <!-- Results Area -->
          <div *ngIf="gameState?.currentPhase === 'RESULTS' && gameState" class="results-area voting-area"> 
            <h2>Results:</h2>
             <app-voting 
               [submittedSentences]="gameState.submittedSentences" 
               [currentPlayerName]="playerName"
               [gamePhase]="gameState.currentPhase" 
               [votes]="gameState.votes"
               (voteCast)="onVoteCast($event)"> <!-- voteCast won't do anything here, but keep binding -->
             </app-voting>
             <div class="winner-message" *ngIf="gameState.winners && gameState.winners.length > 0">
                <h3>Winner(s): {{ gameState.winners.join(', ') }}! Congratulations!</h3>
             </div>
             <div class="winner-message" *ngIf="!gameState.winners || gameState.winners.length === 0">
                 <h3>It's a tie or no votes were cast!</h3>
             </div>
             <button 
                class="ready-button" 
                (click)="readyUp()" 
                [disabled]="isPlayerReady(playerName)">
                {{ isPlayerReady(playerName) ? 'Ready!' : 'Ready for Next Round?' }}
             </button>
          </div>

        <div class="player-list">
          <h2>Players in this room:</h2>
          <ul>
             <li *ngFor="let player of players">
               {{ player }} 
               <span *ngIf="hasPlayerSubmitted(player)" class="submitted-check" title="Submitted">✓</span>
               <span *ngIf="isPlayerReady(player)" class="ready-check" title="Ready">👍</span>
             </li>
          </ul>
        </div>
      </div>
    </div>
  `,
  styles: [
    // Styles remain the same as before...
    `.container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }

    .header {
      margin-bottom: 2rem;
      text-align: center;
      position: relative; /* Added for button positioning */

      h1 {
        margin: 0;
        color: #2c3e50;
        font-size: 2.5rem;
        display: inline-block; /* Allow button beside it */
        margin-right: 1rem; /* Space for button */
      }
      .current-player-name { /* Style for name display */
          font-size: 0.9rem;
          color: #555;
          margin-left: 10px;
          font-style: italic;
      }
       .leave-button { /* Style for the leave button */
        padding: 0.5rem 1rem;
        background-color: #e74c3c;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        font-size: 0.9rem;
        position: absolute; /* Position relative to header */
        top: 10px; /* Adjust as needed */
        right: 10px; /* Adjust as needed */
        transition: background-color 0.3s ease;

        &:hover {
          background-color: #c0392b;
        }
      }
    }

    .name-entry { /* Keep styles even if element removed from this template */
      display: flex;
      justify-content: center;
      align-items: center;
      margin-bottom: 20px;
    }

    .name-entry input {
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 5px;
      margin-right: 10px;
    }

    .name-entry button {
      padding: 10px 20px;
      background-color: #5cb85c;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
    }

    .main-content {
      display: flex;
      gap: 2rem;
      align-items: flex-start;
    }

    .game-area {
      flex: 1;
      background-color: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      padding: 2rem;

      h2 {
        color: #2c3e50;
        margin-bottom: 1rem;
      }
    }

    .word-bank {
      margin-bottom: 2rem;

      .words-container {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        padding: 1rem;
        background-color: #f8f9fa;
        border-radius: 8px;
        min-height: 60px;
      }
    }

    .word-item {
      background-color: #3498db;
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 20px;
      cursor: move;
      user-select: none;
      transition: all 0.3s ease;
      opacity: 1;
      visibility: visible;

      &:hover {
        background-color: #2980b9;
      }

      &.used {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
      }

      &.dragged-from-sentence {
        background-color: #3498db;
        transform: scale(0.9);
        opacity: 0.8;
      }
      
      &.dragging { /* Style for the word being actively dragged */
        opacity: 0; /* Hide the original element completely */
        visibility: hidden; 
      }
    }

    .sentence-area {
      .sentence-container {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        padding: 1rem;
        background-color: #f8f9fa;
        border-radius: 8px;
        min-height: 60px;
        border: 2px dashed #bdc3c7;
        transition: all 0.3s ease;

        &:hover {
          border-color: #3498db;
          background-color: rgba(52, 152, 219, 0.1);
        }
      }
    }

    .sentence-word {
      background-color: #2ecc71;
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 20px;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      position: relative;
      transition: all 0.3s ease;

      &.shift-right {
        transform: translateX(1rem);
      }

      .remove-word {
        cursor: pointer;
        font-size: 1.2rem;
        line-height: 1;
        
        &:hover {
          opacity: 0.8;
        }
      }
      
      &.dragging { /* Add dragging style for sentence words too */
        opacity: 0; 
        visibility: hidden; 
      }
    }

    .sentence-controls {
      margin-top: 1rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      align-items: center;
    }

    .submit-button, .ready-button { /* Shared styles */
      background-color: #3498db;
      color: white;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      font-size: 1rem;
      cursor: pointer;
      transition: all 0.3s ease;

      &:hover:not(:disabled) {
        background-color: #2980b9;
      }

      &:disabled {
        background-color: #bdc3c7;
        cursor: not-allowed;
      }
    }
     .ready-button { /* Specific styles */
        background-color: #2ecc71; 
         &:hover:not(:disabled) {
            background-color: #27ae60;
         }
     }


    .generated-sentence {
      background-color: #f8f9fa;
      padding: 1rem;
      border-radius: 8px;
      border: 1px solid #e9ecef;
      font-size: 1.1rem;
      color: #2c3e50;
      max-width: 100%;
      word-wrap: break-word;
    }

    .player-list {
      width: 250px;
      background-color: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      padding: 1.5rem;

      h2 {
        color: #2c3e50;
        margin-bottom: 1rem;
      }

      ul {
        list-style: none;
        padding: 0;
        margin: 0;

        li {
          padding: 0.5rem;
          border-bottom: 1px solid #e9ecef;
          color: #2c3e50;

          &:last-child {
            border-bottom: none;
          }
          .submitted-check, .ready-check { /* Combined styles */
            color: green;
            font-weight: bold;
            margin-left: 5px;
          }
        }
      }
    }
    .voting-area, .results-area { /* Basic styling for voting/results area */
       flex: 1;
       background-color: white;
       border-radius: 12px;
       box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
       padding: 2rem;
       ul { list-style: none; padding: 0; }
       li { margin-bottom: 10px; }
       .winner-message { margin-top: 20px; text-align: center; }
    }
  `]
})
export class RoomViewComponent implements OnInit, OnDestroy {
  @Input() roomName: string = '';
  playerName: string = ''; 
  players: string[] = [];
  gameState: GameState | null = null; 
  availableWords: WordItem[] = []; // Initialize as empty, will be populated by server state
  sentenceWords: string[] = [];
  hoverIndex: number | null = null;
  draggedWord: WordItem | null = null; // Word dragged from bank
  draggedSentenceWordIndex: number | null = null; // Index of word dragged from sentence
  generatedSentence: string = '';
  private playersSubscription?: Subscription;
  private routeSubscription?: Subscription; 
  private gameStateSubscription?: Subscription; 
  private playerNameSubscription?: Subscription; 

  constructor(
    private route: ActivatedRoute, 
    private router: Router, 
    private signalRService: SignalRService
  ) { }

  ngOnInit() {
    // Get player name confirmed by the server after joining
    this.playerNameSubscription = this.signalRService.getCurrentPlayerNameObservable().subscribe(name => {
        if (name) {
            this.playerName = name;
            console.log(`Player name set by service: ${this.playerName}`);
        } else {
             // Fallback if name not received from service (e.g., refresh before JoinedRoom event)
             this.playerName = localStorage.getItem('playerName') || 'UnknownPlayer';
             console.warn(`Player name retrieved from localStorage as fallback: ${this.playerName}`);
        }
    });

    // Get room name from route
    this.routeSubscription = this.route.params.subscribe(params => { 
      this.roomName = params['id']; 
      if (!this.roomName) {
           console.error("Room name missing on init.");
           // Redirect? this.router.navigate(['/']); 
      } else {
          // Fetch initial game state for the room upon loading.
          // Note: Player should already be joined from MainPageComponent
          this.signalRService.getGameState().then(state => {
              this.gameState = state;
              if (state) {
                  this.updateAvailableWords(state.availableWords);
              }
          }).catch(err => console.error("Error fetching initial game state:", err));
      }
    });

    this.playersSubscription = this.signalRService.getPlayersObservable().subscribe(players => {
      this.players = players;
    });

    // Subscribe to GameState updates (initial state also pushed by JoinedRoom handler in service)
    this.gameStateSubscription = this.signalRService.getGameStateObservable().subscribe(state => {
        console.log("GameState updated:", state); // Log state updates
        this.gameState = state;
        if (state) {
            this.updateAvailableWords(state.availableWords);
            // Reset sentence if phase changed back to SUBMITTING
            if (state.currentPhase === 'SUBMITTING') {
                this.sentenceWords = [];
                this.generatedSentence = '';
                // Reset available words as well for the new round
                this.updateAvailableWords(state.availableWords); 
            }
        } else {
             this.sentenceWords = []; // Clear sentence on state reset
             this.generatedSentence = '';
        }
    });
  }

  ngOnDestroy() {
    this.playersSubscription?.unsubscribe();
    this.routeSubscription?.unsubscribe(); 
    this.gameStateSubscription?.unsubscribe(); 
    this.playerNameSubscription?.unsubscribe(); 
    // Call leaveRoom when the component is destroyed
    this.signalRService.leaveRoom().catch(err => console.error("Error leaving room on destroy:", err));
  }

  // Add word to sentence on double-click
  addWordToSentence(word: WordItem) {
    if (!word.used) {
      word.used = true;
      this.sentenceWords.push(word.text);
    }
  }

  async leaveRoom() {
    try {
      await this.signalRService.leaveRoom();
      this.router.navigate(['/main']); 
    } catch (error) {
      console.error('Error leaving room:', error);
    }
  }

  onDragStart(event: DragEvent, word: WordItem) {
    if (word.used) {
      event.preventDefault();
      return;
    }
    // Add dragging class to the source element
    (event.target as HTMLElement).classList.add('dragging');

    this.draggedWord = word;
    this.draggedSentenceWordIndex = null; // Clear sentence drag state
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', word.text);
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onDragEnd(event: DragEvent) {
     // Remove dragging class from the source element
    (event.target as HTMLElement).classList.remove('dragging');

    // If a drag from the sentence was started but not successfully dropped in onDrop,
    // return the word to the available list.
    if (this.draggedSentenceWordIndex !== null && event.dataTransfer?.dropEffect !== 'move') { 
        // Word was dragged from sentence but dropped outside target
        // Check if index is valid before accessing sentenceWords
        if (this.draggedSentenceWordIndex !== null && this.draggedSentenceWordIndex >= 0 && this.draggedSentenceWordIndex < this.sentenceWords.length) {
            const wordText = this.sentenceWords[this.draggedSentenceWordIndex]; 
            // Remove from sentence FIRST
            this.sentenceWords.splice(this.draggedSentenceWordIndex, 1); 
            // Then make it available again
            if (wordText) {
                const wordItem = this.availableWords.find(w => w.text === wordText);
                if (wordItem) {
                    wordItem.used = false; 
                }
            }
        } else if (this.draggedSentenceWordIndex !== null) { // Index might be invalid if array changed mid-drag? Log warning.
             console.warn("draggedSentenceWordIndex was invalid or null in onDragEnd during sentence drag cleanup.");
        }
    } 
    // If a drag from the bank was started but not successfully dropped
    else if (this.draggedWord && event.dataTransfer?.dropEffect !== 'move') {
       this.draggedWord.used = false; 
    }
    
    // Clear drag state regardless of success
    this.draggedWord = null; 
    this.draggedSentenceWordIndex = null; 
  }

  onSentenceWordDragStart(event: DragEvent, word: string, index: number) {
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', word);
      event.dataTransfer.effectAllowed = 'move';
      this.draggedSentenceWordIndex = index; // Store index
      this.draggedWord = null; // Clear bank drag state
       // Add dragging class to the source element
      (event.target as HTMLElement).classList.add('dragging');
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    const container = event.currentTarget as HTMLElement;
    const containerRect = container.getBoundingClientRect();
    const relativeX = event.clientX - containerRect.left;
    const wordElements = container.getElementsByClassName('sentence-word');
    let insertIndex = this.sentenceWords.length; 
    for (let i = 0; i < wordElements.length; i++) {
      const wordElement = wordElements[i] as HTMLElement;
      const wordRect = wordElement.getBoundingClientRect();
      const wordMiddle = wordRect.left - containerRect.left + wordRect.width / 2;
      if (relativeX < wordMiddle) {
        insertIndex = i;
        break;
      }
    }
    this.hoverIndex = insertIndex;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.hoverIndex = null;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    const currentHoverIndex = this.hoverIndex; // Capture hover index before using it
    
    if (!event.dataTransfer) {
        this.hoverIndex = null; // Reset if drop is invalid early
        return;
    }
    const text = event.dataTransfer.getData('text/plain');
    if (!text) {
        this.hoverIndex = null; // Reset if drop is invalid early
        return;
    }

    const wordItem = this.availableWords.find(w => w.text === text && !w.used);
    // Use the captured hover index for insertion point calculation
    const insertIndex = currentHoverIndex !== null ? currentHoverIndex : this.sentenceWords.length;

    if (this.draggedSentenceWordIndex !== null) { // Word came from the sentence (reordering)
         // Check if index is valid before accessing sentenceWords
         if (this.draggedSentenceWordIndex >= 0 && this.draggedSentenceWordIndex < this.sentenceWords.length) {
             const wordToMove = this.sentenceWords[this.draggedSentenceWordIndex];
             if (wordToMove === text) { // Verify it's the correct word being dropped
                 this.sentenceWords.splice(this.draggedSentenceWordIndex, 1);
                 // Adjust insert index if the removal affected it
                 const adjustedInsertIndex = (this.draggedSentenceWordIndex < insertIndex) ? insertIndex - 1 : insertIndex;
                 this.sentenceWords.splice(adjustedInsertIndex, 0, text);
             } else {
                 console.error("Mismatched word during sentence reorder drop.");
                 // If mismatch, maybe don't do anything or log error. The word wasn't removed yet.
             }
         } else {
              console.error("Invalid draggedSentenceWordIndex during drop.");
         }
    } else if (wordItem) { // Word came from the bank
        wordItem.used = true;
        this.sentenceWords.splice(insertIndex, 0, text);
    }
    
    // Clear drag state and hover index AFTER processing drop
    this.draggedWord = null; 
    this.draggedSentenceWordIndex = null; 
    this.hoverIndex = null; 
  }

  removeWord(index: number) {
    const word = this.sentenceWords[index];
    this.sentenceWords.splice(index, 1);
    const wordItem = this.availableWords.find(w => w.text === word);
    if (wordItem) {
      wordItem.used = false; 
    }
  }

  onSubmit() {
    // Process sentence for prefixes/suffixes
    let finalSentenceParts: string[] = [];
    for (let i = 0; i < this.sentenceWords.length; i++) {
      const currentWord = this.sentenceWords[i];
      const prevWord = finalSentenceParts.length > 0 ? finalSentenceParts[finalSentenceParts.length - 1] : null;
      const nextWord = i + 1 < this.sentenceWords.length ? this.sentenceWords[i + 1] : null;

      if (currentWord.startsWith('-')) { // It's a suffix
        const suffix = currentWord.substring(1); // Remove leading '-'
        if (prevWord && finalSentenceParts.length > 0) {
          // Append to the previous part if it's not already a prefix/suffix
           if (!prevWord.endsWith('-') && !prevWord.startsWith('-')) {
               finalSentenceParts[finalSentenceParts.length - 1] += suffix; 
           } else {
                finalSentenceParts.push(suffix); // Add suffix as its own word if previous was prefix/suffix
           }
        } else {
          finalSentenceParts.push(suffix); // Add suffix as its own word if it's the first word
        }
      } else if (currentWord.endsWith('-')) { // It's a prefix
        const prefix = currentWord.substring(0, currentWord.length - 1); // Remove trailing '-'
        if (nextWord && !nextWord.startsWith('-')) { // Check if next word exists and is not a suffix
          // Prepend to the next word and add the combined word now, skip next word iteration
          finalSentenceParts.push(prefix + nextWord);
          i++; // Skip the next word since we've combined it
        } else {
          finalSentenceParts.push(prefix); // Add prefix as its own word
        }
      } else { // It's a regular word
        finalSentenceParts.push(currentWord);
      }
    }

    this.generatedSentence = finalSentenceParts.join(' '); // Join with spaces

    // Send the processed sentence to the server
    this.signalRService.submitSentence(this.generatedSentence)
        .catch(err => console.error("Error submitting sentence:", err));
    // Optionally disable button after submitting
  }

  hasPlayerSubmitted(playerName: string): boolean {
      return !!this.gameState?.submittedPlayers?.includes(playerName);
  }

   getSubmittedSentences(): { key: string, value: string }[] {
    if (!this.gameState?.submittedSentences) {
      return [];
    }
    return Object.entries(this.gameState.submittedSentences).map(([key, value]) => ({ key, value }));
  }

  onVoteCast(playerNameToVoteFor: string) { 
      console.log(`Casting vote for ${playerNameToVoteFor}`);
      this.signalRService.castVote(playerNameToVoteFor)
        .catch(err => console.error("Error casting vote:", err)); 
  }

   updateAvailableWords(wordsFromState: string[]) {
       console.log("updateAvailableWords received from server:", wordsFromState); // Log received words
       // Reset used status based on current sentence and available words from state
       this.availableWords = wordsFromState.map(wordText => ({
           text: wordText,
           used: this.sentenceWords.includes(wordText)
       }));
   }

   // Method to call the service for readying up
   readyUp() {
       this.signalRService.readyUp()
           .catch(err => console.error("Error calling readyUp:", err));
       // Optionally disable button immediately after click
   }

   // Helper to check if a player is in the ready list
   isPlayerReady(playerName: string): boolean {
       return !!this.gameState?.readyPlayers?.includes(playerName);
   }
}
