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
  isDraggedFromSentence?: boolean; // This might not be needed anymore
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
                [class.hidden]="word.used" 
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
      position: relative; 

      h1 {
        margin: 0;
        color: #2c3e50;
        font-size: 2.5rem;
        display: inline-block; 
        margin-right: 1rem; 
      }
      .current-player-name { 
          font-size: 0.9rem;
          color: #555;
          margin-left: 10px;
          font-style: italic;
      }
       .leave-button { 
        padding: 0.5rem 1rem;
        background-color: #e74c3c;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        font-size: 0.9rem;
        position: absolute; 
        top: 10px; 
        right: 10px; 
        transition: background-color 0.3s ease;

        &:hover {
          background-color: #c0392b;
        }
      }
    }

    .name-entry { 
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
      transition: opacity 0.3s ease, visibility 0.3s ease; /* Added transition */
      opacity: 1;
      visibility: visible;

      &:hover {
        background-color: #2980b9;
      }

      &.hidden { /* Renamed from .used for clarity */
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
      }
      /* Removed .dragging and .dragged-from-sentence */
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
      cursor: move; /* Add move cursor */

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
    }

    .sentence-controls {
      margin-top: 1rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      align-items: center;
    }

    .submit-button, .ready-button { 
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
     .ready-button { 
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
          .submitted-check, .ready-check { 
            color: green;
            font-weight: bold;
            margin-left: 5px;
          }
        }
      }
    }
    .voting-area, .results-area { 
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

  availableWords: WordItem[] = [
    { text: 'The', used: false }, { text: 'quick', used: false }, { text: 'brown', used: false }, { text: 'fox', used: false }, { text: 'jumps', used: false }, { text: 'over', used: false }, { text: 'lazy', used: false }, { text: 'dog', used: false }, { text: 'in', used: false }, { text: 'the', used: false }, { text: 'park', used: false }, { text: 'today', used: false }
  ];
  sentenceWords: string[] = [];
  hoverIndex: number | null = null;
  // Remove draggedWord and draggedSentenceWordIndex properties as they are handled differently now
  // draggedWord: WordItem | null = null; 
  // draggedSentenceWordIndex: number | null = null; 
  draggedWordText: string | null = null; // Store text of dragged item
  isDraggingFromSentence: boolean = false; // Flag if drag started from sentence

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
             this.playerName = localStorage.getItem('playerName') || 'UnknownPlayer';
             console.warn(`Player name retrieved from localStorage as fallback: ${this.playerName}`);
        }
    });

    // Get room name from route
    this.routeSubscription = this.route.params.subscribe(params => { 
      this.roomName = params['id']; 
      if (!this.roomName) {
           console.error("Room name missing on init.");
      } else {
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

    // Subscribe to GameState updates
    this.gameStateSubscription = this.signalRService.getGameStateObservable().subscribe(state => {
        console.log("GameState updated:", state); 
        this.gameState = state;
        if (state) {
            this.updateAvailableWords(state.availableWords);
            if (state.currentPhase === 'SUBMITTING') {
                this.sentenceWords = [];
                this.generatedSentence = '';
                this.updateAvailableWords(state.availableWords); 
            }
        } else {
             this.sentenceWords = []; 
             this.generatedSentence = '';
        }
    });
  }

  ngOnDestroy() {
    this.playersSubscription?.unsubscribe();
    this.routeSubscription?.unsubscribe(); 
    this.gameStateSubscription?.unsubscribe(); 
    this.playerNameSubscription?.unsubscribe(); 
    this.signalRService.leaveRoom().catch(err => console.error("Error leaving room on destroy:", err));
  }

  addWordToSentence(word: WordItem) {
    if (!word.used) {
      word.used = true; // Mark as used in the available list
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

  // Drag from Word Bank
  onDragStart(event: DragEvent, word: WordItem) {
    if (word.used) {
      event.preventDefault();
      return;
    }
    this.isDraggingFromSentence = false;
    this.draggedWordText = word.text; 
    // Mark as used immediately for visual feedback
    word.used = true; 
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', word.text);
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  // Drag from Sentence Area
  onSentenceWordDragStart(event: DragEvent, word: string, index: number) {
     this.isDraggingFromSentence = true;
     this.draggedWordText = word; 
     // Find the corresponding item in availableWords and mark it used (it should be already, but just in case)
     const wordItem = this.availableWords.find(w => w.text === word);
     if (wordItem) wordItem.used = true; 
     
     // Remove from sentence array immediately for visual feedback during drag
     this.sentenceWords.splice(index, 1); 

     if (event.dataTransfer) {
       event.dataTransfer.setData('text/plain', word);
       event.dataTransfer.effectAllowed = 'move';
     }
  }

  onDragEnd(event: DragEvent) {
    // If drag failed (not dropped in a valid zone)
    if (event.dataTransfer?.dropEffect !== 'move' && this.draggedWordText) {
       // Find the word in availableWords and mark it as unused
       const wordItem = this.availableWords.find(w => w.text === this.draggedWordText);
       if (wordItem) {
           wordItem.used = false;
       }
       // If it was dragged from the sentence, it was already removed in onSentenceWordDragStart,
       // so setting used=false makes it available again correctly.
    }
    // Clear drag state
    this.draggedWordText = null; 
    this.isDraggingFromSentence = false;
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
    const currentHoverIndex = this.hoverIndex; 
    this.hoverIndex = null; 
    if (!event.dataTransfer) return;
    const text = event.dataTransfer.getData('text/plain');
    if (!text) return;

    // Use the captured hover index for insertion point calculation
    const insertIndex = currentHoverIndex !== null ? currentHoverIndex : this.sentenceWords.length;

    // Regardless of origin, just insert the word text at the calculated index
    // The 'used' status was handled in onDragStart / onSentenceWordDragStart
    // If it was dragged from the sentence, it was already removed in onSentenceWordDragStart
    this.sentenceWords.splice(insertIndex, 0, text);

    // Ensure the corresponding item in availableWords is marked as used
    const wordItem = this.availableWords.find(w => w.text === text);
    if (wordItem) {
        wordItem.used = true;
    }

    // Clear drag state AFTER processing drop
    this.draggedWordText = null; 
    this.isDraggingFromSentence = false;
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
    this.generatedSentence = this.sentenceWords.join(' ');
    this.signalRService.submitSentence(this.generatedSentence)
        .catch(err => console.error("Error submitting sentence:", err));
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
       // Reset used status based on current sentence and available words from state
       this.availableWords = wordsFromState.map(wordText => ({
           text: wordText,
           used: this.sentenceWords.includes(wordText) 
       }));
   }

   readyUp() {
       this.signalRService.readyUp()
           .catch(err => console.error("Error calling readyUp:", err));
   }

   isPlayerReady(playerName: string): boolean {
       return !!this.gameState?.readyPlayers?.includes(playerName);
   }
}
