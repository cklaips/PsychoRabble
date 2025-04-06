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
      
      <!-- Main Content Area (Game/Vote/Results) -->
      <div class="main-content-area"> 
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

          <div *ngIf="gameState?.currentPhase === 'RESULTS' && gameState" class="results-area voting-area"> 
            <h2>Results:</h2>
             <app-voting 
               [submittedSentences]="gameState.submittedSentences" 
               [currentPlayerName]="playerName"
               [gamePhase]="gameState.currentPhase" 
               [votes]="gameState.votes"
               (voteCast)="onVoteCast($event)"> 
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
      </div> <!-- End Main Content Area -->

      <!-- Lower Section for Player List and Chat -->
      <div class="lower-section">
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

          <div class="chat-area">
              <h2>Chat</h2>
              <div class="chat-messages">
              <div *ngFor="let msg of chatMessages" class="chat-message">
                  <span class="chat-user">{{ msg.user }}:</span>
                  <span class="chat-text">{{ msg.message }}</span>
              </div>
          </div>
          <div class="chat-input">
              <input 
                  type="text" 
                  placeholder="Type message..." 
                  [(ngModel)]="newMessage" 
                  (keydown.enter)="sendMessage()" />
              <button (click)="sendMessage()" [disabled]="!newMessage.trim()">Send</button>
          </div>
          </div> 
      </div> <!-- End Lower Section -->

    </div> <!-- End Container -->
  `,
  styles: [
    `.container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }

    .header {
      margin-bottom: 1rem; /* Reduced margin */
      display: flex; 
      align-items: center; 
      justify-content: center; 
      position: relative; 

      h1 {
        margin: 0;
        color: #2c3e50;
        font-size: 2.2rem; /* Slightly smaller */
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
        padding: 0.4rem 0.8rem; /* Slightly smaller padding */
        background-color: #e74c3c;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        font-size: 0.8rem; /* Slightly smaller font */
        position: absolute; 
        top: 5px; /* Adjusted position */
        right: 5px; 
        transition: background-color 0.3s ease;

        &:hover {
          background-color: #c0392b;
        }
      }
    }

     .main-content-area { 
        margin-bottom: 2rem; 
     }

    .game-area, .voting-area, .results-area { 
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
      
      &.dragging { 
        opacity: 0; 
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
      
      &.dragging { 
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
    
     .lower-section { /* Container for player list and chat */
        display: flex;
        gap: 2rem;
        align-items: flex-start; 
     }

    .player-list {
      width: 300px; 
      flex-shrink: 0; 
      background-color: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      padding: 1.5rem;
      box-sizing: border-box; 
      height: 250px; /* Reduced height */
      display: flex; /* Added flex to allow scroll */
      flex-direction: column; /* Stack header and list */

      h2 {
        color: #2c3e50;
        margin-top: 0; 
        margin-bottom: 1rem;
        flex-shrink: 0; /* Prevent header from shrinking */
      }

      ul {
        list-style: none;
        padding: 0;
        margin: 0;
        overflow-y: auto; /* Make player list scrollable */
        flex-grow: 1; /* Allow list to take remaining space */

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
       background-color: white;
       border-radius: 12px;
       box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
       padding: 2rem;
       ul { list-style: none; padding: 0; }
       li { margin-bottom: 10px; }
       .winner-message { margin-top: 20px; text-align: center; }
       .ready-button { margin-top: 15px; } 
    }
     /* Removed old .sidebar style */
    .chat-area { 
        flex-grow: 1; 
        background-color: #f0f0f0;
        border-radius: 8px;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        height: 250px; /* Reduced height */
        box-sizing: border-box; 
         h2 {
           color: #2c3e50;
           margin-top: 0;
           margin-bottom: 1rem;
         }
    }
    .chat-messages {
        flex-grow: 1;
        overflow-y: auto; 
        margin-bottom: 10px;
        border: 1px solid #ccc;
        padding: 5px;
        background-color: white;
    }
     .chat-message { margin-bottom: 5px; }
     .chat-user { font-weight: bold; margin-right: 5px; }
     .chat-input { display: flex; gap: 5px; }
     .chat-input input { flex-grow: 1; padding: 5px; border: 1px solid #ccc; border-radius: 3px;}
     .chat-input button { padding: 5px 10px; cursor: pointer; }
  `]
})
export class RoomViewComponent implements OnInit, OnDestroy {
  @Input() roomName: string = '';
  playerName: string = ''; 
  players: string[] = [];
  gameState: GameState | null = null; 
  availableWords: WordItem[] = []; 
  sentenceWords: string[] = [];
  hoverIndex: number | null = null;
  draggedWord: WordItem | null = null; 
  draggedSentenceWordIndex: number | null = null; 
  generatedSentence: string = '';
  chatMessages: { user: string, message: string }[] = [];
  newMessage: string = '';
  private playersSubscription?: Subscription;
  private routeSubscription?: Subscription; 
  private gameStateSubscription?: Subscription; 
  private playerNameSubscription?: Subscription; 
  private chatSubscription?: Subscription; 

  constructor(
    private route: ActivatedRoute, 
    private router: Router, 
    private signalRService: SignalRService
  ) { }

  ngOnInit() {
    this.playerNameSubscription = this.signalRService.getCurrentPlayerNameObservable().subscribe(name => {
        if (name) {
            this.playerName = name;
            console.log(`Player name set by service: ${this.playerName}`);
        } else {
             this.playerName = localStorage.getItem('playerName') || 'UnknownPlayer';
             console.warn(`Player name retrieved from localStorage as fallback: ${this.playerName}`);
        }
    });

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

     this.chatSubscription = this.signalRService.getChatMessagesObservable().subscribe(messages => {
         this.chatMessages = messages;
     });
  }

  ngOnDestroy() {
    this.playersSubscription?.unsubscribe();
    this.routeSubscription?.unsubscribe(); 
    this.gameStateSubscription?.unsubscribe(); 
    this.playerNameSubscription?.unsubscribe(); 
    this.chatSubscription?.unsubscribe(); 
    this.signalRService.leaveRoom().catch(err => console.error("Error leaving room on destroy:", err));
  }

  addWordToSentence(word: WordItem) {
    if (!word.used) {
      word.used = true;
      this.sentenceWords.push(word.text);
    }
  }

  async leaveRoom() {
    try {
      await this.signalRService.leaveRoom();
      this.router.navigate(['/rooms']); 
    } catch (error) {
      console.error('Error leaving room:', error);
    }
  }

  onDragStart(event: DragEvent, word: WordItem) {
    if (word.used) {
      event.preventDefault();
      return;
    }
    (event.target as HTMLElement).classList.add('dragging');
    this.draggedWord = word;
    this.draggedSentenceWordIndex = null; 
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', word.text);
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onDragEnd(event: DragEvent) {
    (event.target as HTMLElement).classList.remove('dragging');
    if (this.draggedSentenceWordIndex !== null && event.dataTransfer?.dropEffect !== 'move') { 
        if (this.draggedSentenceWordIndex !== null && this.draggedSentenceWordIndex >= 0 && this.draggedSentenceWordIndex < this.sentenceWords.length) {
            const wordText = this.sentenceWords[this.draggedSentenceWordIndex]; 
            this.sentenceWords.splice(this.draggedSentenceWordIndex, 1); 
            if (wordText) {
                const wordItem = this.availableWords.find(w => w.text === wordText);
                if (wordItem) {
                    wordItem.used = false; 
                }
            }
        } else if (this.draggedSentenceWordIndex !== null) { 
             console.warn("draggedSentenceWordIndex was invalid or null in onDragEnd during sentence drag cleanup.");
        }
    } 
    else if (this.draggedWord && event.dataTransfer?.dropEffect !== 'move') {
       this.draggedWord.used = false; 
    }
    this.draggedWord = null; 
    this.draggedSentenceWordIndex = null; 
  }

  onSentenceWordDragStart(event: DragEvent, word: string, index: number) {
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', word);
      event.dataTransfer.effectAllowed = 'move';
      this.draggedSentenceWordIndex = index; 
      this.draggedWord = null; 
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
    const currentHoverIndex = this.hoverIndex; 
    
    if (!event.dataTransfer) {
        this.hoverIndex = null; 
        return;
    }
    const text = event.dataTransfer.getData('text/plain');
    if (!text) {
        this.hoverIndex = null; 
        return;
    }

    const wordItem = this.availableWords.find(w => w.text === text && !w.used);
    const insertIndex = currentHoverIndex !== null ? currentHoverIndex : this.sentenceWords.length;

    if (this.draggedSentenceWordIndex !== null) { 
         if (this.draggedSentenceWordIndex >= 0 && this.draggedSentenceWordIndex < this.sentenceWords.length) {
             const wordToMove = this.sentenceWords[this.draggedSentenceWordIndex];
             if (wordToMove === text) { 
                 this.sentenceWords.splice(this.draggedSentenceWordIndex, 1);
                 const adjustedInsertIndex = (this.draggedSentenceWordIndex < insertIndex) ? insertIndex - 1 : insertIndex;
                 this.sentenceWords.splice(adjustedInsertIndex, 0, text);
             } else {
                 console.error("Mismatched word during sentence reorder drop.");
             }
         } else {
              console.error("Invalid draggedSentenceWordIndex during drop.");
         }
    } else if (wordItem) { 
        wordItem.used = true;
        this.sentenceWords.splice(insertIndex, 0, text);
    }
    
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
    let finalSentenceParts: string[] = [];
    for (let i = 0; i < this.sentenceWords.length; i++) {
      const currentWord = this.sentenceWords[i];
      const prevWord = finalSentenceParts.length > 0 ? finalSentenceParts[finalSentenceParts.length - 1] : null;
      const nextWord = i + 1 < this.sentenceWords.length ? this.sentenceWords[i + 1] : null;

      if (currentWord.startsWith('-')) { 
        const suffix = currentWord.substring(1); 
        if (prevWord && finalSentenceParts.length > 0) {
           if (!prevWord.endsWith('-') && !prevWord.startsWith('-')) {
               finalSentenceParts[finalSentenceParts.length - 1] += suffix; 
           } else {
                finalSentenceParts.push(suffix); 
           }
        } else {
          finalSentenceParts.push(suffix); 
        }
      } else if (currentWord.endsWith('-')) { 
        const prefix = currentWord.substring(0, currentWord.length - 1); 
        if (nextWord && !nextWord.startsWith('-')) { 
          finalSentenceParts.push(prefix + nextWord);
          i++; 
        } else {
          finalSentenceParts.push(prefix); 
        }
      } else { 
        finalSentenceParts.push(currentWord);
      }
    }
    this.generatedSentence = finalSentenceParts.join(' '); 
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
       console.log("updateAvailableWords received from server:", wordsFromState); 
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

   sendMessage() {
       if (this.newMessage.trim()) {
           this.signalRService.sendMessage(this.newMessage.trim())
               .then(() => {
                   this.newMessage = ''; 
               })
               .catch(err => console.error("Error sending message:", err));
       }
   }
}
