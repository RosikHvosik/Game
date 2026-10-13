import Phaser from 'phaser';
import { GameOverData } from './types';

/**
 * Экран конца игры — победа или смерть.
 * Получает данные через init() — стандартный Phaser-способ передачи данных между сценами.
 */
export class GameOverScene extends Phaser.Scene {
  // Данные сохраняем в init(), используем в create()
  private resultData: GameOverData = { roomsCleared: 0, kills: 0, victory: false, level: 1, crystals: 0 };

  constructor() {
    super('GameOverScene');
  }

  // init() вызывается ДО create() и получает переданные данные
  init(data: GameOverData): void {
    this.resultData = data;
  }

  create(): void {
    const { width, height } = this.scale;

    // Тёмный фон
    this.add.rectangle(width / 2, height / 2, width, height, 0x0f172a);

    if (this.resultData.victory) {
      // --- ПОБЕДА ---
      this.add.text(width / 2, height * 0.2, '✦  СВОБОДА  ✦', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '52px',
        color: '#fde68a',
        fontStyle: 'bold',
        stroke: '#78350f',
        strokeThickness: 6,
      }).setOrigin(0.5);

      this.add.text(width / 2, height * 0.38,
        'Принц покинул Небесное Царство.\nОтныне каждый его день — настоящий.', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '21px',
        color: '#cbd5e1',
        align: 'center',
        lineSpacing: 8,
      }).setOrigin(0.5);
    } else {
      // --- ПОРАЖЕНИЕ ---
      this.add.text(width / 2, height * 0.2, 'ПОВЕРЖЕН', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '52px',
        color: '#fca5a5',
        fontStyle: 'bold',
        stroke: '#450a0a',
        strokeThickness: 6,
      }).setOrigin(0.5);

      this.add.text(width / 2, height * 0.38,
        'Стражи не пропустили Принца.\nНебесное Царство держит его в плену.', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '21px',
        color: '#94a3b8',
        align: 'center',
        lineSpacing: 8,
      }).setOrigin(0.5);
    }

    // Статистика
    this.add.text(width / 2, height * 0.60,
      `Залов пройдено: ${this.resultData.roomsCleared} / 4\nУровень Принца: ${this.resultData.level}  |  Кристаллов: ${this.resultData.crystals}\nСтражей побеждено: ${this.resultData.kills}`, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '20px',
      color: '#e2e8f0',
      align: 'center',
      lineSpacing: 8,
    }).setOrigin(0.5);

    // Кнопка рестарта
    this.add.text(width / 2, height * 0.80,
      'Нажми  ПРОБЕЛ  или кликни, чтобы сыграть снова', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '17px',
      color: '#64748b',
    }).setOrigin(0.5);

    // Рестарт по пробелу
    if (this.input.keyboard) {
      this.input.keyboard.once('keydown-SPACE', () => this.scene.start('GameScene'));
    }
    // Рестарт по клику
    this.input.once('pointerdown', () => this.scene.start('GameScene'));
  }
}
