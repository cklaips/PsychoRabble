import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { DataItem } from '../data.interface';

interface WordItem {
  text: string;
  used: boolean;
  isDraggedFromSentence?: boolean;
}

@Component({
  selector: 'app-room-view',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container">
      <div class="header">
        <h1>{{ room?.serverName }}</h1>
      </div>
      
      <div class="main-content">
        <div class="game-area">
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
              >
                {{ word }}
                <span class="remove-word" (click)="removeWord(i)">×</span>
              </div>
            </div>
            <div class="sentence-controls">
              <button 
                class="submit-button"
                (click)="onSubmit()"
                [disabled]="sentenceWords.length === 0"
              >
                Submit Sentence
              </button>
              <div *ngIf="generatedSentence" class="generated-sentence">
                {{ generatedSentence }}
              </div>
            </div>
          </div>
        </div>

        <div class="player-list">
          <h2>Players in this room:</h2>
          <ul>
            <li *ngFor="let player of room?.playerNames">{{ player }}</li>
          </ul>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }

    .header {
      margin-bottom: 2rem;
      text-align: center;

      h1 {
        margin: 0;
        color: #2c3e50;
        font-size: 2.5rem;
      }
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
    }

    .sentence-controls {
      margin-top: 1rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      align-items: center;
    }

    .submit-button {
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
        font-size: 1.2rem;
      }

      ul {
        list-style-type: none;
        padding: 0;
        margin: 0;

        li {
          padding: 0.75rem;
          border-bottom: 1px solid #e9ecef;
          color: #495057;

          &:last-child {
            border-bottom: none;
          }
        }
      }
    }
  `]
})
export class RoomViewComponent implements OnInit {
  room: DataItem | null = null;
  availableWords: WordItem[] = [
    { text: 'The', used: false },
    { text: 'quick', used: false },
    { text: 'brown', used: false },
    { text: 'fox', used: false },
    { text: 'jumps', used: false },
    { text: 'over', used: false },
    { text: 'lazy', used: false },
    { text: 'dog', used: false },
    { text: 'In', used: false },
    { text: 'a', used: false },
    { text: 'world', used: false },
    { text: 'full', used: false },
    { text: 'of', used: false },
    { text: 'possibilities', used: false },
    { text: 'dreams', used: false },
    { text: 'come', used: false },
    { text: 'true', used: false }
  ];
  sentenceWords: string[] = [];
  hoverIndex: number | null = null;
  draggedWord: WordItem | null = null;
  generatedSentence: string = '';

  constructor(private route: ActivatedRoute) {}

  ngOnInit() {
    const roomId = this.route.snapshot.paramMap.get('id');
    this.room = {
      serverName: 'Room ' + roomId,
      players: '0/10',
      zip: '00000',
      color: 'Gray',
      playerNames: ['Player 1', 'Player 2', 'Player 3']
    };
  }

  onDragStart(event: DragEvent, word: WordItem) {
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', word.text);
      this.draggedWord = word;
      // Hide the word immediately when dragging starts
      word.used = true;

      // Create a transparent drag image
      const dragImage = document.createElement('div');
      dragImage.style.backgroundColor = '#3498db';
      dragImage.style.color = 'white';
      dragImage.style.padding = '0.5rem 1rem';
      dragImage.style.borderRadius = '20px';
      dragImage.style.position = 'absolute';
      dragImage.style.top = '-1000px';
      dragImage.textContent = word.text;
      document.body.appendChild(dragImage);
      event.dataTransfer.setDragImage(dragImage, 0, 0);
      setTimeout(() => document.body.removeChild(dragImage), 0);
    }
  }

  onDragEnd(event: DragEvent) {
    // If the word wasn't dropped in the sentence, show it in the original list
    if (this.draggedWord) {
      this.draggedWord.used = false;
      this.draggedWord = null;
    }
  }

  onSentenceWordDragStart(event: DragEvent, word: string, index: number) {
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', word);
      // Remove the word from the sentence when starting to drag
      this.sentenceWords.splice(index, 1);
      // Add the word to available words with a special flag
      this.availableWords.push({ text: word, used: false, isDraggedFromSentence: true });

      // Create a transparent drag image
      const dragImage = document.createElement('div');
      dragImage.style.backgroundColor = '#2ecc71';
      dragImage.style.color = 'white';
      dragImage.style.padding = '0.5rem 1rem';
      dragImage.style.borderRadius = '20px';
      dragImage.style.position = 'absolute';
      dragImage.style.top = '-1000px';
      dragImage.textContent = word;
      document.body.appendChild(dragImage);
      event.dataTransfer.setDragImage(dragImage, 0, 0);
      setTimeout(() => document.body.removeChild(dragImage), 0);
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    const container = event.currentTarget as HTMLElement;
    const containerRect = container.getBoundingClientRect();
    const relativeX = event.clientX - containerRect.left;

    // Get all word elements
    const wordElements = container.getElementsByClassName('sentence-word');
    let insertIndex = this.sentenceWords.length; // Default to end

    // Find the insertion point
    for (let i = 0; i < wordElements.length; i++) {
      const wordElement = wordElements[i] as HTMLElement;
      const wordRect = wordElement.getBoundingClientRect();
      const wordLeft = wordRect.left - containerRect.left;
      const wordRight = wordRect.right - containerRect.left;

      // If we're before the middle of the current word
      if (relativeX < (wordLeft + wordRight) / 2) {
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
    this.hoverIndex = null;
    if (event.dataTransfer) {
      const word = event.dataTransfer.getData('text/plain');
      const dropX = event.clientX;
      const container = event.currentTarget as HTMLElement;
      const containerRect = container.getBoundingClientRect();
      const relativeX = dropX - containerRect.left;

      // Get all word elements
      const wordElements = container.getElementsByClassName('sentence-word');
      let insertIndex = this.sentenceWords.length; // Default to end

      // Find the insertion point
      for (let i = 0; i < wordElements.length; i++) {
        const wordElement = wordElements[i] as HTMLElement;
        const wordRect = wordElement.getBoundingClientRect();
        const wordLeft = wordRect.left - containerRect.left;
        const wordRight = wordRect.right - containerRect.left;

        // If we're before the middle of the current word
        if (relativeX < (wordLeft + wordRight) / 2) {
          insertIndex = i;
          break;
        }
      }

      // Insert the word at the calculated position
      this.sentenceWords.splice(insertIndex, 0, word);
      
      // Handle the dragged word
      if (this.draggedWord) {
        // If it was dragged from sentence, remove it from available words
        const wordIndex = this.availableWords.findIndex(w => w.text === word && w.isDraggedFromSentence);
        if (wordIndex !== -1) {
          this.availableWords.splice(wordIndex, 1);
        }
        // Keep the word hidden since it's now in the sentence
        this.draggedWord = null;
      }
    }
  }

  removeWord(index: number) {
    const word = this.sentenceWords[index];
    this.sentenceWords.splice(index, 1);
    this.markWordAsUnused(word);
  }

  private markWordAsUsed(word: string) {
    const wordItem = this.availableWords.find(w => w.text === word);
    if (wordItem) {
      wordItem.used = true;
    }
  }

  private markWordAsUnused(word: string) {
    const wordItem = this.availableWords.find(w => w.text === word);
    if (wordItem) {
      wordItem.used = false;
    }
  }

  onSubmit() {
    this.generatedSentence = this.sentenceWords.join(' ');
  }
} 