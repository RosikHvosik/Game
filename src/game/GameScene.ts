import Phaser from 'phaser';
import { GameOverData } from './types';

// ================================================================
// КОНСТАНТЫ БАЛАНСА VAMPIRE SURVIVORS
// ================================================================

const STAGE_DURATION_SEC = 60; // Длительность одного зала в секундах
const TOTAL_STAGES = 3;        // 3 зала нарастающей сложности до Победы

// Базовые параметры игрока
const BASE_PLAYER_SPEED = 240;
const BASE_PLAYER_MAX_HP = 100;
const BASE_SWORD_DAMAGE = 35;
const BASE_SWORD_COOLDOWN = 650; // мс между ударами меча
const BASE_MAGNET_RADIUS = 100;  // радиус притягивания кристаллов

// Параметры врагов
const GUARD_BASE_HP = 40;
const GUARD_BASE_SPEED = 75;
const GUARD_BASE_DAMAGE = 10;

const SCOUT_BASE_HP = 22;
const SCOUT_BASE_SPEED = 145;
const SCOUT_BASE_DAMAGE = 7;

const COMMANDER_BASE_HP = 140;
const COMMANDER_BASE_SPEED = 60;
const COMMANDER_BASE_DAMAGE = 18;

// ================================================================
// ТИПЫ
// ================================================================
type EnemyType = 'guard' | 'scout' | 'commander';

interface Enemy {
  sprite: Phaser.GameObjects.Image;
  hpBarBg: Phaser.GameObjects.Rectangle;
  hpBar: Phaser.GameObjects.Rectangle;
  type: EnemyType;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  lastHitTime: number;
  lastOrbHitTime: number;
  alive: boolean;
}

interface Crystal {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  xpValue: number;
  collected: boolean;
}

interface SkillDef {
  id: string;
  name: string;
  icon: string;
  maxLevel: number;
  getDescription: (lvl: number) => string;
}

// ================================================================
// СЦЕНА В СТИЛЕ VAMPIRE SURVIVORS
// ================================================================
export class GameScene extends Phaser.Scene {
  // Игрок
  private player!: Phaser.GameObjects.Image;
  private playerHP = BASE_PLAYER_MAX_HP;
  private playerMaxHP = BASE_PLAYER_MAX_HP;
  private playerSpeed = BASE_PLAYER_SPEED;
  private facingX = 1;
  private facingY = 0;
  private isBlocking = false;
  private lastDamageTime = 0;

  // Опыт и уровни
  private playerLevel = 1;
  private currentXP = 0;
  private nextLevelXP = 20;
  private isLevelingUp = false;

  // Прокачиваемые навыки
  private skills: Record<string, number> = {
    sword: 1,     // Священный клинок
    orbs: 0,      // Орбитальные сферы
    aura: 0,      // Аура света
    smite: 0,     // Небесная молния
    boots: 0,     // Скорость бега
    heart: 0,     // Макс HP и регенерация
    magnet: 0,    // Магнит кристаллов
  };

  // Способности в бою
  private orbSprites: Phaser.GameObjects.Image[] = [];
  private orbAngle = 0;
  private auraCircle: Phaser.GameObjects.Arc | null = null;
  private lastSwordTime = 0;
  private lastAuraTick = 0;
  private lastSmiteTime = 0;
  private attackSprite: Phaser.GameObjects.Image | null = null;
  private attackTimer = 0;

  // Таймер зала и волны
  private stage = 1;
  private stageTimer = STAGE_DURATION_SEC;
  private spawnCooldown = 0;
  private kills = 0;
  private totalCrystals = 0;
  private transitioning = false;

  // Бесконечная карта
  private floorTile!: Phaser.GameObjects.TileSprite;

  // Сущности
  private enemies: Enemy[] = [];
  private crystals: Crystal[] = [];

  // UI (с setScrollFactor(0))
  private xpFill!: Phaser.GameObjects.Rectangle;
  private xpText!: Phaser.GameObjects.Text;
  private hpFill!: Phaser.GameObjects.Rectangle;
  private hpText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private stageText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private blockLabel!: Phaser.GameObjects.Text;
  private upgradeModalContainer: Phaser.GameObjects.Container | null = null;

  // Управление
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private keyZ!: Phaser.Input.Keyboard.Key;
  private keyX!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyShift!: Phaser.Input.Keyboard.Key;
  private key1!: Phaser.Input.Keyboard.Key;
  private key2!: Phaser.Input.Keyboard.Key;
  private key3!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('GameScene');
  }

  // ---------------------------------------------------------------
  // ЗАГРУЗКА СПРАЙТОВ
  // ---------------------------------------------------------------
  preload(): void {
    this.load.svg('player', 'assets/player.svg', { width: 56, height: 56 });
    this.load.svg('guard', 'assets/guard.svg', { width: 54, height: 54 });
    this.load.svg('scout', 'assets/scout.svg', { width: 42, height: 42 });
    this.load.svg('crystal', 'assets/crystal.svg', { width: 26, height: 26 });
    this.load.svg('slash', 'assets/slash.svg', { width: 64, height: 64 });
    this.load.svg('orb', 'assets/orb.svg', { width: 32, height: 32 });
    this.load.svg('floor', 'assets/floor.svg', { width: 128, height: 128 });
    this.load.svg('lightning', 'assets/lightning.svg', { width: 44, height: 120 });
  }

  // ---------------------------------------------------------------
  // ИНИЦИАЛИЗАЦИЯ
  // ---------------------------------------------------------------
  create(): void {
    const { width, height } = this.scale;

    // Сброс состояния
    this.playerHP = BASE_PLAYER_MAX_HP;
    this.playerMaxHP = BASE_PLAYER_MAX_HP;
    this.playerSpeed = BASE_PLAYER_SPEED;
    this.playerLevel = 1;
    this.currentXP = 0;
    this.nextLevelXP = 20;
    this.isLevelingUp = false;
    this.stage = 1;
    this.stageTimer = STAGE_DURATION_SEC;
    this.kills = 0;
    this.totalCrystals = 0;
    this.transitioning = false;
    this.enemies = [];
    this.crystals = [];
    this.orbSprites = [];
    this.orbAngle = 0;
    this.auraCircle = null;
    this.attackSprite = null;
    this.attackTimer = 0;
    this.spawnCooldown = 0;

    // Сброс навыков
    this.skills = {
      sword: 1,
      orbs: 0,
      aura: 0,
      smite: 0,
      boots: 0,
      heart: 0,
      magnet: 0,
    };

    // 1. Бесконечная карта (TileSprite)
    this.floorTile = this.add.tileSprite(0, 0, width, height, 'floor')
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(0);

    // 2. Игрок
    this.player = this.add.image(0, 0, 'player').setDepth(10);

    // 3. Камера плавно следует за Принцем
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);

    // 4. Интерфейс (зафиксирован на экране через setScrollFactor(0))
    this.buildFixedUI(width, height);

    // 5. Управление
    this.setupControls();

    // 6. Таймер обратного отсчёта зала (раз в секунду)
    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => this.tickSecond(),
    });
  }

  // ---------------------------------------------------------------
  // ОСНОВНОЙ ЦИКЛ ОБНОВЛЕНИЯ (каждый кадр)
  // ---------------------------------------------------------------
  update(time: number, delta: number): void {
    if (this.isLevelingUp || this.playerHP <= 0 || this.transitioning) {
      return;
    }

    const sec = delta / 1000;

    // Сдвиг бесконечного пола синхронно с камерой
    this.floorTile.tilePositionX = this.cameras.main.scrollX;
    this.floorTile.tilePositionY = this.cameras.main.scrollY;

    // 1. Движение игрока
    this.handleMovement(sec);

    // 2. Оружие и авто-атаки
    this.updateWeapons(time, sec);

    // 3. Таймер визуализации удара
    this.updateAttackVisual(delta);

    // 4. Поведение и движение орды врагов
    this.updateEnemies(time, sec);

    // 5. Сбор кристаллов опыта
    this.updateCrystals(sec);

    // 6. Спавн врагов по таймеру
    this.updateEnemySpawning(delta);
  }

  // ================================================================
  // ДВИЖЕНИЕ И УПРАВЛЕНИЕ
  // ================================================================
  private setupControls(): void {
    if (!this.input.keyboard) throw new Error('Keyboard unavailable');

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.W,
      down:  Phaser.Input.Keyboard.KeyCodes.S,
      left:  Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;

    this.keyZ = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.keyX = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyShift = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

    // Клавиши быстрого выбора навыков
    this.key1 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.key2 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    this.key3 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);

    // Ручной удар кликом мыши
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown() && !this.isLevelingUp) {
        this.manualSlash();
      }
    });
  }

  private handleMovement(sec: number): void {
    let dx = 0;
    let dy = 0;

    if (this.cursors.left.isDown  || this.wasd.left.isDown)  { dx -= 1; this.facingX = -1; this.facingY = 0; }
    if (this.cursors.right.isDown || this.wasd.right.isDown) { dx += 1; this.facingX =  1; this.facingY = 0; }
    if (this.cursors.up.isDown    || this.wasd.up.isDown)    { dy -= 1; this.facingX = 0;  this.facingY = -1; }
    if (this.cursors.down.isDown  || this.wasd.down.isDown)  { dy += 1; this.facingX = 0;  this.facingY =  1; }

    // Поворот спрайта
    if (this.facingX < 0) this.player.setFlipX(true);
    else if (this.facingX > 0) this.player.setFlipX(false);

    // Блок
    this.isBlocking = this.keyX.isDown || this.keyShift.isDown;
    this.blockLabel.setText(this.isBlocking ? '🛡 БЛОК (-70% урона)' : '');

    // Движение без ограничений — бесконечный мир!
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      const speed = this.isBlocking ? this.playerSpeed * 0.45 : this.playerSpeed;
      this.player.x += (dx / len) * speed * sec;
      this.player.y += (dy / len) * speed * sec;
    }

    // Ручной взмах мечом по пробелу или Z
    if (Phaser.Input.Keyboard.JustDown(this.keySpace) || Phaser.Input.Keyboard.JustDown(this.keyZ)) {
      this.manualSlash();
    }
  }

  // ================================================================
  // СИСТЕМА ОРУЖИЯ (VAMPIRE SURVIVORS)
  // ================================================================
  private updateWeapons(time: number, sec: number): void {
    // 1. АВТО-УДАР КЛИНКОМ (Священный Меч)
    const swordLvl = this.skills.sword;
    const swordCooldown = Math.max(280, BASE_SWORD_COOLDOWN - (swordLvl - 1) * 60);

    if (time - this.lastSwordTime > swordCooldown) {
      // Ищем ближайшего врага
      const target = this.getClosestEnemy(190);
      if (target) {
        this.lastSwordTime = time;
        const dirX = target.sprite.x - this.player.x;
        const dirY = target.sprite.y - this.player.y;
        const len = Math.hypot(dirX, dirY) || 1;
        this.facingX = dirX / len;
        this.facingY = dirY / len;
        this.performSlash(BASE_SWORD_DAMAGE + (swordLvl - 1) * 15, 80 + swordLvl * 6);
      }
    }

    // 2. ОРБИТАЛЬНЫЕ СФЕРЫ СВЕТА
    const orbCount = this.skills.orbs;
    if (orbCount > 0) {
      this.syncOrbSprites(orbCount);
      const orbSpeed = 3.5 + orbCount * 0.4;
      this.orbAngle += orbSpeed * sec;
      const orbRadius = 78;

      for (let i = 0; i < this.orbSprites.length; i++) {
        const angle = this.orbAngle + (i * 2 * Math.PI) / orbCount;
        const ox = this.player.x + Math.cos(angle) * orbRadius;
        const oy = this.player.y + Math.sin(angle) * orbRadius;
        this.orbSprites[i].setPosition(ox, oy);

        // Столкновение сфер с врагами
        for (const enemy of this.enemies) {
          if (!enemy.alive) continue;
          const dist = Phaser.Math.Distance.Between(ox, oy, enemy.sprite.x, enemy.sprite.y);
          if (dist < 32 && time - enemy.lastOrbHitTime > 320) {
            enemy.lastOrbHitTime = time;
            enemy.hp -= 20 + orbCount * 6;
            enemy.sprite.setTint(0x38bdf8);
            if (enemy.hp <= 0) this.killEnemy(enemy);
          }
        }
      }
    }

    // 3. СВЯЩЕННАЯ АУРА (кольцо постоянного урона вокруг героя)
    const auraLvl = this.skills.aura;
    if (auraLvl > 0) {
      const auraRadius = 80 + auraLvl * 18;
      if (!this.auraCircle) {
        this.auraCircle = this.add.circle(this.player.x, this.player.y, auraRadius, 0x38bdf8, 0.16)
          .setStrokeStyle(2, 0x60a5fa, 0.5)
          .setDepth(4);
      }
      this.auraCircle.setPosition(this.player.x, this.player.y);
      this.auraCircle.setRadius(auraRadius);

      // Тик урона ауры каждые 400 мс
      if (time - this.lastAuraTick > 400) {
        this.lastAuraTick = time;
        for (const enemy of this.enemies) {
          if (!enemy.alive) continue;
          const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.sprite.x, enemy.sprite.y);
          if (dist < auraRadius) {
            enemy.hp -= 10 + auraLvl * 5;
            enemy.sprite.setTint(0x93c5fd);
            if (enemy.hp <= 0) this.killEnemy(enemy);
          }
        }
      }
    }

    // 4. КАРА НЕБЕС (Молния)
    const smiteLvl = this.skills.smite;
    if (smiteLvl > 0) {
      const smiteCooldown = Math.max(1200, 3000 - smiteLvl * 400);
      if (time - this.lastSmiteTime > smiteCooldown) {
        const target = this.getClosestEnemy(360);
        if (target) {
          this.lastSmiteTime = time;
          this.strikeLightning(target, 55 + smiteLvl * 25);
        }
      }
    }

    // 5. РЕГЕНЕРАЦИЯ (Сердце)
    const heartLvl = this.skills.heart;
    if (heartLvl > 0) {
      // Пассивное лечение +1 HP каждые 2 секунды за уровень
      if (time % 2000 < 20) {
        this.healPlayer(heartLvl * 2);
      }
    }
  }

  private syncOrbSprites(count: number): void {
    while (this.orbSprites.length < count) {
      const s = this.add.image(this.player.x, this.player.y, 'orb').setDepth(12);
      this.orbSprites.push(s);
    }
    while (this.orbSprites.length > count) {
      const s = this.orbSprites.pop();
      s?.destroy();
    }
  }

  private strikeLightning(target: Enemy, damage: number): void {
    const bolt = this.add.image(target.sprite.x, target.sprite.y - 30, 'lightning').setDepth(18);
    this.cameras.main.shake(120, 0.007);
    target.hp -= damage;
    target.sprite.setTint(0xffffff);

    this.time.delayedCall(160, () => {
      bolt.destroy();
      if (target.hp <= 0) this.killEnemy(target);
    });
  }

  private manualSlash(): void {
    const swordLvl = this.skills.sword;
    this.performSlash(BASE_SWORD_DAMAGE + (swordLvl - 1) * 15, 80 + swordLvl * 6);
  }

  private performSlash(damage: number, reach: number): void {
    if (this.attackSprite) this.attackSprite.destroy();

    const hx = this.player.x + this.facingX * reach;
    const hy = this.player.y + this.facingY * reach;

    this.attackSprite = this.add.image(hx, hy, 'slash').setDepth(15);
    const angle = Math.atan2(this.facingY, this.facingX);
    this.attackSprite.setRotation(angle);
    this.attackTimer = 130;

    // Нанесение урона врагам в конусе атаки
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const dist = Phaser.Math.Distance.Between(hx, hy, enemy.sprite.x, enemy.sprite.y);
      if (dist < reach + 28) {
        enemy.hp -= damage;
        enemy.sprite.setTint(0xffffff);
        enemy.sprite.x += this.facingX * 22;
        enemy.sprite.y += this.facingY * 22;
        if (enemy.hp <= 0) this.killEnemy(enemy);
      }
    }
  }

  private updateAttackVisual(delta: number): void {
    if (this.attackTimer > 0) {
      this.attackTimer -= delta;
      if (this.attackTimer <= 0) {
        this.attackSprite?.destroy();
        this.attackSprite = null;
      }
    }
  }

  private getClosestEnemy(maxRange: number): Enemy | null {
    let closest: Enemy | null = null;
    let minDist = maxRange;

    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.sprite.x, e.sprite.y);
      if (d < minDist) {
        minDist = d;
        closest = e;
      }
    }
    return closest;
  }

  // ================================================================
  // СПАВН ВРАГОВ И ВОЛНЫ (ВЫСОКАЯ СЛОЖНОСТЬ)
  // ================================================================
  private updateEnemySpawning(delta: number): void {
    this.spawnCooldown -= delta;
    if (this.spawnCooldown <= 0) {
      // Частота спавна ускоряется с течением времени зала
      const progress = (STAGE_DURATION_SEC - this.stageTimer) / STAGE_DURATION_SEC; // 0.0 -> 1.0

      // Интервал спавна от 700мс до 220мс к концу минуты!
      const baseInterval = Math.max(220, 750 - progress * 480 - (this.stage - 1) * 120);
      this.spawnCooldown = baseInterval;

      // Количество спавнящихся за раз врагов
      const count = progress > 0.75 ? 3 : progress > 0.4 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        this.spawnSingleEnemy(progress);
      }
    }
  }

  private spawnSingleEnemy(progress: number): void {
    // Враги появляются по кругу за краем экрана (на расстоянии 550–650px)
    const angle = Math.random() * Math.PI * 2;
    const distance = Phaser.Math.Between(550, 650);
    const x = this.player.x + Math.cos(angle) * distance;
    const y = this.player.y + Math.sin(angle) * distance;

    // Выбор типа врага в зависимости от времени
    let type: EnemyType = 'guard';
    const roll = Math.random();

    if (progress > 0.65 && roll < 0.15) {
      type = 'commander'; // Крупный элитный рыцарь
    } else if (progress > 0.25 && roll < 0.5) {
      type = 'scout';     // Быстрый летучий бес
    }

    const sprite = this.add.image(x, y, type === 'commander' ? 'guard' : type).setDepth(8);
    if (type === 'commander') {
      sprite.setScale(1.4);
      sprite.setTint(0xfacc15); // Золотой оттенок для командира
    }

    const bw = type === 'commander' ? 44 : type === 'guard' ? 34 : 26;
    const hpBarBg = this.add.rectangle(x, y - 28, bw + 2, 6, 0x0f172a).setDepth(11);
    const hpBar = this.add.rectangle(x, y - 28, bw, 4, 0x22c55e).setDepth(12);

    const stageMultiplier = 1 + (this.stage - 1) * 0.35;
    let maxHp = GUARD_BASE_HP;
    let speed = GUARD_BASE_SPEED;
    let damage = GUARD_BASE_DAMAGE;

    if (type === 'scout') {
      maxHp = SCOUT_BASE_HP * stageMultiplier;
      speed = SCOUT_BASE_SPEED * (1 + (this.stage - 1) * 0.1);
      damage = SCOUT_BASE_DAMAGE * stageMultiplier;
    } else if (type === 'commander') {
      maxHp = COMMANDER_BASE_HP * stageMultiplier;
      speed = COMMANDER_BASE_SPEED;
      damage = COMMANDER_BASE_DAMAGE * stageMultiplier;
    } else {
      maxHp = GUARD_BASE_HP * stageMultiplier;
      speed = GUARD_BASE_SPEED * (1 + (this.stage - 1) * 0.1);
      damage = GUARD_BASE_DAMAGE * stageMultiplier;
    }

    this.enemies.push({
      sprite,
      hpBarBg,
      hpBar,
      type,
      hp: maxHp,
      maxHp,
      speed,
      damage,
      lastHitTime: 0,
      lastOrbHitTime: 0,
      alive: true,
    });
  }

  // ================================================================
  // ПОВЕДЕНИЕ ВРАГОВ
  // ================================================================
  private updateEnemies(time: number, sec: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;

      const dx = this.player.x - enemy.sprite.x;
      const dy = this.player.y - enemy.sprite.y;
      const dist = Math.hypot(dx, dy);

      // Разворот в сторону игрока
      enemy.sprite.setFlipX(dx < 0);

      // Движение к Принцу
      if (dist > 2) {
        enemy.sprite.x += (dx / dist) * enemy.speed * sec;
        enemy.sprite.y += (dy / dist) * enemy.speed * sec;
      }

      // Позиция HP-бара
      const barY = enemy.sprite.y - (enemy.type === 'commander' ? 38 : 28);
      enemy.hpBarBg.setPosition(enemy.sprite.x, barY);
      enemy.hpBar.setPosition(enemy.sprite.x, barY);

      const ratio = Math.max(0, enemy.hp / enemy.maxHp);
      const baseW = enemy.hpBarBg.width - 2;
      enemy.hpBar.setSize(baseW * ratio, 4);
      enemy.hpBar.setFillStyle(ratio > 0.5 ? 0x22c55e : ratio > 0.25 ? 0xf59e0b : 0xef4444);

      if (enemy.sprite.isTinted && enemy.type !== 'commander') {
        enemy.sprite.clearTint();
      }

      // Нанесение урона игроку при контакте
      const hitRadius = enemy.type === 'commander' ? 44 : 34;
      if (dist < hitRadius && time - enemy.lastHitTime > 750) {
        enemy.lastHitTime = time;
        this.damagePlayer(enemy.damage);
      }
    }
  }

  private killEnemy(enemy: Enemy): void {
    enemy.alive = false;
    this.kills++;

    // Выпадение кристаллов (из командира выпадает 3 кристалла)
    const gemCount = enemy.type === 'commander' ? 3 : 1;
    for (let i = 0; i < gemCount; i++) {
      const ox = enemy.sprite.x + (Math.random() - 0.5) * 24;
      const oy = enemy.sprite.y + (Math.random() - 0.5) * 24;
      this.spawnCrystal(ox, oy, enemy.type === 'commander' ? 15 : 6);
    }

    enemy.hpBar.destroy();
    enemy.hpBarBg.destroy();
    enemy.sprite.destroy();
    this.updateStatsUI();
  }

  // ================================================================
  // КРИСТАЛЛЫ И ОПЫТ (XP)
  // ================================================================
  private spawnCrystal(x: number, y: number, xpValue: number): void {
    const sprite = this.add.image(x, y, 'crystal').setDepth(6);
    if (xpValue > 6) sprite.setScale(1.3);
    this.crystals.push({ sprite, x, y, xpValue, collected: false });
  }

  private updateCrystals(sec: number): void {
    const magnetRadius = BASE_MAGNET_RADIUS + this.skills.magnet * 65;

    for (const c of this.crystals) {
      if (c.collected) continue;

      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, c.sprite.x, c.sprite.y);

      // Магнитное притягивание
      if (dist < magnetRadius) {
        const dx = this.player.x - c.sprite.x;
        const dy = this.player.y - c.sprite.y;
        const spd = 360 + (1 - dist / magnetRadius) * 250;
        c.sprite.x += (dx / dist) * spd * sec;
        c.sprite.y += (dy / dist) * spd * sec;
      }

      // Сбор
      if (dist < 32) {
        c.collected = true;
        c.sprite.destroy();
        this.totalCrystals++;
        this.addXP(c.xpValue);
      }
    }
    this.crystals = this.crystals.filter((c) => !c.collected);
  }

  private addXP(amount: number): void {
    this.currentXP += amount;
    if (this.currentXP >= this.nextLevelXP) {
      this.currentXP -= this.nextLevelXP;
      this.playerLevel++;
      this.nextLevelXP = Math.floor(this.nextLevelXP * 1.5);
      this.triggerLevelUp();
    }
    this.updateXpUI();
  }

  // ================================================================
  // МЕНЮ ПРОКАЧКИ НАВЫКОВ (LEVEL UP MODAL)
  // ================================================================
  private triggerLevelUp(): void {
    this.isLevelingUp = true;
    const { width, height } = this.scale;

    // Контейнер поверх экрана
    this.upgradeModalContainer = this.add.container(0, 0).setScrollFactor(0).setDepth(100);

    // Полупрозрачный тёмный фон
    const bg = this.add.rectangle(width / 2, height / 2, width, height, 0x050814, 0.82)
      .setInteractive(); // блокирует клики под меню
    this.upgradeModalContainer.add(bg);

    // Золотой заголовок
    const title = this.add.text(width / 2, height * 0.16, `✦  УРОВЕНЬ ${this.playerLevel}!  ✦`, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '38px',
      color: '#facc15',
      fontStyle: 'bold',
      stroke: '#78350f',
      strokeThickness: 5,
    }).setOrigin(0.5);
    this.upgradeModalContainer.add(title);

    const subtitle = this.add.text(width / 2, height * 0.24, 'Выберите божественный дар для усиления:', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      color: '#cbd5e1',
    }).setOrigin(0.5);
    this.upgradeModalContainer.add(subtitle);

    // Выбираем 3 случайных доступных навыка
    const offeredSkills = this.getRandomSkills(3);

    // Отрисовка 3 карточек выбора
    const cardW = 240;
    const cardH = 260;
    const spacing = 32;
    const startX = width / 2 - (cardW * 3 + spacing * 2) / 2 + cardW / 2;

    offeredSkills.forEach((skill, idx) => {
      const cx = startX + idx * (cardW + spacing);
      const cy = height * 0.58;
      const curLvl = this.skills[skill.id];
      const nextLvl = curLvl + 1;

      // Фон карточки
      const cardBg = this.add.rectangle(cx, cy, cardW, cardH, 0x1e1b4b)
        .setStrokeStyle(2, 0x6366f1)
        .setInteractive({ useHandCursor: true });

      // Наведение на карточку
      cardBg.on('pointerover', () => {
        cardBg.setFillStyle(0x312e81);
        cardBg.setStrokeStyle(3, 0xfacc15);
      });
      cardBg.on('pointerout', () => {
        cardBg.setFillStyle(0x1e1b4b);
        cardBg.setStrokeStyle(2, 0x6366f1);
      });
      cardBg.on('pointerdown', () => this.selectUpgrade(skill.id));

      // Иконка и клавиша
      const numKey = this.add.text(cx, cy - 90, `[ ${idx + 1} ]  ${skill.icon}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '26px',
        color: '#fde047',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      // Название навыка
      const skillName = this.add.text(cx, cy - 40, skill.name, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '17px',
        color: '#ffffff',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: cardW - 20 },
      }).setOrigin(0.5);

      // Уровень
      const lvlText = this.add.text(cx, cy - 10, curLvl === 0 ? '✨ НОВЫЙ ДАР' : `Уровень: ${curLvl} ➔ ${nextLvl}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        color: '#38bdf8',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      // Описание эффекта
      const desc = this.add.text(cx, cy + 45, skill.getDescription(nextLvl), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        color: '#94a3b8',
        align: 'center',
        wordWrap: { width: cardW - 30 },
        lineSpacing: 4,
      }).setOrigin(0.5);

      this.upgradeModalContainer?.add([cardBg, numKey, skillName, lvlText, desc]);
    });

    // Клавиши 1, 2, 3 для быстрого выбора с гарантированным снятием обработчика
    const onKey = (event: KeyboardEvent) => {
      if (!this.isLevelingUp) return;
      if ((event.code === 'Digit1' || event.key === '1') && offeredSkills[0]) {
        cleanup();
        this.selectUpgrade(offeredSkills[0].id);
      } else if ((event.code === 'Digit2' || event.key === '2') && offeredSkills[1]) {
        cleanup();
        this.selectUpgrade(offeredSkills[1].id);
      } else if ((event.code === 'Digit3' || event.key === '3') && offeredSkills[2]) {
        cleanup();
        this.selectUpgrade(offeredSkills[2].id);
      }
    };

    const cleanup = () => {
      window.removeEventListener('keydown', onKey);
    };

    window.addEventListener('keydown', onKey);
  }

  private selectUpgrade(skillId: string): void {
    this.skills[skillId] = (this.skills[skillId] || 0) + 1;

    // Применение пассивных характеристик
    if (skillId === 'boots') {
      this.playerSpeed = BASE_PLAYER_SPEED * (1 + this.skills.boots * 0.15);
    } else if (skillId === 'heart') {
      this.playerMaxHP = BASE_PLAYER_MAX_HP + this.skills.heart * 25;
      this.healPlayer(25);
    }

    // Закрываем модальное окно
    this.upgradeModalContainer?.destroy();
    this.upgradeModalContainer = null;
    this.isLevelingUp = false;
    this.updateHpUI();
  }

  private getRandomSkills(count: number): SkillDef[] {
    const allSkills: SkillDef[] = [
      {
        id: 'sword',
        name: 'Священный Меч',
        icon: '🗡',
        maxLevel: 5,
        getDescription: (lvl) => `+15 к урону меча\n+10% к радиусу\nАвто-удар чаще`,
      },
      {
        id: 'orbs',
        name: 'Орбитальные Сферы',
        icon: '🔮',
        maxLevel: 4,
        getDescription: (lvl) => `+1 сияющая сфера вокруг Принца\nНаносит урон при касании`,
      },
      {
        id: 'aura',
        name: 'Аура Света',
        icon: '⚡',
        maxLevel: 4,
        getDescription: (lvl) => `Постоянное сияющее кольцо вокруг героя\nУрон врагам в радиусе`,
      },
      {
        id: 'smite',
        name: 'Кара Небес',
        icon: '🌩',
        maxLevel: 4,
        getDescription: (lvl) => `Удары молнии из небес по врагам\nОгромный урон по площади`,
      },
      {
        id: 'boots',
        name: 'Крылья Свободы',
        icon: '👟',
        maxLevel: 4,
        getDescription: (lvl) => `+15% к скорости бега Принца\nЛегче кайтить толпу`,
      },
      {
        id: 'heart',
        name: 'Сердце Смертного',
        icon: '💖',
        maxLevel: 4,
        getDescription: (lvl) => `+25 к максимальному здоровью\n+Пассивная регенерация HP`,
      },
      {
        id: 'magnet',
        name: 'Магнит Света',
        icon: '🧲',
        maxLevel: 3,
        getDescription: (lvl) => `+65% к радиусу притягивания кристаллов опыта`,
      },
    ];

    // Фильтруем те, которые ещё не достигли максимального уровня
    const available = allSkills.filter((s) => (this.skills[s.id] || 0) < s.maxLevel);
    Phaser.Utils.Array.Shuffle(available);
    return available.slice(0, count);
  }

  // ================================================================
  // ТАЙМЕР ЗАЛА И ПЕРЕХОДЫ
  // ================================================================
  private tickSecond(): void {
    if (this.isLevelingUp || this.playerHP <= 0 || this.transitioning) return;

    this.stageTimer--;
    const min = Math.floor(this.stageTimer / 60);
    const sec = this.stageTimer % 60;
    this.timerText.setText(`⏳ ${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`);

    if (this.stageTimer <= 0) {
      this.clearStage();
    }
  }

  private clearStage(): void {
    this.transitioning = true;

    // Уничтожаем всех врагов волны и превращаем их в опыт
    for (const e of this.enemies) {
      if (e.alive) {
        this.spawnCrystal(e.sprite.x, e.sprite.y, 10);
        e.hpBar.destroy();
        e.hpBarBg.destroy();
        e.sprite.destroy();
      }
    }
    this.enemies = [];

    if (this.stage >= TOTAL_STAGES) {
      // Победа во всей игре!
      this.endGame(true);
      return;
    }

    const { width, height } = this.scale;
    const banner = this.add.text(width / 2, height / 2, `✦  ЗАЛ ${this.stage} ВЫДЕРЖАН!  ✦`, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '40px',
      color: '#86efac',
      fontStyle: 'bold',
      stroke: '#064e3b',
      strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(50);

    this.time.delayedCall(2000, () => {
      banner.destroy();
      this.stage++;
      this.stageTimer = STAGE_DURATION_SEC;
      this.stageText.setText(`✦ Зал ${this.stage}/${TOTAL_STAGES} ✦`);

      // Полное восстановление HP в конце зала
      this.playerHP = this.playerMaxHP;
      this.updateHpUI();

      this.transitioning = false;
    });
  }

  private damagePlayer(rawDmg: number): void {
    const now = this.time.now;
    if (now - this.lastDamageTime < 500) return;
    this.lastDamageTime = now;

    const dmg = this.isBlocking ? Math.max(1, Math.round(rawDmg * 0.3)) : rawDmg;
    this.playerHP = Math.max(0, this.playerHP - dmg);

    this.player.setTint(this.isBlocking ? 0x38bdf8 : 0xef4444);
    this.time.delayedCall(120, () => {
      if (this.player) this.player.clearTint();
    });

    if (!this.isBlocking) {
      this.cameras.main.shake(140, 0.009);
    }

    this.updateHpUI();

    if (this.playerHP <= 0) {
      this.endGame(false);
    }
  }

  private healPlayer(amount: number): void {
    this.playerHP = Math.min(this.playerMaxHP, this.playerHP + amount);
    this.updateHpUI();
  }

  private endGame(victory: boolean): void {
    this.transitioning = true;
    const data: GameOverData = {
      roomsCleared: victory ? this.stage : this.stage - 1,
      kills: this.kills,
      victory,
      level: this.playerLevel,
      crystals: this.totalCrystals,
    };
    this.time.delayedCall(700, () => {
      this.scene.start('GameOverScene', data);
    });
  }

  // ================================================================
  // ЗАФИКСИРОВАННЫЙ ИНТЕРФЕЙС (setScrollFactor(0))
  // ================================================================
  private buildFixedUI(width: number, height: number): void {
    // 1. Верхняя полоса Опыта (XP) через весь экран
    this.add.rectangle(width / 2, 8, width, 14, 0x0f172a).setScrollFactor(0).setDepth(40);
    this.xpFill = this.add.rectangle(0, 8, 0, 10, 0x38bdf8)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(41);
    this.xpText = this.add.text(width / 2, 8, 'LVL 1 — 0%', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '11px',
      color: '#f8fafc',
      fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(42);

    // 2. Здоровье игрока
    this.add.rectangle(110, 34, 184, 18, 0x0f172a).setScrollFactor(0).setDepth(40);
    this.hpFill = this.add.rectangle(110, 34, 178, 12, 0x22c55e).setScrollFactor(0).setDepth(41);
    this.hpText = this.add.text(24, 26, `HP 100/100`, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '13px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(42);

    // 3. Таймер по центру
    this.timerText = this.add.text(width / 2, 28, '⏳ 01:00', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '22px',
      color: '#facc15',
      fontStyle: 'bold',
      stroke: '#0f172a',
      strokeThickness: 4,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(40);

    this.stageText = this.add.text(width / 2, 54, `✦ Зал 1/${TOTAL_STAGES} ✦`, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '12px',
      color: '#94a3b8',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(40);

    // 4. Счётчик кристаллов и убийств
    this.statsText = this.add.text(width - 24, 28, '💎 0  |  ⚔ 0', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '16px',
      color: '#38bdf8',
      fontStyle: 'bold',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(40);

    // 5. Подсказка снизу
    this.add.text(
      width / 2,
      height - 12,
      'WASD / Стрелки — бег  |  ПРОБЕЛ / Клик — удар  |  X / SHIFT — блок (-70% урона)',
      {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        color: '#64748b',
      },
    ).setOrigin(0.5, 1).setScrollFactor(0).setDepth(40);

    // 6. Индикатор блока
    this.blockLabel = this.add.text(width - 24, height - 36, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '16px',
      color: '#38bdf8',
      fontStyle: 'bold',
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(40);
  }

  private updateXpUI(): void {
    const ratio = Math.min(1, this.currentXP / this.nextLevelXP);
    const { width } = this.scale;
    this.xpFill.setSize(width * ratio, 10);
    this.xpText.setText(`LVL ${this.playerLevel} — ${Math.floor(ratio * 100)}%`);
  }

  private updateHpUI(): void {
    const ratio = Math.max(0, this.playerHP / this.playerMaxHP);
    this.hpFill.setSize(178 * ratio, 12);
    this.hpFill.setFillStyle(ratio > 0.5 ? 0x22c55e : ratio > 0.25 ? 0xf59e0b : 0xef4444);
    this.hpText.setText(`HP ${this.playerHP}/${this.playerMaxHP}`);
  }

  private updateStatsUI(): void {
    this.statsText.setText(`💎 ${this.totalCrystals}  |  ⚔ ${this.kills}`);
  }
}
